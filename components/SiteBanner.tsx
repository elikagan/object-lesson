'use client';

import { useState } from 'react';

/** "We're adding more..." dismissable banner. Persists dismissal in localStorage. */
export function SiteBanner({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="site-banner" id="site-banner">
      {children}
      <button
        className="banner-close"
        onClick={() => setHidden(true)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
