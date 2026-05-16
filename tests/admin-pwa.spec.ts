import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

/**
 * P2-28 — PWA service worker + manifest for admin offline shell.
 *
 * v1 had a manual SW (admin/sw.js) + manifest.json. v2 ports that to
 * public/admin-sw.js + public/admin-manifest.webmanifest, registered
 * by components/admin/AdminServiceWorker.tsx and scoped to /admin/
 * via the Service-Worker-Allowed header on /admin-sw.js.
 */

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

test('admin manifest is served with correct fields', async ({ request }) => {
  const res = await request.get('/admin-manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.name).toBe('Object Lesson Admin');
  expect(body.short_name).toBe('OL Admin');
  expect(body.start_url).toBe('/admin/');
  expect(body.scope).toBe('/admin/');
  expect(body.display).toBe('standalone');
  expect(body.icons).toBeInstanceOf(Array);
  expect(body.icons.length).toBeGreaterThan(0);
});

test('admin SW is served with Service-Worker-Allowed: /admin/', async ({ request }) => {
  const res = await request.get('/admin-sw.js');
  expect(res.ok()).toBe(true);
  const headers = res.headers();
  expect(headers['service-worker-allowed']).toBe('/admin/');
  const body = await res.text();
  // Sanity-check the SW contains the key strategy markers so we know
  // we're not shipping an empty file.
  expect(body).toMatch(/addEventListener\(['"]fetch['"]/);
  expect(body).toMatch(/CACHE_VERSION/);
});

test('admin page links to the manifest', async ({ page }) => {
  await login(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/admin-manifest.webmanifest');
});

test('admin page registers the service worker', async ({ page }) => {
  await login(page);
  // Wait for the SW registration to complete (useEffect → register → resolve).
  const reg = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null;
    // Wait up to 5s for the registration to finish.
    for (let i = 0; i < 50; i++) {
      const r = await navigator.serviceWorker.getRegistration('/admin/');
      if (r) {
        return {
          scope: r.scope,
          hasActiveOrInstalling: !!(r.active || r.installing || r.waiting),
        };
      }
      await new Promise((res) => setTimeout(res, 100));
    }
    return null;
  });
  expect(reg).not.toBeNull();
  expect(reg!.scope).toMatch(/\/admin\/$/);
  expect(reg!.hasActiveOrInstalling).toBe(true);
});
