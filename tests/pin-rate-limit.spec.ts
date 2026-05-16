import { test, expect } from '@playwright/test';

/**
 * P1-20 — PIN rate limiting (matches v1 admin/app.js:125-157).
 *
 *   Contract: 5 failed PIN attempts within 30 minutes from the same
 *   client locks the client out for 5 minutes. Subsequent requests
 *   return 429 with a Retry-After header.
 *
 *   Implementation: in-memory Map keyed by X-Forwarded-For. Persists
 *   across calls on a warm function instance; resets on cold start.
 */

test('5 wrong PINs in a row → next request is locked out (429 + Retry-After)', async ({ request }) => {
  // Use a unique synthetic IP so we don't interfere with other tests
  // that exercise the auth route. The rate limiter keys on the first
  // X-Forwarded-For hop.
  const fakeIp = `10.0.0.${Math.floor(Math.random() * 250) + 1}`;

  for (let i = 1; i <= 5; i++) {
    const res = await request.post('http://localhost:3000/api/admin/auth', {
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fakeIp },
      data: { pin: `wrong-${i}` },
    });
    expect(res.status()).toBe(401);
  }

  // 6th attempt should be rate-limited regardless of correct/wrong PIN.
  const locked = await request.post('http://localhost:3000/api/admin/auth', {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fakeIp },
    data: { pin: 'wrong-6' },
  });
  expect(locked.status()).toBe(429);
  const retryAfter = locked.headers()['retry-after'];
  expect(retryAfter).toBeTruthy();
  const secs = Number(retryAfter);
  expect(secs).toBeGreaterThan(0);
  expect(secs).toBeLessThanOrEqual(300); // 5-minute lockout cap
  const body = await locked.json();
  expect(body.error).toMatch(/Too many attempts/);
});

test('successful login clears the failure counter for that client', async ({ request }) => {
  const fakeIp = `10.0.0.${Math.floor(Math.random() * 250) + 1}`;
  const pin = process.env.ADMIN_PIN ?? 'Antiques2024';

  // 4 wrong attempts (one short of the lockout threshold)
  for (let i = 1; i <= 4; i++) {
    const res = await request.post('http://localhost:3000/api/admin/auth', {
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fakeIp },
      data: { pin: `wrong-${i}` },
    });
    expect(res.status()).toBe(401);
  }

  // Correct PIN clears the counter
  const ok = await request.post('http://localhost:3000/api/admin/auth', {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fakeIp },
    data: { pin },
  });
  expect(ok.status()).toBe(200);

  // Now we should be able to fail again without immediate lockout
  // (because the counter was cleared on success).
  for (let i = 1; i <= 4; i++) {
    const res = await request.post('http://localhost:3000/api/admin/auth', {
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': fakeIp },
      data: { pin: `wrong-post-${i}` },
    });
    expect(res.status()).toBe(401);
  }
});

test('rate-limit state is per-client (different IPs do not share counter)', async ({ request }) => {
  const ipA = `10.0.1.${Math.floor(Math.random() * 250) + 1}`;
  const ipB = `10.0.2.${Math.floor(Math.random() * 250) + 1}`;

  // 5 wrong PINs from IP A → A is locked
  for (let i = 1; i <= 5; i++) {
    await request.post('http://localhost:3000/api/admin/auth', {
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipA },
      data: { pin: `wrong-${i}` },
    });
  }
  const aLocked = await request.post('http://localhost:3000/api/admin/auth', {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipA },
    data: { pin: 'wrong-extra' },
  });
  expect(aLocked.status()).toBe(429);

  // IP B should still be allowed
  const bAllowed = await request.post('http://localhost:3000/api/admin/auth', {
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ipB },
    data: { pin: 'wrong-b1' },
  });
  expect(bAllowed.status()).toBe(401); // unauthorized but not rate-limited
});
