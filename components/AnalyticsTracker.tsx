'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';

/**
 * Drop this once at the top of the public layout. Two responsibilities:
 *
 *   1. Fire `page_view` on initial mount AND on every client-side route change
 *      (Next.js doesn't reload between routes, so without this we'd only see
 *      the first navigation per session).
 *
 *   2. Fire `session_end` with elapsed seconds when the user leaves the tab
 *      (visibilitychange → hidden) or closes it (pagehide). Mirrors v1's
 *      sendSessionDuration with the same 2-second bounce floor and the
 *      "allow re-send if they come back" cooldown.
 *
 * Item-detail-specific events (`item_view`, `inquire`, `buy_now`,
 * `discount_applied`) fire from inside ItemDetail.tsx because they're
 * coupled to specific user actions on that page.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();
  const sessionStartRef = useRef<number>(0);
  const durationSentRef = useRef<boolean>(false);

  // Page view on every pathname change. Also seeds the session-start
  // timestamp on first mount (kept out of useRef's initial value because
  // Date.now() is impure and the lint rule flags that).
  useEffect(() => {
    if (sessionStartRef.current === 0) sessionStartRef.current = Date.now();
    trackEvent('page_view');
  }, [pathname]);

  // Session-end on tab leave / close.
  useEffect(() => {
    function sendSessionDuration() {
      if (durationSentRef.current) return;
      if (sessionStartRef.current === 0) return;
      const secs = Math.round((Date.now() - sessionStartRef.current) / 1000);
      if (secs < 2) return; // ignore instant bounces (same threshold as v1)
      durationSentRef.current = true;
      trackEvent('session_end', null, { duration: secs });
      // If the user comes back (mobile tab switch), let us re-send next time.
      setTimeout(() => {
        durationSentRef.current = false;
      }, 5000);
    }

    function onVisibilityChange() {
      if (document.hidden) sendSessionDuration();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', sendSessionDuration);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', sendSessionDuration);
    };
  }, []);

  return null;
}
