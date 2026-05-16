/**
 * POST /api/admin/auth
 *   Body: { pin: string }
 *   200: sets ol_admin cookie, returns { ok: true }
 *   401: { error: 'Invalid PIN' }
 *   429: { error: 'Too many attempts. Try again in N seconds.' } — after
 *        5 failed attempts within 30 min, locked out for 5 min (v1 parity).
 *
 * DELETE /api/admin/auth
 *   Clears the cookie. 200: { ok: true }
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkPin, signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/admin/auth';
import {
  checkRateLimit,
  recordFailedAttempt,
  clearAttempts,
} from '@/lib/admin/rate-limit';

export async function POST(request: Request) {
  // Rate-limit gate: if this client is currently locked out, refuse
  // before even reading the body so we can't be DoS'd into checking the
  // (constant-time) PIN repeatedly.
  const rl = checkRateLimit(request);
  if (!rl.allowed) {
    const secs = Math.ceil(rl.retryAfterMs / 1000);
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${secs} seconds.` },
      { status: 429, headers: { 'Retry-After': String(secs) } },
    );
  }

  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const pin = body?.pin;
  if (typeof pin !== 'string' || !pin) {
    return NextResponse.json({ error: 'PIN required' }, { status: 400 });
  }
  if (!checkPin(pin)) {
    recordFailedAttempt(request);
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }
  clearAttempts(request);
  const token = signSession();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
