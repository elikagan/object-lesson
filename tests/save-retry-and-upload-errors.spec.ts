import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';
const TEST_IMG = 'tests/fixtures/tiny.png';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

/**
 * Regression tests for two bugs Eli hit while posting an item with photos
 * + AI processing:
 *
 *   #1 — "After AI processed the photos, save failed with 'Photo upload
 *        failed. Photo upload failed.' (the error name appeared twice).
 *        The first save click also appeared to do nothing; second click
 *        triggered the error."
 *
 *        Root causes:
 *        (a) The upload route had no try/catch around sharp.resize();
 *            malformed image bytes (e.g. AI-returned PNGs sharp couldn't
 *            decode, or iPhone HEIC) threw uncaught, returning a generic
 *            500 with no JSON body.
 *        (b) On retry, the editor POSTed /api/admin/items again — duplicate
 *            id → 500 → user sees a fresh, unrelated error.
 *
 *        Fixes:
 *        - Route now per-file try/catch with specific error messages
 *          (filename, mime, size, hint about HEIC / AI-processed).
 *        - Editor tracks `rowCreated` and skips POST on retry.
 */

test('upload route returns a specific error for malformed image bytes (not just "Photo upload failed")', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Build a deliberately malformed "image" that claims to be jpeg but isn't.
  // sharp will throw decoding this.
  const fd = new FormData();
  const junkBlob = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])], { type: 'image/jpeg' });
  fd.append('files', junkBlob, 'corrupt.jpg');
  fd.append('slug', '_test_upload_error');
  fd.append('startIndex', '1');

  const res = await request.post('http://localhost:3000/api/admin/items/000999/images', {
    headers: { Cookie: cookieHeader },
    multipart: {
      files: { name: 'corrupt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]) },
      slug: '_test_upload_error',
      startIndex: '1',
    },
  });
  expect(res.status()).toBe(500);
  const body = await res.json();
  // The error message must NOT be the generic placeholder. It must name the
  // file and mention what to try.
  expect(body.error).toBeTruthy();
  expect(body.error).not.toBe('Photo upload failed');
  expect(body.error).toContain('photo 1');
  expect(body.error).toContain('corrupt.jpg');
});

test('editor retries cleanly: failed upload + second save click does NOT re-POST the item', async ({ page }) => {
  await login(page);
  await page.goto('/admin/items/new');
  await page.locator('input[placeholder="Item title"]').fill('_test_retry_' + Date.now());
  await page.locator('select').first().selectOption('misc');
  await page.locator('input[type="file"]').setInputFiles(TEST_IMG);
  await page.waitForSelector('.photo-cell img');

  // Count item POSTs across both save attempts.
  let postCount = 0;
  let uploadCount = 0;
  await page.route('**/api/admin/items', (route) => {
    if (route.request().method() === 'POST') postCount++;
    return route.continue();
  });
  // Force the FIRST upload to fail with a structured 500.
  await page.route('**/api/admin/items/*/images', (route) => {
    uploadCount++;
    if (uploadCount === 1) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not process photo 1 of 1: simulated failure for test' }),
      });
    }
    // Second attempt: let it through to the real handler.
    return route.continue();
  });

  // First save → POST + upload → upload fails → banner appears.
  await page.locator('button.btn-primary').click();
  await expect(page.locator('.save-error-banner')).toBeVisible({ timeout: 10000 });
  expect(postCount).toBe(1);
  // Dismiss banner.
  await page.locator('.save-error-dismiss').click();

  // Second save → must skip POST → upload + PATCH succeed.
  await page.locator('button.btn-primary').click();
  // Wait for navigation OR a second error.
  await Promise.race([
    page.waitForURL('**/admin/items', { timeout: 15000 }),
    page.waitForSelector('.save-error-banner', { timeout: 15000 }),
  ]);
  // Critical assertion: POST count is still 1, not 2.
  expect(postCount).toBe(1);
  expect(uploadCount).toBeGreaterThanOrEqual(2);

  // Clean up if the second save succeeded.
  if (page.url().endsWith('/admin/items')) {
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const listRes = await page.request.get('http://localhost:3000/api/admin/items', {
      headers: { Cookie: cookieHeader },
    });
    const { items } = (await listRes.json()) as { items: { id: string; title: string }[] };
    const created = items.find((i) => i.title.startsWith('_test_retry_'));
    if (created) {
      await page.request.delete(`http://localhost:3000/api/admin/items/${created.id}`, {
        headers: { Cookie: cookieHeader },
      });
    }
  }
});
