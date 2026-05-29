import { test, expect } from '@playwright/test';

/**
 * Regression for the 2026-05-29 "AI Process click is invisible" bug.
 *
 * Repro: open /admin/items/new, click "Process with AI" before adding
 * any photos. processWithAI() hits its early-return, calls setStatus(...),
 * but pre-fix, that status text only rendered inside the busy-overlay —
 * which is only mounted when `aiBusy || saving` is true. The early-return
 * fires BEFORE aiBusy flips on, so the overlay never mounts and the user
 * sees absolutely nothing: no error, no toast, no log line. The click is
 * indistinguishable from a dead button.
 *
 * Fix: render the status text outside the busy-overlay (always-visible
 * when set). This test asserts the visible-text branch lights up.
 */

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

test('AI Process button: clicking with no photos shows a visible status message (not a silent no-op)', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/items/new');

  const btn = page.locator('button.btn-secondary', { hasText: /Process with AI/ });
  await expect(btn).toBeVisible();
  await btn.click();

  // The status text must be visible to the user via the live region
  // attached to the AI Process button. Pre-fix, this status text was
  // only rendered inside the busy-overlay, which never mounted on this
  // path (aiBusy was still false at the time of the early-return), so
  // the click looked like a dead button.
  const status = page.locator('.processing-status[role="status"]');
  await expect(status).toBeVisible({ timeout: 5000 });
  await expect(status).toHaveText(/Add photos first/i);
});
