/**
 * In-memory rate limiter for the admin PIN endpoint.
 *
 * Contract (matches v1 admin/app.js:125-157): 5 failed attempts within
 * a 30-minute window from the same client locks that client out for
 * 5 minutes. On lockout, subsequent requests return 429 with a
 * Retry-After header.
 *
 * Storage: module-level Map keyed by client IP (X-Forwarded-For first
 * hop, falling back to "unknown"). State persists for the lifetime of
 * the Vercel function instance — typically 5-15 minutes between
 * invocations, which is comfortably longer than the 5-minute lockout.
 *
 * Cold-start reset is acceptable for this surface: the admin is single-
 * user, the PIN itself is long enough that brute-force isn't feasible
 * in 5 attempts per cold start anyway, and a more durable backend
 * (Vercel KV / Redis / a Supabase table) would be overkill for the
 * threat model.
 */
import 'server-only';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
const WINDOW_MS = 30 * 60 * 1000; // attempts older than this don't count

type AttemptState = { count: number; firstAt: number; lockedUntil: number };

// Map is at module scope so it persists across invocations on a warm
// function instance. Cold start re-creates an empty Map.
const attempts = new Map<string, AttemptState>();

export function clientId(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  // Vercel also sets x-real-ip
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

export function checkRateLimit(req: Request, now: number = Date.now()): RateLimitResult {
  const id = clientId(req);
  const state = attempts.get(id);
  if (!state) return { allowed: true };
  if (state.lockedUntil > now) {
    return { allowed: false, retryAfterMs: state.lockedUntil - now };
  }
  return { allowed: true };
}

export function recordFailedAttempt(req: Request, now: number = Date.now()): void {
  const id = clientId(req);
  let state = attempts.get(id);
  if (!state) {
    state = { count: 0, firstAt: now, lockedUntil: 0 };
  }
  // If the lockout has expired and the last activity was long ago, reset.
  if (state.lockedUntil > 0 && state.lockedUntil + WINDOW_MS < now) {
    state = { count: 0, firstAt: now, lockedUntil: 0 };
  }
  // If the first attempt is outside the rolling window, restart the counter.
  if (now - state.firstAt > WINDOW_MS) {
    state.count = 0;
    state.firstAt = now;
    state.lockedUntil = 0;
  }
  state.count += 1;
  if (state.count >= MAX_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_MS;
  }
  attempts.set(id, state);
}

export function clearAttempts(req: Request): void {
  attempts.delete(clientId(req));
}

/** Exposed for tests so we can reset between test cases. */
export function __resetAttemptsForTesting(): void {
  attempts.clear();
}
