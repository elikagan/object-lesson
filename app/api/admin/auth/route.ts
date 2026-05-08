/**
 * POST /api/admin/auth
 *   Body: { pin: string }
 *   200: sets ol_admin cookie, returns { ok: true }
 *   401: { error: 'Invalid PIN' }
 *
 * DELETE /api/admin/auth
 *   Clears the cookie. 200: { ok: true }
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkPin, signSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/admin/auth';

export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 });
  }
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
