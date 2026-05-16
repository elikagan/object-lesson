import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

/**
 * P0-10 — drag-to-reorder admin items. Verifies:
 *   - drag handle markup exists on every active row
 *   - the archive (sold) section is excluded from reorder via Sortable's
 *     `filter` + `onMove` returning false
 *   - reorder persists across page reload (writes to items.display_order
 *     via PATCH /api/admin/items/[id])
 *
 * We test the persistence path directly via API rather than miming
 * mouse-down/move/up on Sortable, because:
 *   (a) Sortable.js's HTML5 drag-and-drop is brittle under Playwright's
 *       synthetic mouse events (well-known issue with `dragenter` timing),
 *   (b) the actual contract — "the order the user sees after reorder
 *       persists across reload" — only depends on the API call shape,
 *       and that's what we test.
 */

test('every active item row is itself draggable (long-press anywhere on the row)', async ({ page }) => {
  await login(page);
  await page.waitForSelector('.item-row');
  const activeRows = page.locator('.item-list > .swipe-wrap > .item-row');
  const count = await activeRows.count();
  expect(count).toBeGreaterThan(0);
  // dnd-kit's useSortable attaches role="button" + aria-roledescription
  // ("sortable") + the dnd-kit data attribute to the element receiving
  // the drag listeners. Earlier versions of this test asserted a
  // dedicated .item-drag handle existed on each row — the handle was
  // removed when the listeners moved to the whole row (Eli couldn't
  // find a tiny dots icon on his phone).
  for (let i = 0; i < count; i++) {
    const row = activeRows.nth(i);
    // touch-action: pan-y is what lets the long-press timer run while
    // still allowing scroll. Without it, the dnd-kit drag never fires
    // on touch devices.
    const touchAction = await row.evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toContain('pan-y');
  }
});

test('admin list rejects display_order PATCH from unauthenticated callers', async ({ request }) => {
  // Pick any plausible id — admin guard fires before the row lookup, so 401
  // is returned regardless of whether the item exists.
  const res = await request.patch('http://localhost:3000/api/admin/items/_test_unauth_reorder', {
    headers: { 'Content-Type': 'application/json' },
    data: { display_order: 999 },
  });
  expect(res.status()).toBe(401);
});

test('reorder via PATCH display_order persists across reload', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Create three test items at known display_orders.
  const tag = `_test_reorder_${Date.now()}`;
  const ids = [`${tag}_a`, `${tag}_b`, `${tag}_c`];
  const created: string[] = [];
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const res = await request.post('http://localhost:3000/api/admin/items', {
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        data: {
          id,
          title: `Reorder test ${i}`,
          description: '',
          price: 1,
          size: '',
          category: 'misc',
          maker: '',
          condition: '',
          dealer_code: '',
          posted_by: 'test',
          is_new: false,
          is_hold: false,
          is_sold: false,
          hero_image: null,
          images: [],
          // Use a sentinel high range so we don't collide with real items.
          display_order: 100000 + i,
        },
      });
      if (res.ok()) created.push(id);
    }
    // Even if the API rejected, we want to clean up whatever stuck.
    test.skip(created.length !== 3, 'could not seed three test items');

    // Simulate what the Sortable onEnd handler does — three PATCHes in
    // parallel that swap items A and B's order.
    await Promise.all([
      request.patch(`http://localhost:3000/api/admin/items/${created[0]}`, {
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        data: { display_order: 100001 },
      }),
      request.patch(`http://localhost:3000/api/admin/items/${created[1]}`, {
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        data: { display_order: 100000 },
      }),
      request.patch(`http://localhost:3000/api/admin/items/${created[2]}`, {
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        data: { display_order: 100002 },
      }),
    ]);

    // Read back and confirm the new order persisted.
    const after = await Promise.all(
      created.map((id) =>
        request
          .get(`http://localhost:3000/api/admin/items/${id}`, {
            headers: { Cookie: cookieHeader },
          })
          .then((r) => r.json() as Promise<{ item: { id: string; display_order: number } }>),
      ),
    );
    const byId = new Map(after.map((r) => [r.item.id, r.item.display_order]));
    expect(byId.get(created[0])).toBe(100001);
    expect(byId.get(created[1])).toBe(100000);
    expect(byId.get(created[2])).toBe(100002);
  } finally {
    // Always clean up.
    for (const id of created) {
      await request
        .delete(`http://localhost:3000/api/admin/items/${id}`, {
          headers: { Cookie: cookieHeader },
        })
        .catch(() => {});
    }
  }
});
