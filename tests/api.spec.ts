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
