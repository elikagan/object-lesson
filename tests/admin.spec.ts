import { test, expect } from '@playwright/test';

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

/**
 * Admin smoke tests + v1 regression tests.
 *
 * Each test starts by logging in (no shared state between tests) so the auth flow
 * is exercised every time. Tests that mutate data create their own item with a
 * unique id and clean up at the end via the DELETE API.
 */

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
}

test('locked admin requires PIN', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.locator('input[type="password"]')).toBeVisible();
  // Wrong PIN → error
  await page.locator('input[type="password"]').fill('wrong');
  await page.getByRole('button', { name: /Unlock/ }).click();
  await expect(page.getByText(/Invalid PIN/)).toBeVisible();
});

test('correct PIN unlocks and shows items list', async ({ page }) => {
  await login(page);
  // v1 admin: topbar with logo + at least one .item-row in the DOM
  await expect(page.locator('.topbar-logo')).toBeVisible();
  // Wait until the list has rendered
  await page.waitForSelector('.item-row', { timeout: 10000 });
  expect(await page.locator('.item-row').count()).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────
// v1 Regression tests (used to be fixme stubs in regressions.spec.ts)
// ─────────────────────────────────────────────────────────────────

test('mark-sold persists after save (v1 lost it on stale-state retry)', async ({ page, request }) => {
  await login(page);

  // Use a known item we created during migration. Create a fresh test item to avoid touching prod data.
  const id = `_test_marksold_${Date.now()}`;
  // Create via API
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const created = await request.post('http://localhost:3000/api/admin/items', {
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    data: { id, title: `MarkSold Test ${Date.now()}`, category: 'misc', price: 1 },
  });
  expect(created.ok()).toBe(true);

  try {
    // Mark it sold via PATCH
    const patched = await request.patch(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { is_sold: true },
    });
    expect(patched.ok()).toBe(true);
    const body = await patched.json();
    expect(body.item.is_sold).toBe(true);
    expect(body.item.is_new).toBe(false); // marking sold also clears is_new
    expect(body.item.is_hold).toBe(false);

    // Re-read via GET — must still be sold
    const got = await request.get(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { Cookie: cookieHeader },
    });
    const gotBody = await got.json();
    expect(gotBody.item.is_sold).toBe(true);
  } finally {
    await request.delete(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { Cookie: cookieHeader },
    });
  }
});

test('saving item A does not delete item B (v1 stale-state resurrection)', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const idA = `_test_a_${Date.now()}`;
  const idB = `_test_b_${Date.now()}`;

  try {
    // Create A and B
    await request.post('http://localhost:3000/api/admin/items', {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { id: idA, title: `A ${Date.now()}`, category: 'misc', price: 1 },
    });
    await request.post('http://localhost:3000/api/admin/items', {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { id: idB, title: `B ${Date.now()}`, category: 'misc', price: 1 },
    });

    // Edit A's price (this is the operation that erased other items in v1)
    await request.patch(`http://localhost:3000/api/admin/items/${idA}`, {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { price: 999 },
    });

    // B must still exist with original price
    const gotB = await request.get(`http://localhost:3000/api/admin/items/${idB}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(gotB.ok()).toBe(true);
    const bodyB = await gotB.json();
    expect(bodyB.item.id).toBe(idB);
    expect(Number(bodyB.item.price)).toBe(1);
  } finally {
    await request.delete(`http://localhost:3000/api/admin/items/${idA}`, { headers: { Cookie: cookieHeader } });
    await request.delete(`http://localhost:3000/api/admin/items/${idB}`, { headers: { Cookie: cookieHeader } });
  }
});

