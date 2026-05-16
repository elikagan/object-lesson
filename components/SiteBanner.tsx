'use client';

import { useEffect, useState } from 'react';

const DISMISSED_KEY = 'ol_banner_dismissed';

/**
 * "We're adding more..." dismissable banner. Dismissal persists in
 * localStorage so a returning visitor doesn't see it again on reload.
 *
 * v1 did NOT persist (it only set display:none on click and the banner
 * came back on every page load). v2 persists — small UX improvement
 * over v1, requested by P1-25.
 */
export function SiteBanner({ children }: { children: React.ReactNode }) {
  // Start hidden so SSR doesn't flash the banner for returning visitors.
  // The effect un-hides it after mount if no dismissal flag exists.
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    // Hydration-time read of a client-only API (localStorage). The lint
    // rule flags setState-in-effect, but reading client state and
    // promoting it into render is the canonical use of useEffect.
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY) === '1';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldShow(!dismissed);
    } catch {
      // localStorage unavailable (private mode etc.) — show by default.
      setShouldShow(true);
    }
  }, []);

  if (!shouldShow) return null;

  function dismiss() {
    setShouldShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Ignore — dismissal will only last this page load.
    }
  }

  return (
    <div className="site-banner" id="site-banner">
      {children}
      <button className="banner-close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
