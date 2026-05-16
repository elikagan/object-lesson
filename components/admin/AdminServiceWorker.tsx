'use client';

import { useEffect } from 'react';

/**
 * Registers the admin service worker once per session. Scoped to /admin/
 * via the Service-Worker-Allowed header on /admin-sw.js (see next.config.ts).
 *
 * The SW provides offline shell + Add to Home Screen support — see
 * public/admin-sw.js for the cache strategy. Failures are silent: the
 * admin works fine without a SW.
 */
export function AdminServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Don't try to register on http:// (SW requires secure context).
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      return;
    }
    navigator.serviceWorker
      .register('/admin-sw.js', { scope: '/admin/' })
      .catch((err) => {
        // Non-fatal — admin works without the SW.
        console.warn('[admin sw] register failed:', err);
      });
  }, []);
  return null;
}
