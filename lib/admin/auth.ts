/**
 * Admin auth — PIN-based, server-side signed cookie.
 *
 * Why this design:
 * - The admin is a single-user surface; no need for full account auth.
 * - PIN check happens on the server (constant-time compare), never in client code.
 * - On success, server sets a signed httpOnly cookie. The cookie value is an
 *   HMAC of "admin"+expiry+secret, so it can't be forged client-side.
 * - All /api/admin/* routes verify the cookie before allowing operations.
 *
 * If the PIN is ever compromised, rotating ADMIN_SESSION_SECRET invalidates all
 * existing cookies.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'ol_admin';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error('ADMIN_SESSION_SECRET not configured');
  return s;
}

function getPin(): string {
  const p = process.env.ADMIN_PIN;
  if (!p) throw new Error('ADMIN_PIN not configured');
  return p;
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function checkPin(pin: string): boolean {
  return safeEqual(pin, getPin());
}

/** Build a signed token: `<expiryMs>.<hmac(expiryMs, secret)>`. */
export function signSession(): string {
  const expiry = Date.now() + SESSION_TTL_MS;
  const sig = createHmac('sha256', getSecret()).update(String(expiry)).digest('hex');
  return `${expiry}.${sig}`;
}

/** Verify a signed token. Returns true if valid + not expired. */
export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiryStr, sig] = parts;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = createHmac('sha256', getSecret()).update(expiryStr).digest('hex');
  return safeEqual(sig, expected);
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;
