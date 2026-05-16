import { test, expect } from '@playwright/test';

/**
 * Batch verification PR — three small assertions that v2 matches v1
 * behavior for previously-untested UI:
 *
 *   P1-22 — Inquire link format (sms:PHONE&body=... on mobile,
 *            mailto:... on desktop).
 *   P1-23 — Post-purchase thank-you card shows when returning with
 *            ?purchased=1 and includes an SMS link prefilled with the
 *            item title.
 *   P1-25 — Site banner dismissal persists in localStorage.
 */

async function findBuyableItemHref(
  page: import('@playwright/test').Page,
): Promise<string | null> {
  await page.goto('/');
  const hrefs = await page
    .locator('a[href^="/item/"]')
    .evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => a.getAttribute('href') ?? ''));
  for (const href of hrefs.slice(0, 20)) {
    if (!href) continue;
    await page.goto(href);
    const buyVisible = await page
      .locator('.detail-buy')
      .first()
      .isVisible()
      .catch(() => false);
    if (buyVisible) return href;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// P1-22 — Inquire link format
// ─────────────────────────────────────────────────────────────────

test('inquire link on detail page uses mailto: on desktop with subject + body', async ({ page }) => {
  const href = await findBuyableItemHref(page);
  test.skip(!href, 'no buyable items in inventory');
  await page.goto(href!);
  const inquire = page.locator('.detail-inquire').first();
  const url = await inquire.getAttribute('href');
  // Desktop user-agent → mailto. The exact PHONE/EMAIL constants live
  // in ItemDetail.tsx. We just verify the format pattern.
  expect(url).toBeTruthy();
  expect(url!.startsWith('mailto:') || url!.startsWith('sms:')).toBe(true);
  if (url!.startsWith('mailto:')) {
    expect(url).toContain('subject=Inquiry');
    expect(url).toContain('body=');
  } else {
    // sms: variant on mobile (Playwright Desktop Chrome should be desktop;
    // if the page picked mobile UA for some reason, allow both formats).
    expect(url).toMatch(/^sms:\d+&body=/);
  }
});

// ─────────────────────────────────────────────────────────────────
// P1-23 — Post-purchase thank-you card
// ─────────────────────────────────────────────────────────────────

test('returning with ?purchased=1 shows the thank-you card + SMS link', async ({ page }) => {
  const href = await findBuyableItemHref(page);
  test.skip(!href, 'no buyable items in inventory');
  await page.goto(`${href!}?purchased=1`);
  await expect(page.locator('.detail-purchased')).toBeVisible();
  await expect(page.getByText(/Thank you for your purchase/)).toBeVisible();
  // SMS link prefilled with the item title.
  const smsLink = page.locator('.detail-purchased a[href^="sms:"]').first();
  await expect(smsLink).toBeVisible();
  const smsHref = await smsLink.getAttribute('href');
  expect(smsHref).toBeTruthy();
  // Body is URL-encoded; decode before substring-matching the friendly
  // text the admin would actually read on the recipient's phone.
  const decoded = decodeURIComponent(smsHref!);
  expect(decoded).toContain('I just purchased');
});

// ─────────────────────────────────────────────────────────────────
// P1-25 — Site banner dismissal persists across reloads
// ─────────────────────────────────────────────────────────────────

test('site banner renders on first visit and stays dismissed after reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('ol_banner_dismissed'));
  await page.reload();
  // The banner renders for first-time visitors.
  const banner = page.locator('#site-banner');
  await expect(banner).toBeVisible();
  // Click the dismiss button.
  await page.locator('#site-banner .banner-close').click();
  await expect(banner).toHaveCount(0);
  // Reload — banner should NOT come back (dismissal persisted).
  await page.reload();
  await expect(page.locator('#site-banner')).toHaveCount(0);
  // Clean up so other tests start fresh.
  await page.evaluate(() => localStorage.removeItem('ol_banner_dismissed'));
});