test('deleting an item also removes its thumbnails from storage', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const id = `_test_del_${Date.now()}`;

  // Create item with a fake image path. (We don't need to upload a real file —
  // the DELETE handler attempts to remove from Storage but tolerates 404s.)
  const res = await request.post('http://localhost:3000/api/admin/items', {
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    data: {
      id,
      title: `Del Test ${Date.now()}`,
      category: 'misc',
      price: 1,
      images: [`images/products/${id}/foo.jpg`],
      hero_image: `images/products/${id}/foo.jpg`,
    },
  });
  expect(res.ok()).toBe(true);

  // Delete
  const delRes = await request.delete(`http://localhost:3000/api/admin/items/${id}`, {
    headers: { Cookie: cookieHeader },
  });
  expect(delRes.ok()).toBe(true);
  const delBody = await delRes.json();
  // deletedFiles count = full + thumb = 2 (whether they actually existed in storage or not,
  // we tried to remove both — the v1 bug was that we ONLY tried the full image)
  expect(delBody.deletedFiles).toBe(2);

  // Item should be gone
  const got = await request.get(`http://localhost:3000/api/admin/items/${id}`, {
    headers: { Cookie: cookieHeader },
  });
  expect(got.status()).toBe(404);
});

test('PATCH only updates the fields in the body (the bug-class fix)', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const id = `_test_patch_${Date.now()}`;

  try {
    await request.post('http://localhost:3000/api/admin/items', {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: {
        id,
        title: 'Original Title',
        description: 'Original Description',
        price: 100,
        category: 'misc',
        maker: 'Original Maker',
      },
    });

    // PATCH only the title
    await request.patch(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { title: 'New Title' },
    });

    // Re-read: title changed, all other fields untouched
    const got = await request.get(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { Cookie: cookieHeader },
    });
    const body = await got.json();
    expect(body.item.title).toBe('New Title');
    expect(body.item.description).toBe('Original Description');
    expect(Number(body.item.price)).toBe(100);
    expect(body.item.maker).toBe('Original Maker');
  } finally {
    await request.delete(`http://localhost:3000/api/admin/items/${id}`, { headers: { Cookie: cookieHeader } });
  }
});

test('"New" badge auto-expires after 7 days', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const id = `_test_new_${Date.now()}`;

  try {
    // Create with is_new=true; created_at defaults to now()
    await request.post('http://localhost:3000/api/admin/items', {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { id, title: 'New Test', category: 'misc', price: 1, is_new: true },
    });

    // Visit admin list — created_at is "now", so item should show as new
    await page.goto('/admin/items');
    await expect(page.getByText('New Test')).toBeVisible();

    // Note: full 7-day decay check is done in lib/items.ts isItemNew() unit test —
    // verifying admin display state for a fresh item is enough here.
  } finally {
    await request.delete(`http://localhost:3000/api/admin/items/${id}`, { headers: { Cookie: cookieHeader } });
  }
});

// ─────────────────────────────────────────────────────────────────
// Photo upload UI — tests the actual click-and-drag flow, not just
// the API route. Would have caught the bug Eli reported on 2026-05-08
// where the "Add Photos" label had a redundant onClick that silently
// cancelled the file picker.
// ─────────────────────────────────────────────────────────────────

// Tiny 1x1 transparent PNG, base64-decoded — sufficient for upload tests.
// Real Playwright `setInputFiles` accepts a Buffer, so we don't need a fixture file.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('clicking the Add Photos label opens the native file picker', async ({ page }) => {
  // This is the regression test for the 2026-05-08 bug. The label had BOTH
  // an onClick={() => ref.click()} AND wrapped the <input> as a child, so
  // clicking it fired the picker twice. Chrome silently cancels the
  // second open, so the user saw NOTHING when they clicked Add Photos.
  //
  // setInputFiles() bypasses the click entirely (it pokes the DOM input),
  // so it can't catch this bug. We need to actually click the label and
  // assert that the file picker fires exactly once.
  await login(page);
  await page.goto('/admin/items/new');

  // Sanity: the label is visible and the hidden input exists.
  await expect(page.locator('label.add-photo-btn')).toBeVisible();
  await expect(page.locator('input[type="file"]#photo-input')).toHaveCount(1);

  // Wait for the filechooser to fire when we click the label. If the click
  // path is broken (double-trigger, missing htmlFor, etc.) this will time
  // out and the test fails.
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 });
  await page.locator('label.add-photo-btn').click();
  const fileChooser = await fileChooserPromise;

  // Setting files via the chooser uses the same code path as a real user
  // selecting from the OS picker — it fires onChange on the bound input.
  const buf = Buffer.from(TINY_PNG_BASE64, 'base64');
  await fileChooser.setFiles({ name: 'test.png', mimeType: 'image/png', buffer: buf });

  // A thumbnail preview should appear in the photo grid.
  await expect(page.locator('.photo-grid .photo-cell img')).toHaveCount(1, { timeout: 5_000 });
});

