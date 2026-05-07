import { test, expect } from '@playwright/test';

/**
 * Smoke test — Phase 1 connectivity.
 * The home page must render and prove Supabase connectivity.
 *
 * If this fails: either Vercel can't reach Supabase, or env vars aren't set,
 * or someone changed the home page without updating this test.
 */
test('home page renders with Supabase connection OK', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Object Lesson/i })).toBeVisible();
  await expect(page.getByText(/Supabase connection: OK/)).toBeVisible();
});
