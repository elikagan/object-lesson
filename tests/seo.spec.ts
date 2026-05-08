import { test, expect } from '@playwright/test';

/**
 * SEO smoke tests — sitemap, robots, structured data, IndexNow key file.
 */

test('sitemap.xml lists items + key pages', async ({ request }) => {
  const res = await request.get('http://localhost:3000/sitemap.xml');
  expect(res.ok()).toBe(true);
  const body = await res.text();
  expect(body).toMatch(/<urlset/);
  expect(body).toContain('/about');
  expect(body).toContain('/gift');
  expect(body).toMatch(/\/item\/\d+/); // at least one item URL
});

test('robots.txt allows everything except /admin and /api', async ({ request }) => {
  const res = await request.get('http://localhost:3000/robots.txt');
  expect(res.ok()).toBe(true);
  const body = await res.text();
  expect(body).toMatch(/User-[Aa]gent: \*/);
  expect(body).toMatch(/Disallow:.*\/admin/);
  expect(body).toMatch(/Disallow:.*\/api/);
  expect(body).toMatch(/Sitemap:/);
});

test('IndexNow key file is reachable', async ({ request }) => {
  const res = await request.get(
    'http://localhost:3000/a1b2c3d4e5f6g7h8objectlesson.txt',
  );
  expect(res.ok()).toBe(true);
  const body = await res.text();
  expect(body.trim()).toBe('a1b2c3d4e5f6g7h8objectlesson');
});

test('item page has Product JSON-LD structured data', async ({ page }) => {
  await page.goto('/');
  // Click first real item card
  const cards = page.locator('.card[href^="/item/0"]');
  await cards.first().waitFor({ state: 'visible' });
  const href = await cards.first().getAttribute('href');
  await page.goto(href!);
  // JSON-LD script in document head
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(ld).toBeTruthy();
  const parsed = JSON.parse(ld!);
  expect(parsed['@type']).toBe('Product');
  expect(parsed.name).toBeTruthy();
  expect(parsed.offers).toBeTruthy();
  expect(parsed.offers.priceCurrency).toBe('USD');
});

test('item page has canonical + OG meta', async ({ page }) => {
  await page.goto('/');
  const cards = page.locator('.card[href^="/item/0"]');
  await cards.first().waitFor({ state: 'visible' });
  const href = await cards.first().getAttribute('href');
  await page.goto(href!);
  // Canonical
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toContain('objectlesson.la');
  // OG image
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(ogImage).toBeTruthy();
});