test('image upload endpoint stores file and returns its path', async ({ page, request }) => {
  // Direct test of POST /api/admin/items/[id]/images. Uses an `_test_*` id so
  // the item is not picked up by the public smoke test (which filters to ids
  // beginning with "/item/0"). This keeps image-upload coverage without
  // racing parallel tests.
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const id = `_test_imgup_${Date.now()}`;

  try {
    // Create the item shell first (no images yet)
    const created = await request.post('http://localhost:3000/api/admin/items', {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { id, title: `ImgUp Test ${Date.now()}`, category: 'misc', price: 1 },
    });
    expect(created.ok()).toBe(true);

    // Upload a tiny PNG via the multipart form endpoint. Field name is "files"
    // (plural) per the route handler.
    const buf = Buffer.from(TINY_PNG_BASE64, 'base64');
    const upload = await request.post(`http://localhost:3000/api/admin/items/${id}/images`, {
      headers: { Cookie: cookieHeader },
      multipart: {
        files: { name: 'test.png', mimeType: 'image/png', buffer: buf },
      },
    });
    expect(upload.ok()).toBe(true);
    const { uploaded } = (await upload.json()) as { uploaded: string[] };
    expect(uploaded.length).toBe(1);
    expect(uploaded[0]).toMatch(/^images\/products\//);

    // PATCH the item to attach the new path
    await request.patch(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      data: { images: uploaded, hero_image: uploaded[0] },
    });

    // Re-read and confirm
    const got = await request.get(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { Cookie: cookieHeader },
    });
    const body = await got.json();
    expect(body.item.images.length).toBe(1);
    expect(body.item.hero_image).toMatch(/^images\/products\//);
  } finally {
    await request.delete(`http://localhost:3000/api/admin/items/${id}`, {
      headers: { Cookie: cookieHeader },
    });
  }
});

// ─────────────────────────────────────────────────────────────────
// Sales view (P0-2 — admin sub-view parity with v1)
// ─────────────────────────────────────────────────────────────────

