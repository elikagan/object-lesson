import { test, expect } from '@playwright/test';

/**
 * P0-11 — email gate before Buy Now.
 *
 * Spec (from v1 app.js:317-396, mirrored in v2 components/ItemDetail.tsx):
 *   - First-time buyer (no `ol_email_collected` in localStorage) clicks
 *     Buy Now → gate appears.
 *   - On submit: insert into `emails` with source='abandoned_cart' and
 *     item_id set, then set `ol_email_collected=1` AND
 *     `ol_email_dismissed=1`, then proceed to checkout.
 *   - Subsequent buys (with `ol_email_collected` already set) skip the
 *     gate and go straight to checkout.
 */

async function findBuyableItemHref(
  page: import('@playwright/test').Page,
): Promise<string | null> {
  await page.goto('/');
  const hrefs = await page
    .locator('a[href^="/item/"]')
    .evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => a.getAttribute('href') ?? ''));
  for (const href of hrefs.slice(0, 20)) {
    if (!href) continue;
    await page.goto(href);
    const buyVisible = await page
      .locator('.detail-buy')
      .first()
      .isVisible()
      .catch(() => false);
    if (buyVisible) return href;
  }
  return null;
}

test('first-time buyer sees the email gate when clicking Buy Now', async ({ page }) => {
  const href = await findBuyableItemHref(page);
  test.skip(!href, 'no buyable items in inventory to test against');

  // Fresh session: clear localStorage on the origin.
  await page.evaluate(() => localStorage.clear());
  await page.goto(href!);

  await page.locator('.detail-buy').click();
  await expect(page.locator('input.email-gate-input')).toBeVisible();
});

test('returning buyer skips the gate (ol_email_collected already set)', async ({ page }) => {
  const href = await findBuyableItemHref(page);
  test.skip(!href, 'no buyable items in inventory to test against');

  await page.goto(href!);
  await page.evaluate(() => {
    localStorage.setItem('ol_email_collected', '1');
    localStorage.setItem('ol_email_dismissed', '1');
  });

  // Intercept the checkout API so we don't hit Square.
  let checkoutCalled = false;
  await page.route('**/api/checkout', (route) => {
    checkoutCalled = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'about:blank' }),
    });
  });

  await page.locator('.detail-buy').click();

  await page.waitForTimeout(500);
  expect(checkoutCalled).toBe(true);
  expect(await page.locator('input.email-gate-input').count()).toBe(0);
});

test('email gate submit writes to emails table with source=abandoned_cart + item_id', async ({ page }) => {
  const href = await findBuyableItemHref(page);
  test.skip(!href, 'no buyable items in inventory to test against');
  const itemId = href!.replace('/item/', '');

  await page.goto(href!);
  await page.evaluate(() => localStorage.clear());

  // Capture the supabase rest-insert that the gate fires.
  let captured: { body: string | null } | null = null;
  await page.route('**/rest/v1/emails*', (route) => {
    captured = { body: route.request().postData() };
    return route.fulfill({ status: 201, body: '' });
  });
  // Stub /api/checkout so we don't hit Square.
  await page.route('**/api/checkout', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'about:blank' }),
    }),
  );

  await page.locator('.detail-buy').click();
  await expect(page.locator('.detail-email-gate')).toBeVisible();
  await page.locator('input.email-gate-input').fill(`test+${Date.now()}@playwright.invalid`);
  await page.locator('button.email-gate-btn').click();

  // Wait for the supabase insert.
  for (let i = 0; i < 50 && !captured; i++) {
    await page.waitForTimeout(100);
  }
  expect(captured).not.toBeNull();
  const cap = captured as unknown as { body: string | null };
  expect(cap.body).toBeTruthy();
  const parsed = JSON.parse(cap.body!);
  expect(parsed.source).toBe('abandoned_cart');
  expect(parsed.item_id).toBe(itemId);
});
