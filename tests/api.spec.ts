import { test, expect } from '@playwright/test';

/**
 * API contract tests.
 *
 * These hit the Next.js API routes directly without exercising real Square /
 * Resend calls. They verify input validation + auth gating; full end-to-end
 * checkout is verified manually with a $1 test purchase at cutover.
 */

const ADMIN_PIN = process.env.ADMIN_PIN ?? 'Antiques2024';

test('POST /api/checkout rejects missing fields', async ({ request }) => {
  const res = await request.post('http://localhost:3000/api/checkout', {
    headers: { 'Content-Type': 'application/json' },
    data: {},
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBeTruthy();
});

test('POST /api/checkout rejects invalid item id', async ({ request }) => {
  const res = await request.post('http://localhost:3000/api/checkout', {
    headers: { 'Content-Type': 'application/json' },
    data: { itemId: '../../etc/passwd', title: 'x', price: 1 },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/checkout rejects negative price', async ({ request }) => {
  const res = await request.post('http://localhost:3000/api/checkout', {
    headers: { 'Content-Type': 'application/json' },
    data: { itemId: '000001', title: 'x', price: -5 },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/gift-checkout rejects missing amount', async ({ request }) => {
  const res = await request.post('http://localhost:3000/api/gift-checkout', {
    headers: { 'Content-Type': 'application/json' },
    data: {},
  });
  expect(res.status()).toBe(400);
});

test('POST /api/gift-checkout rejects amount > 10000', async ({ request }) => {
  const res = await request.post('http://localhost:3000/api/gift-checkout', {
    headers: { 'Content-Type': 'application/json' },
    data: { amount: 100000 },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/webhook/square rejects bad signature', async ({ request }) => {
  // With a signature key configured + a wrong signature, request must be rejected.
  // (If no signature key is configured, the route accepts anything in dev — that's
  // a documented escape hatch in lib/square.ts verifySquareWebhook.)
  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    test.skip(true, 'SQUARE_WEBHOOK_SIGNATURE_KEY not set; signature verification skipped');
  }
  const res = await request.post('http://localhost:3000/api/webhook/square', {
    headers: {
      'Content-Type': 'application/json',
      'x-square-hmacsha256-signature': 'AAAA',
    },
    data: { type: 'payment.updated' },
  });
  expect(res.status()).toBe(401);
});

test('GET /api/admin/sales requires admin', async ({ request }) => {
  const res = await request.get('http://localhost:3000/api/admin/sales');
  expect(res.status()).toBe(401);
});

test('GET /api/admin/sales returns sales when authed', async ({ request, page }) => {
  // Log in via the page so we get a real cookie
  await page.goto('/admin');
  await page.locator('input[type="password"]').fill(ADMIN_PIN);
  await page.getByRole('button', { name: /Unlock/ }).click();
  await page.waitForURL('**/admin/items');
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const res = await request.get('http://localhost:3000/api/admin/sales', {
    headers: { Cookie: cookieHeader },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(Array.isArray(body.sales)).toBe(true);
});

// ─────────────────────────────────────────────────────────────────
// Analytics events (P1-13)
// ─────────────────────────────────────────────────────────────────

const EVENTS_URL = 'http://localhost:3000/api/events';

test('POST /api/events rejects unknown event type', async ({ request }) => {
  const res = await request.post(EVENTS_URL, {
    headers: { 'Content-Type': 'application/json' },
    data: { event: 'not_an_event', session_id: 'test-sid-' + Date.now() },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/events rejects missing session_id', async ({ request }) => {
  const res = await request.post(EVENTS_URL, {
    headers: { 'Content-Type': 'application/json' },
    data: { event: 'page_view' },
  });
  expect(res.status()).toBe(400);
});

test('POST /api/events accepts a valid page_view (204)', async ({ request }) => {
  const res = await request.post(EVENTS_URL, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      event: 'page_view',
      session_id: 'test-pageview-' + Date.now(),
      path: '/',
      ua_mobile: false,
      referrer: null,
      utm_source: null,
    },
  });
  expect(res.status()).toBe(204);
});

test('POST /api/events silently drops requests from bot user-agents', async ({ request }) => {
  const res = await request.post(EVENTS_URL, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    },
    data: {
      event: 'page_view',
      session_id: 'test-bot-' + Date.now(),
      path: '/',
    },
  });
  // 204 (silent acknowledgement) — bot detection doesn't tip off scrapers
  // with a 4xx response.
  expect(res.status()).toBe(204);
});

test('POST /api/events accepts a session_end with a duration', async ({ request }) => {
  const res = await request.post(EVENTS_URL, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      event: 'session_end',
      session_id: 'test-sessionend-' + Date.now(),
      duration: 42,
      path: '/',
    },
  });
  expect(res.status()).toBe(204);
});
