/**
 * Client-side analytics. Mirrors v1 `trackEvent()` (app.js:18-86) but writes
 * through a server route instead of hitting Supabase directly from the
 * browser — no client-side secrets.
 *
 * Shape sent to /api/events:
 *
 *   {
 *     event: 'page_view' | 'item_view' | 'inquire' | 'buy_now' | 'filter'
 *          | 'email_signup' | 'discount_applied' | 'session_end'
 *          | 'gift_purchase',
 *     item_id?: string | null,
 *     session_id: string,            // per-tab, persisted in sessionStorage
 *     referrer: string | null,       // document.referrer
 *     utm_source: string | null,     // captured from URL on first call
 *     ua_mobile: boolean,
 *     path: string,                  // window.location.pathname
 *     duration?: number,             // session_end only — whole seconds
 *   }
 *
 * Behavior parity with v1:
 *   - Bot user-agents are filtered client-side (skip the network call).
 *   - Session ID is per-tab (sessionStorage), regenerated when the tab is
 *     re-opened from scratch.
 *   - UTM source is captured once on first call and reused for the rest of
 *     the session (so a `filter` event still attributes back to the
 *     original entry-point campaign).
 *   - session_end uses keepalive:true so the POST completes after pagehide.
 *
 * Server-side defense in depth lives in app/api/events/route.ts: bot UA
 * check is repeated there, and the events table is the only thing the
 * route can write to.
 */

const BOT_RE = /bot|crawl|spider|slurp|preview|prerender|HeadlessChrome/i;
const MOBILE_RE = /iPhone|iPad|iPod|Android/i;

export type AnalyticsEvent =
  | 'page_view'
  | 'item_view'
  | 'inquire'
  | 'buy_now'
  | 'filter'
  | 'email_signup'
  | 'discount_applied'
  | 'session_end'
  | 'gift_purchase';

type Extra = Record<string, unknown> | undefined;

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem('ol_sid');
    if (existing) return existing;
    const fresh = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('ol_sid', fresh);
    return fresh;
  } catch {
    // sessionStorage unavailable (Safari private mode pre-iOS 15, locked-down
    // contexts). Generate a one-shot ID per call — analytics still flow but
    // can't be threaded into a session.
    return Math.random().toString(36).slice(2);
  }
}

let _utmCached: string | null | undefined; // undefined = not yet computed
function getUtmSource(): string | null {
  if (_utmCached !== undefined) return _utmCached;
  try {
    _utmCached = new URLSearchParams(window.location.search).get('utm_source');
  } catch {
    _utmCached = null;
  }
  return _utmCached;
}

export function isBotUA(ua: string | undefined): boolean {
  if (!ua) return false;
  return BOT_RE.test(ua);
}

export function trackEvent(event: AnalyticsEvent, itemId?: string | null, extra?: Extra): void {
  if (typeof window === 'undefined') return;
  if (isBotUA(navigator.userAgent)) return;

  const body: Record<string, unknown> = {
    event,
    item_id: itemId ?? null,
    session_id: getSessionId(),
    referrer: document.referrer || null,
    utm_source: getUtmSource(),
    ua_mobile: MOBILE_RE.test(navigator.userAgent),
    path: window.location.pathname,
    ...(extra ?? {}),
  };

  try {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // Analytics must never throw to the UI.
    });
  } catch {
    // ditto — sandboxed contexts can throw synchronously.
  }
}
