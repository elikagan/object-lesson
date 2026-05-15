import { test, expect } from '@playwright/test';

/**
 * P0-9 — touch carousel on item detail page. The drag mechanics
 * (direction lock at 8px, 0.3x edge resistance, 20% width threshold,
 * smooth snap-back) are all in components/ItemDetail.tsx, verified by
 * code review against v1 app.js:559-615. These tests pin the
 * observable DOM behavior so a refactor can't silently regress.
 */

async function findItemHrefWhere(
  page: import('@playwright/test').Page,
  predicate: (imgCount: number) => boolean,
): Promise<string | null> {
  await page.goto('/');
  // Collect hrefs first — element handles become detached once we navigate
  // away from the grid page, so we can't iterate them across goto()s.
  const hrefs = await page
    .locator('a[href^="/item/"]')
    .evaluateAll((els) => (els as HTMLAnchorElement[]).map((a) => a.getAttribute('href') ?? ''));
  // Look at up to 20 items so this test stays fast even with a long grid.
  for (const href of hrefs.slice(0, 20)) {
    if (!href) continue;
    await page.goto(href);
    const imgs = await page.locator('.detail-slide img').count();
    if (predicate(imgs)) return href;
  }
  return null;
}

test('item detail with multiple images renders a thumb strip + carousel track', async ({ page }) => {
  const href = await findItemHrefWhere(page, (n) => n > 1);
  test.skip(!href, 'no multi-image items in inventory to test against');
  await page.goto(href!);

  await expect(page.locator('.detail-carousel')).toBeVisible();
  await expect(page.locator('.detail-track')).toBeVisible();
  const slides = await page.locator('.detail-slide').count();
  expect(slides).toBeGreaterThan(1);

  // Thumb strip is shown and has one entry per slide.
  await expect(page.locator('.detail-thumbs')).toBeVisible();
  expect(await page.locator('.detail-thumb').count()).toBe(slides);

  // First thumb is active by default.
  await expect(page.locator('.detail-thumb').first()).toHaveClass(/active/);
});

test('clicking a thumbnail advances the carousel (alt path to swipe)', async ({ page }) => {
  const href = await findItemHrefWhere(page, (n) => n > 1);
  test.skip(!href, 'no multi-image items in inventory to test against');
  await page.goto(href!);

  // Click the second thumb. The track translates to -100% (one slide width)
  // and the active class moves to the second thumb.
  await page.locator('.detail-thumb').nth(1).click();
  await expect(page.locator('.detail-thumb.active').first()).toHaveText('');
  // Active class on the second thumb specifically.
  const activeIndex = await page.locator('.detail-thumb').evaluateAll((els) => {
    return els.findIndex((e) => (e as HTMLElement).classList.contains('active'));
  });
  expect(activeIndex).toBe(1);

  // Track has translateX(-100%).
  const transform = await page.locator('.detail-track').evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  expect(transform).toContain('-100%');
});

test('item detail with a single image hides the thumb strip', async ({ page }) => {
  const href = await findItemHrefWhere(page, (n) => n === 1);
  test.skip(!href, 'no single-image items in inventory to test against');
  await page.goto(href!);

  await expect(page.locator('.detail-carousel')).toBeVisible();
  // No thumb strip when there's only one image (matches v1).
  expect(await page.locator('.detail-thumbs').count()).toBe(0);
});

test('simulated touch swipe past 20% advances the carousel', async ({ page }) => {
  const href = await findItemHrefWhere(page, (n) => n > 1);
  test.skip(!href, 'no multi-image items in inventory to test against');
  await page.goto(href!);

  // Find the carousel and its width.
  const box = await page.locator('.detail-carousel').boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + box.width * 0.8;
  const startY = box.y + box.height / 2;
  const endX = box.x + box.width * 0.4; // drag ~40% of width to the left
  const endY = startY;

  // Dispatch synthetic Touch events directly — Playwright's touchscreen
  // doesn't expose multi-event drags in this version.
  await page.evaluate(
    ({ sx, sy, ex, ey }) => {
      const target = document.querySelector('.detail-carousel') as HTMLElement;
      function mkTouch(x: number, y: number) {
        // TouchEvent constructor isn't available in JSDOM; in real browsers
        // we can use the Touch class. Fall back to a plain object that
        // satisfies the event handlers' shape.
        return { clientX: x, clientY: y } as Touch;
      }
      function dispatch(type: string, x: number, y: number, isEnd = false) {
        const t = mkTouch(x, y);
        const ev = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
        Object.defineProperty(ev, 'touches', { value: isEnd ? [] : [t] });
        Object.defineProperty(ev, 'changedTouches', { value: [t] });
        target.dispatchEvent(ev);
      }
      dispatch('touchstart', sx, sy);
      // A few move steps so direction-lock engages and the offset crosses 8px
      dispatch('touchmove', sx - 20, sy);
      dispatch('touchmove', ex, ey);
      dispatch('touchend', ex, ey, true);
    },
    { sx: startX, sy: startY, ex: endX, ey: endY },
  );

  // After the swipe, the second thumb should be active.
  await page.waitForFunction(() => {
    const thumbs = document.querySelectorAll('.detail-thumb');
    return thumbs[1]?.classList.contains('active');
  }, undefined, { timeout: 2000 });
});
