import { test, expect } from '@playwright/test';

/**
 * Smoke test — Phase 2 connectivity.
 * The home page must render, prove Supabase connectivity, and show a sample
 * item from the new items table with its image loading from Supabase Storage.
 *
 * If this fails: either Vercel can't reach Supabase, env vars aren't set,
 * the items table is empty, or images aren't publicly readable.
 */
test('home page renders with items table connected', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Object Lesson/i })).toBeVisible();
  await expect(page.getByText(/Supabase connection: OK/)).toBeVisible();
  await expect(page.getByText(/items.*table contains/)).toBeVisible();
  // Sample item rendered with its image
  await expect(page.getByText(/Sample item from items table/)).toBeVisible();
  // The image element should exist and have a Supabase Storage URL
  const sampleImg = page.locator('img').first();
  await expect(sampleImg).toBeVisible();
  await expect(sampleImg).toHaveAttribute('src', /supabase\.co\/storage/);
});
