import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

/**
 * P1-21 — Sales reconciliation on admin load.
 *
 * Catches the case where a Square webhook fired and the sale row landed
 * in `public.sales` but the corresponding `items.is_sold` flag never
 * flipped. Loading /admin/items runs a reconciliation pass that flips
 * any mismatched rows before rendering.
 *
 * Test strategy: create a real item, fake a sale row for it leaving
 * is_sold=false, hit /admin/items, then verify the item is now sold.
 * Cleans up both rows in finally.
 */

test('admin items page auto-marks an item sold when a sale row exists for it', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const id = `_test_reconcile_${Date.now()}`;
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  test.skip(!SUPA_URL || !SERVICE_KEY, 'Supabase service-role creds not available');

  // 1. Create the test item via the admin API (is_sold=false).
  const createRes = await request.post('http://localhost:3000/api/admin/items', {
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    data: {
      id,
      title: 'Reconcile probe',
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
      display_order: 99999,
    },
  });
  test.skip(!createRes.ok(), 'could not create test item');

  let saleId: string | null = null;
  try {
    // 2. Directly insert a fake sale row pointing at this item.
    const saleInsert = await fetch(`${SUPA_URL}/rest/v1/sales`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        type: 'item',
        amount: 1,
        item_id: id,
        item_title: 'Reconcile probe',
        note: `Object Lesson | Reconcile probe (${id})`,
        square_payment_id: `_test_payment_${Date.now()}`,
        customer_email: 'test@playwright.invalid',
      }),
    });
    const saleRows = (await saleInsert.json()) as { id: string }[];
    saleId = saleRows[0]?.id ?? null;
    expect(saleId).toBeTruthy();

    // 3. Visit admin items — reconciliation runs server-side.
    await page.goto('/admin/items');
    // The page renders only after reconciliation completes.
    await page.waitForSelector('.item-row', { timeout: 15000 });

    // 4. Read the item back; is_sold should now be true.
    const getRes = await request.get(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(getRes.ok()).toBe(true);
    const { item } = (await getRes.json()) as { item: { is_sold: boolean } };
    expect(item.is_sold).toBe(true);
  } finally {
    // Clean up: delete the sale row first (FK or no, less mess), then
    // the item.
    if (saleId) {
      await fetch(`${SUPA_URL}/rest/v1/sales?id=eq.${saleId}`, {
        method: 'DELETE',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
      }).catch(() => {});
    }
    await request
      .delete(`http://localhost:3000/api/admin/items/${id}`, {
        headers: { Cookie: cookieHeader },
      })
      .catch(() => {});
  }
});
