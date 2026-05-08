/**
 * `requireAdmin()` — call from any /api/admin/* route handler at the top.
 * Returns null on success, or a 401 Response on failure (return the response).
 */
import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './auth';

export async function requireAdmin(): Promise<Response | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!verifySession(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Server Component helper — returns true if the current request is admin-authed. */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
