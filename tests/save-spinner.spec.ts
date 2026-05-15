import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

/**
 * Regression for the "save does nothing" UX bug: clicking Save kicked
 * off a real network round-trip, but there was no visible indicator
 * while the request was in flight. With no feedback, a non-technical
 * user reasonably concludes "nothing happened" and clicks again.
 *
 * Fix: the editor now shows a full-screen `.busy-overlay` with a
 * spinner + status label whenever `saving` or `aiBusy` is true. This
 * test pins that contract so the overlay can't silently disappear
 * again.
 */

test('clicking Save in /admin/items/new shows the busy overlay with a spinner', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  await page.goto('/admin/items/new');
  // Fill required fields so validation passes.
  await page.locator('input[placeholder="Item title"]').fill('_test_spinner_' + Date.now());
  await page.locator('select').first().selectOption('misc');

  // Slow the create POST so the overlay is visible long enough to assert.
  await page.route('**/api/admin/items', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((r) => setTimeout(r, 800));
    }
    return route.continue();
  });

  // Click Save. We don't await — we want to assert mid-flight.
  const clickPromise = page.locator('button.btn-primary').click();

  // Overlay must appear within 500ms of click. The spinner must be visible.
  await expect(page.locator('.busy-overlay')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('.busy-spinner')).toBeVisible();
  // Label must convey "we are doing something." Could be 'Saving…' or
  // 'Uploading photos…' depending on which step the editor reached.
  const label = await page.locator('.busy-label').textContent();
  expect(label && label.length > 0).toBe(true);

  await clickPromise;

  // After save completes the editor navigates away — the overlay should
  // not still be visible.
  await page.waitForURL('**/admin/items');
  expect(await page.locator('.busy-overlay').count()).toBe(0);

  // Clean up the test item via API. Find the most recent _test_spinner_ item.
  const list = await request.get('http://localhost:3000/api/admin/items', {
    headers: { Cookie: cookieHeader },
  });
  const { items } = (await list.json()) as { items: { id: string; title: string }[] };
  const created = items.find((i) => i.title.startsWith('_test_spinner_'));
  if (created) {
    await request.delete(`http://localhost:3000/api/admin/items/${created.id}`, {
      headers: { Cookie: cookieHeader },
    });
  }
});

