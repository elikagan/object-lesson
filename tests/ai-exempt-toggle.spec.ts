import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';
// Tiny throwaway PNG for upload — content doesn't matter, we never click AI.
const TEST_IMG = 'tests/fixtures/tiny.png';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

/**
 * P1-14 — per-photo AI exempt toggle (star icon).
 *
 * v1 had a star button in each pending photo's corner that toggled
 * `aiProcess` between true and false. Photos with aiProcess=false are
 * skipped by the background-removal step of the AI pipeline. The
 * plumbing existed in v2 (Photo type carried aiProcess, the pipeline
 * filtered on it) but the UI button was missing.
 */

test('newly-added photo shows the AI star toggle in the active state', async ({ page }) => {
  await login(page);
  await page.goto('/admin/items/new');

  await page.locator('input[type="file"]').setInputFiles(TEST_IMG);
  await page.waitForSelector('.photo-cell img');

  // Star button must be present, with aria-pressed=true (AI on by default).
  const toggle = page.locator('.photo-cell .photo-ai').first();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveClass(/active/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('clicking the AI toggle flips aria-pressed and the .active class', async ({ page }) => {
  await login(page);
  await page.goto('/admin/items/new');

  await page.locator('input[type="file"]').setInputFiles(TEST_IMG);
  await page.waitForSelector('.photo-cell img');

  const toggle = page.locator('.photo-cell .photo-ai').first();

  // Off
  await toggle.click();
  await expect(toggle).not.toHaveClass(/active/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  // Back on
  await toggle.click();
  await expect(toggle).toHaveClass(/active/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

test('first photo carries the hero indicator dot; second does not', async ({ page }) => {
  await login(page);
  await page.goto('/admin/items/new');

  await page.locator('input[type="file"]').setInputFiles([TEST_IMG, TEST_IMG]);
  // Wait for both cells to render
  await expect(page.locator('.photo-cell')).toHaveCount(2);

  await expect(page.locator('.photo-cell').nth(0).locator('.photo-hero-dot')).toHaveCount(1);
  await expect(page.locator('.photo-cell').nth(1).locator('.photo-hero-dot')).toHaveCount(0);
});
