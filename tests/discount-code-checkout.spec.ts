import { test, expect } from '@playwright/test';

/**
 * P0-7 — Discount code apply at checkout.
 *
 * The full audit acceptance criteria (§3.3) ends at "Square shows
 * discounted total → on success used_count increments by 1". The
 * Square hosted checkout page is outside what Playwright can drive,
 * so this spec covers everything UP TO that step:
 *
 *   1. The discount field renders on a buyable detail page.
 *   2. A valid code shows the original price with a strikethrough
 *      and the discounted price in green next to it (CSS class
 *      `.detail-price.discounted` + `.detail-discount-price`).
 *   3. An invalid code shows a red error state and leaves the price
 *      untouched.
 *   4. The Buy Now click POSTs to /api/checkout with the discount
 *      code in the body.
 *
 * The two remaining manual steps (Square page renders the discount;
 * webhook fires and used_count increments) need a live Square test
 * purchase. This spec shrinks the manual scope to "click Buy and
 * verify the Square page" — the rest is mechanical.
 */

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

test.describe('P0-7 discount code at checkout', () => {
  let testCode: string;
  let createdDiscountId: string | number | null = null;

  test.beforeAll(async ({ request, browser }) => {
    // Log in once to mint an admin cookie so we can POST a throwaway
    // discount code via the admin API.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

    testCode = `_TESTPCT${Date.now()}`.toUpperCase().slice(0, 32);
    const res = await request.post('http://localhost:3000/api/admin/discounts', {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { code: testCode, type: 'percent', value: 10, max_uses: null },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { discount?: { id: string | number } };
    createdDiscountId = body.discount?.id ?? null;
    expect(createdDiscountId).not.toBeNull();
    await ctx.close();
  });

  test.afterAll(async ({ request, browser }) => {
    if (!createdDiscountId) return;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    // PATCH to soft-disable (no DELETE route on discounts); the row stays
    // inactive so subsequent test runs don't collide on the unique code.
    await request.patch(`http://localhost:3000/api/admin/discounts/${createdDiscountId}`, {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { is_active: false },
    });
    await ctx.close();
  });

  test('valid percent code shows strikethrough + discounted price', async ({ page }) => {
    // Pick the first buyable card on the homepage. Sold items have the
    // .card--sold class; hold items render a .card-hold badge inside.
    // We need an item that is NEITHER, otherwise the Buy button (and
    // therefore the discount UI) is hidden.
    await page.goto('/');
    // Filter to cards that are not sold, not on hold, and have a real
    // dollar price (>$0). Stale test items occasionally land in the
    // grid with price=0 and would silently hide the Buy button.
    const buyableCard = page
      .locator('.card:not(.card--sold)')
      .filter({ hasNot: page.locator('.card-hold') })
      .filter({ has: page.locator('.card-price', { hasText: /\$[1-9]/ }) })
      .first();
    await buyableCard.waitFor({ state: 'visible', timeout: 10000 });
    await buyableCard.click();
    await page.waitForURL('**/item/**');

    // Sanity check: the Buy button is present (filtering above should have
    // ensured this, but cards with $0 price would also hide it).
    const buy = page.locator('.detail-buy');
    if ((await buy.count()) === 0) {
      test.skip(true, 'no buyable item found in this environment');
    }
    await expect(page.locator('.discount-input')).toBeVisible();

    // Enter the test code + Apply.
    await page.locator('.discount-input').fill(testCode);
    await page.locator('.discount-apply').click();

    // After apply, the original price gets the .discounted class
    // (strikethrough) and the green .detail-discount-price appears.
    await expect(page.locator('.detail-price.discounted')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.detail-discount-price')).toBeVisible();

    // The applied-discount badge spells the code + "% off".
    const badge = page.locator('.discount-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(testCode);
    await expect(badge).toContainText(/10% off/);

    // Sanity check: the discounted number is strictly less than the original.
    const original = await page.locator('.detail-price').innerText();
    const discounted = await page.locator('.detail-discount-price').innerText();
    const num = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
    expect(num(discounted)).toBeLessThan(num(original));
    // 10% off ≈ 0.9× original (allow ±2 for rounding to whole dollars).
    expect(num(discounted)).toBeGreaterThanOrEqual(num(original) * 0.9 - 2);
    expect(num(discounted)).toBeLessThanOrEqual(num(original) * 0.9 + 2);
  });

  test('invalid code surfaces a red error and leaves the price intact', async ({ page }) => {
    await page.goto('/');
    // Filter to cards that are not sold, not on hold, and have a real
    // dollar price (>$0). Stale test items occasionally land in the
    // grid with price=0 and would silently hide the Buy button.
    const buyableCard = page
      .locator('.card:not(.card--sold)')
      .filter({ hasNot: page.locator('.card-hold') })
      .filter({ has: page.locator('.card-price', { hasText: /\$[1-9]/ }) })
      .first();
    await buyableCard.waitFor({ state: 'visible', timeout: 10000 });
    await buyableCard.click();
    await page.waitForURL('**/item/**');
    const buy = page.locator('.detail-buy');
    if ((await buy.count()) === 0) {
      test.skip(true, 'no buyable item found in this environment');
    }

    await page.locator('.discount-input').fill('_DEFINITELYNOTACODE_999');
    // Read the border-color in the same tick that the click resolves so
    // we catch the red state before the 2-second auto-reset. We use
    // Promise.all to interleave the click and the style read.
    const input = page.locator('.discount-input');
    const [, borderColor] = await Promise.all([
      page.locator('.discount-apply').click(),
      input.evaluate(async (el) => {
        // Wait briefly so the error state is committed to the DOM.
        for (let i = 0; i < 20; i++) {
          const c = getComputedStyle(el).borderColor;
          if (c.replace(/\s/g, '').match(/rgb\(204,0,0\)/)) return c;
          await new Promise((r) => setTimeout(r, 50));
        }
        return getComputedStyle(el).borderColor;
      }),
    ]);
    // The component sets border to '#c00' which renders as rgb(204, 0, 0).
    expect(borderColor.replace(/\s/g, '')).toMatch(/rgb\(204,0,0\)/);

    // No discounted price line shown.
    await expect(page.locator('.detail-discount-price')).toHaveCount(0);
    await expect(page.locator('.detail-price.discounted')).toHaveCount(0);
  });

  test('Buy Now POSTs /api/checkout with the discount code in the body', async ({ page }) => {
    await page.goto('/');
    // Filter to cards that are not sold, not on hold, and have a real
    // dollar price (>$0). Stale test items occasionally land in the
    // grid with price=0 and would silently hide the Buy button.
    const buyableCard = page
      .locator('.card:not(.card--sold)')
      .filter({ hasNot: page.locator('.card-hold') })
      .filter({ has: page.locator('.card-price', { hasText: /\$[1-9]/ }) })
      .first();
    await buyableCard.waitFor({ state: 'visible', timeout: 10000 });
    await buyableCard.click();
    await page.waitForURL('**/item/**');
    const buy = page.locator('.detail-buy');
    if ((await buy.count()) === 0) {
      test.skip(true, 'no buyable item found in this environment');
    }

    // Apply the discount.
    await page.locator('.discount-input').fill(testCode);
    await page.locator('.discount-apply').click();
    await expect(page.locator('.detail-price.discounted')).toBeVisible({ timeout: 5000 });

    // Intercept the /api/checkout call and stub its response so we don't
    // actually create a Square payment link during the test.
    const checkoutPromise = page.waitForRequest((req) =>
      req.url().includes('/api/checkout') && req.method() === 'POST',
    );
    await page.route('**/api/checkout', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://example.invalid/stubbed' }),
      }),
    );

    // If an email gate is in front of Buy Now, the click opens the gate
    // first. Submit a throwaway email and continue. The gate button is
    // `.email-gate-btn`, not a type=submit.
    await page.locator('.detail-buy').click();
    const emailField = page.locator('.email-gate-input');
    if ((await emailField.count()) > 0 && (await emailField.first().isVisible().catch(() => false))) {
      await emailField.fill(`test+${Date.now()}@example.invalid`);
      await page.locator('.email-gate-btn').click();
    }

    const req = await checkoutPromise;
    const body = req.postDataJSON() as { discountCode?: string };
    expect(body.discountCode).toBe(testCode);
  });
});
