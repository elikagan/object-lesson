import { test, expect } from '@playwright/test';

/**
 * Production smoke tests — read-only assertions against the LIVE production
 * URL after every Vercel deploy. Triggered by .github/workflows/post-deploy.yml.
 *
 * If anything here fails, an issue is auto-opened and Eli is paged.
 *
 * Rules:
 *   - Read-only. Never POST/PATCH/DELETE in production.
 *   - Test file is run with PLAYWRIGHT_BASE_URL=https://objectlesson.la, which
 *     skips the local webServer and hits production directly.
 *   - Keep these tests fast and stable. Flaky tests defeat the purpose.
 */

const PROD = process.env.PLAYWRIGHT_BASE_URL || 'https://objectlesson.la';

test.describe('production smoke', () => {
  test('homepage returns 200 and shows product cards', async ({ page }) => {
    const res = await page.goto(PROD);
    expect(res?.status()).toBe(200);
    await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 });
  });

  test('admin lock screen renders', async ({ page }) => {
    const res = await page.goto(PROD + '/admin');
    expect(res?.status()).toBe(200);
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('sitemap.xml is valid XML with item URLs', async ({ request }) => {
    const res = await request.get(PROD + '/sitemap.xml');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain('<?xml');
    expect(body).toContain('<urlset');
    expect(body).toMatch(/objectlesson\.la\/item\//);
  });

  test('robots.txt returns 200', async ({ request }) => {
    const res = await request.get(PROD + '/robots.txt');
    expect(res.status()).toBe(200);
  });

  test('about page renders with Pasadena address', async ({ page }) => {
    const res = await page.goto(PROD + '/about');
    expect(res?.status()).toBe(200);
    await expect(page.getByText(/Pasadena/i).first()).toBeVisible();
  });

  test('gift page renders form with amount field', async ({ page }) => {
    const res = await page.goto(PROD + '/gift');
    expect(res?.status()).toBe(200);
    // amount input is the primary form field
    await expect(page.locator('input[type="number"]').first()).toBeVisible();
  });

  test('IndexNow key file is reachable', async ({ request }) => {
    const res = await request.get(PROD + '/a1b2c3d4e5f6g7h8objectlesson.txt');
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.trim()).toBe('a1b2c3d4e5f6g7h8objectlesson');
  });

  test('item detail page renders for a known active item', async ({ page }) => {
    // Navigate from homepage to first product to avoid hard-coding an item id.
    await page.goto(PROD);
    const firstCard = page.locator('.card').first();
    await firstCard.waitFor({ state: 'visible', timeout: 10_000 });
    await firstCard.click();
    await expect(page.locator('.detail-title')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.detail-price')).toBeVisible();
  });

  test('admin lock screen does NOT contain stub links to v1 admin URLs', async ({ page }) => {
    // Sanity: even before login, no element should have an href that points
    // back to /admin/#analytics etc. (the v1-stub bug pattern). The lock
    // screen is public; menu HTML lives behind auth, so this only catches
    // accidental leaks. The full check belongs in the v1 parity suite.
    await page.goto(PROD + '/admin');
    const html = await page.content();
    expect(html).not.toMatch(/objectlesson\.la\/admin\/#(analytics|sales|giftcerts|marketing)/i);
  });
});