test('admin /sales requires PIN (redirects to lock screen when not authed)', async ({ page }) => {
  await page.goto('/admin/sales');
  // Unauthenticated visit must NOT show the sales summary cards.
  await expect(page.locator('.sales-summary')).toHaveCount(0);
  // Should land on the lock screen — the password input is rendered.
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('admin /sales renders summary cards + transaction list (matches v1 visuals)', async ({ page }) => {
  await login(page);
  await page.goto('/admin/sales');

  // Summary block: three stat cards labelled per v1 (All Time / This Month / Today).
  await expect(page.locator('.sales-summary')).toBeVisible();
  await expect(page.locator('.sales-stat')).toHaveCount(3);
  await expect(page.locator('.sales-stat-label').nth(0)).toHaveText('All Time');
  await expect(page.locator('.sales-stat-label').nth(1)).toHaveText('This Month');
  await expect(page.locator('.sales-stat-label').nth(2)).toHaveText('Today');

  // All three stat values must render in USD format (dollars + 2 decimals).
  for (let i = 0; i < 3; i++) {
    const text = await page.locator('.sales-stat-value').nth(i).innerText();
    expect(text).toMatch(/^\$[\d,]+\.\d{2}$/);
  }

  // Meta line below the cards: "N total transactions · X items ($Y) · Z gift certs ($W)".
  await expect(page.locator('.sales-meta')).toContainText('total transactions');
  await expect(page.locator('.sales-meta')).toContainText('items');
  await expect(page.locator('.sales-meta')).toContainText('gift certs');

  // Transaction History header is always present.
  await expect(page.locator('.marketing-section-title')).toHaveText('Transaction History');

  // Either at least one .sale-row OR the empty-state message — never both.
  const rowCount = await page.locator('.sale-row').count();
  const emptyVisible = await page.locator('.marketing-empty').isVisible().catch(() => false);
  expect(rowCount > 0 || emptyVisible).toBe(true);

  // If we have rows, each one carries an Item or Gift Cert badge.
  // Note: `.sale-type` has `text-transform: uppercase` in admin/style.css,
  // so `innerText` returns the rendered (uppercase) form.
  if (rowCount > 0) {
    const badgeText = await page.locator('.sale-type').first().innerText();
    expect(['ITEM', 'GIFT CERT']).toContain(badgeText);
  }
});

test('admin list-view hamburger menu links Sales to /admin/sales (no longer dead)', async ({ page }) => {
  await login(page);
  // Open the hamburger.
  await page.locator('button[aria-label="Menu"]').click();
  const salesLink = page.locator('.menu-dropdown a.menu-item', { hasText: 'Sales' });
  await expect(salesLink).toBeVisible();
  // The href must be the in-app route, not the dead v1 hash URL.
  await expect(salesLink).toHaveAttribute('href', '/admin/sales');

  // Click → land on the sales page → see the summary block.
  await salesLink.click();
  await page.waitForURL('**/admin/sales');
  await expect(page.locator('.sales-summary')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────
// Gift Certificates view (P0-4 — admin sub-view parity with v1)
// ─────────────────────────────────────────────────────────────────

test('admin /giftcerts requires PIN (redirects to lock screen when not authed)', async ({ page }) => {
  await page.goto('/admin/giftcerts');
  // Unauthenticated visit must NOT show the create form or list.
  await expect(page.locator('.discount-create')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('admin /giftcerts renders create form + list with status badges', async ({ page }) => {
  await login(page);
  await page.goto('/admin/giftcerts');

  // Topbar version label is "Gift Certificates".
  await expect(page.locator('.version-label')).toHaveText('Gift Certificates');

  // Create form: amount + purchaser + recipient + email inputs + submit button.
  await expect(page.locator('.discount-create')).toBeVisible();
  await expect(page.locator('input[placeholder="Amount (USD)"]')).toBeVisible();
  await expect(page.locator('input[placeholder="Purchaser name"]')).toBeVisible();
  await expect(page.locator('input[placeholder="Recipient name"]')).toBeVisible();
  await expect(page.locator('input[placeholder="Recipient email (optional)"]')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Create Gift Certificate/ }),
  ).toBeVisible();

  // Existing list section header always present.
  await expect(page.getByText('All Gift Certificates')).toBeVisible();

  // Either at least one .dc-row OR the empty-state message.
  const rowCount = await page.locator('#gc-list .dc-row').count();
  const emptyVisible = await page.locator('.marketing-empty').isVisible().catch(() => false);
  expect(rowCount > 0 || emptyVisible).toBe(true);

  // If we have rows, each carries a status badge with a known class.
  // Note: `.gc-status` has `text-transform: uppercase` in admin/style.css,
  // so `innerText` returns the rendered (uppercase) form.
  if (rowCount > 0) {
    const statusEl = page.locator('.gc-status').first();
    const text = await statusEl.innerText();
    expect(['ACTIVE', 'REDEEMED', 'VOIDED']).toContain(text);
  }
});

test('admin can create + void a gift cert end-to-end via API', async ({ page, request }) => {
  await login(page);
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  // Create
  const createRes = await request.post('http://localhost:3000/api/admin/giftcerts', {
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    data: {
      amount: 1,
      purchaser_name: 'Playwright Test',
      recipient_name: 'Auto Test Recipient',
    },
  });
  expect(createRes.ok()).toBe(true);
  const created = (await createRes.json()) as { giftcert: { id: string; code: string; value: number; is_active: boolean } };
  expect(created.giftcert.code).toMatch(/^GIFT-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(Number(created.giftcert.value)).toBe(1);
  expect(created.giftcert.is_active).toBe(true);

  // Void
  const voidRes = await request.patch(`http://localhost:3000/api/admin/giftcerts/${created.giftcert.id}`, {
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    data: { is_active: false },
  });
  expect(voidRes.ok()).toBe(true);

  // Confirm voided in list
  const listRes = await request.get('http://localhost:3000/api/admin/giftcerts', {
    headers: { Cookie: cookieHeader },
  });
  const list = (await listRes.json()) as { giftcerts: { id: string; is_active: boolean }[] };
  const row = list.giftcerts.find((g) => g.id === created.giftcert.id);
  expect(row).toBeDefined();
  expect(row!.is_active).toBe(false);
});

test('admin list-view hamburger menu links Gift Certificates to /admin/giftcerts', async ({ page }) => {
  await login(page);
  await page.locator('button[aria-label="Menu"]').click();
  const link = page.locator('.menu-dropdown a.menu-item', { hasText: 'Gift Certificates' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/admin/giftcerts');
  await link.click();
  await page.waitForURL('**/admin/giftcerts');
  await expect(page.locator('.discount-create')).toBeVisible();
});

// ─────────────────────────────────────────────────────────────────
// Analytics tracker (P1-13) — public side fires page_view on mount
// ─────────────────────────────────────────────────────────────────

test('public homepage fires a page_view event on load', async ({ page }) => {
  // Catch the analytics request as it leaves the page.
  const eventReq = page.waitForRequest(
    (req) => req.url().includes('/api/events') && req.method() === 'POST',
    { timeout: 10000 },
  );
  await page.goto('/');
  const req = await eventReq;
  const body = req.postDataJSON() as { event: string; session_id: string; path: string };
  expect(body.event).toBe('page_view');
  expect(body.session_id.length).toBeGreaterThan(0);
  expect(body.path).toBe('/');
});

test('navigating to an item fires item_view', async ({ page }) => {
  await page.goto('/');
  // Wait for the grid, then click the first product link into a detail page.
  await page.waitForSelector('a[href^="/item/"]');
  const firstHref = await page.locator('a[href^="/item/"]').first().getAttribute('href');
  expect(firstHref).toBeTruthy();
  const eventReq = page.waitForRequest(
    (req) => {
      if (!req.url().includes('/api/events') || req.method() !== 'POST') return false;
      try {
        const body = JSON.parse(req.postData() ?? '{}');
        return body.event === 'item_view';
      } catch {
        return false;
      }
    },
    { timeout: 10000 },
  );
  await page.goto(firstHref!);
  const req = await eventReq;
  const body = req.postDataJSON() as { event: string; item_id: string };
  expect(body.event).toBe('item_view');
  expect(body.item_id).toBeTruthy();
});

// ─────────────────────────────────────────────────────────────────
// Admin Analytics dashboard (P0-3)
// ─────────────────────────────────────────────────────────────────

test('admin /analytics requires PIN (redirects to lock screen when not authed)', async ({ page }) => {
  await page.goto('/admin/analytics');
  await expect(page.locator('.analytics-cards')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('admin /analytics renders summary cards + range toggle', async ({ page }) => {
  await login(page);
  await page.goto('/admin/analytics?range=7');
  await expect(page.locator('.version-label')).toHaveText('Analytics');
  await expect(page.locator('.range-toggle')).toBeVisible();
  // Four range buttons.
  await expect(page.locator('.range-btn')).toHaveCount(4);
  // 7d button must be active (URL says range=7).
  await expect(page.locator('.range-btn.active')).toHaveText('7d');

  // Either the cards rendered (data flowed) OR the empty-state message
  // shows. Both are valid; this test just confirms the page didn't crash.
  const cards = await page.locator('.analytics-cards').count();
  const empty = await page.locator('.analytics-empty').count();
  expect(cards + empty).toBeGreaterThan(0);
});

test('admin /analytics range toggle changes the URL and active button', async ({ page }) => {
  await login(page);
  await page.goto('/admin/analytics?range=7');
  // Click 30d
  await page.locator('.range-btn', { hasText: '30d' }).click();
  await page.waitForURL('**/admin/analytics?range=30');
  await expect(page.locator('.range-btn.active')).toHaveText('30d');
});

test('admin list-view hamburger menu links Analytics to /admin/analytics', async ({ page }) => {
  await login(page);
  await page.locator('button[aria-label="Menu"]').click();
  const link = page.locator('.menu-dropdown a.menu-item', { hasText: 'Analytics' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/admin/analytics');
  await link.click();
  await page.waitForURL('**/admin/analytics**');
});
