import { test, expect } from '@playwright/test';

/**
 * Phase 3 smoke tests — public site renders end-to-end.
 *
 * Each test asserts a critical user flow:
 *   - Homepage loads with the grid + at least one product card
 *   - Item detail loads, has Buy Now / Inquire / Share, image carousel
 *   - About page renders
 *   - Gift cert form renders (purchase form, no purchase yet)
 *   - 404 for unknown item
 */

test('homepage shows grid with products', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.logo')).toBeVisible();
  // At least one product card with an image
  await expect(page.locator('.card').first()).toBeVisible();
  await expect(page.locator('.card-image img').first()).toBeVisible();
  // Filter button visible
  await expect(page.getByRole('button', { name: /All/ })).toBeVisible();
});

test('clicking a product opens its detail page with carousel', async ({ page }) => {
  await page.goto('/');
  // Find a card linking to a real numeric-id item (admin tests may inject test items
  // with `_test_*` ids; skip those).
  const cards = page.locator('.card[href^="/item/0"]');
  await cards.first().waitFor({ state: 'visible' });
  await cards.first().click();
  await expect(page.locator('.detail-title')).toBeVisible();
  await expect(page.locator('.detail-price')).toBeVisible();
  await expect(page.locator('.detail-inquire')).toBeVisible();
  await expect(page.locator('.detail-slide img').first()).toBeVisible();
});

test('about page loads', async ({ page }) => {
  await page.goto('/about');
  await expect(page.getByText(/Uncommon Objects/)).toBeVisible();
  await expect(page.getByText(/480 S. Fair Oaks/)).toBeVisible();
});

test('gift page shows purchase form', async ({ page }) => {
  await page.goto('/gift');
  await expect(page.getByRole('heading', { name: /Gift Certificate/ })).toBeVisible();
  await expect(page.getByPlaceholder('50')).toBeVisible();
  await expect(page.getByRole('button', { name: /Purchase Gift Certificate/ })).toBeVisible();
});

test('unknown item returns 404', async ({ page }) => {
  const response = await page.goto('/item/000999999');
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/no longer available/)).toBeVisible();
});
