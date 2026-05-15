/**
 * POST /api/events
 *   Public analytics endpoint. Writes one row to public.events.
 *
 *   Validation:
 *     - `event` is in the known allowlist.
 *     - `session_id` is present and reasonable.
 *     - User-Agent header is not bot-like (defense-in-depth — the client
 *       already filters, but we don't trust the client).
 *
 *   Anything else is dropped silently with a 204 — analytics never returns
 *   actionable errors to a public caller.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

const ALLOWED_EVENTS = new Set([
  'page_view',
  'item_view',
  'inquire',
  'buy_now',
  'filter',
  'email_signup',
  'discount_applied',
  'session_end',
  'gift_purchase',
]);

const BOT_RE = /bot|crawl|spider|slurp|preview|prerender|HeadlessChrome/i;

export async function POST(request: Request) {
  // Bot UA filter (defense-in-depth — client already filters too).
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_RE.test(ua)) {
    // Acknowledge but don't write. Avoids tipping off scrapers.
    return new NextResponse(null, { status: 204 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const event = typeof body.event === 'string' ? body.event : '';
  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: 'Unknown event type' }, { status: 400 });
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : '';
  if (!session_id || session_id.length > 80) {
    return NextResponse.json({ error: 'Missing or invalid session_id' }, { status: 400 });
  }

  // Whitelist columns we accept — anything else is silently dropped. This
  // keeps the API honest: clients can't smuggle arbitrary JSON into the row.
  const row: Record<string, unknown> = {
    event,
    session_id,
    item_id: typeof body.item_id === 'string' ? body.item_id : null,
    referrer: typeof body.referrer === 'string' ? body.referrer.slice(0, 500) : null,
    utm_source: typeof body.utm_source === 'string' ? body.utm_source.slice(0, 100) : null,
    ua_mobile: typeof body.ua_mobile === 'boolean' ? body.ua_mobile : false,
    path: typeof body.path === 'string' ? body.path.slice(0, 200) : '/',
  };

  if (event === 'session_end' && typeof body.duration === 'number' && Number.isFinite(body.duration)) {
    // Clamp to a sane range (< 24h) so a malicious caller can't poison the
    // average-session-duration stat with a 9999999s value.
    row.duration = Math.max(0, Math.min(86400, Math.round(body.duration)));
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('events').insert(row);
  if (error) {
    // Don't surface the DB error to the public caller, but log for debugging.
    console.warn('[events] insert failed:', error.message);
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(null, { status: 204 });
}
