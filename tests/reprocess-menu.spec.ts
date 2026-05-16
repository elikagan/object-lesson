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
 * P1-15 — per-photo reprocess menu (Better lighting / Better background /
 * Better shadow). Mirrors v1 admin/app.js:962-1022.
 *
 * The menu only appears on photos that have been AI-processed in the
 * current edit session (Photo.processed === true). Un-processed pending
 * photos show the AI-exempt star toggle instead.
 */

test('un-processed photo shows the AI star, not the reprocess menu', async ({ page }) => {
  await login(page);
  await page.goto('/admin/items/new');
  await page.locator('input[type="file"]').setInputFiles(TEST_IMG);
  await page.waitForSelector('.photo-cell img');

  // Fresh upload — processed=false. Star visible, reprocess button absent.
  await expect(page.locator('.photo-cell .photo-ai')).toBeVisible();
  await expect(page.locator('.photo-cell .photo-reprocess')).toHaveCount(0);
});

test('processed photo shows reprocess button + dropdown menu with three options', async ({ page }) => {
  await login(page);
  await page.goto('/admin/items/new');
  await page.locator('input[type="file"]').setInputFiles(TEST_IMG);
  await page.waitForSelector('.photo-cell img');

  // Flip the processed flag from the test by simulating what AI processing
  // does: replace the cell's data-processed via the React state.
  // We can't easily mock processWithAI's internals here without running
  // Gemini for real. Instead, we directly poke React state via a known
  // hook: there isn't one, so we run the AI button on a deterministic
  // image. For a hermetic test, we stub the Gemini endpoint to return a
  // fake "image processed" response so the photo transitions to
  // processed=true without touching the live model.
  await page.route('**/api/admin/gemini', (route) => {
    // Always return: tag not found, no tape, bg-remove returns a tiny
    // valid JPEG, suggest returns empty.
    const body = route.request().postData() ?? '';
    if (body.includes('responseMimeType')) {
      // JSON response (detect tag / OCR / tape / suggest)
      if (body.includes('price tag')) {
        return route.fulfill({ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ tagIndex: -1 }) }] } }] }) });
      }
      if (body.includes('tape measure')) {
        return route.fulfill({ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ size: '', tapeIndex: -1 }) }] } }] }) });
      }
      // suggest
      return route.fulfill({ status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({}) }] } }] }) });
    }
    // Image response (background removal or reprocess): return a 1x1 PNG.
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    return route.fulfill({
      status: 200,
      body: JSON.stringify({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: tinyPng } }] } }],
      }),
    });
  });

  // Run AI processing (stubbed). After it finishes, the photo's
  // processed flag flips true.
  await page.locator('button.btn-secondary', { hasText: /Process with AI/ }).click();
  // Wait for the AI button to re-enable (signals aiBusy is back to false).
  await page.waitForFunction(
    () => {
      const btns = Array.from(document.querySelectorAll('button'));
      const ai = btns.find((b) => /Process with AI/.test(b.textContent ?? ''));
      return !!ai && !(ai as HTMLButtonElement).disabled;
    },
    null,
    { timeout: 15000 },
  );

  // Now the photo should show the reprocess button instead of the star.
  await expect(page.locator('.photo-cell .photo-reprocess')).toBeVisible();
  await expect(page.locator('.photo-cell .photo-ai')).toHaveCount(0);

  // Menu is hidden by default.
  await expect(page.locator('.photo-reprocess-menu.hidden')).toHaveCount(1);

  // Click → menu opens with three options.
  await page.locator('.photo-cell .photo-reprocess').click();
  await expect(page.locator('.photo-reprocess-menu:not(.hidden)')).toBeVisible();
  await expect(page.locator('.reprocess-opt')).toHaveCount(3);
  await expect(page.locator('.reprocess-opt').nth(0)).toHaveText('Better lighting');
  await expect(page.locator('.reprocess-opt').nth(1)).toHaveText('Better background removal');
  await expect(page.locator('.reprocess-opt').nth(2)).toHaveText('Better shadow');
});
