// Object Lesson Admin — service worker for offline shell + Add to Home Screen.
//
// Scope is /admin/ (declared via Service-Worker-Allowed header, see
// next.config.ts). The SW only claims requests inside the admin scope —
// the public site is unaffected by registration/unregistration.
//
// Cache strategy:
//   - /_next/static/*  → cache-first (immutable hashed bundles).
//   - GET /admin*      → network-first; cache the latest HTML so a
//                        flaky connection still loads the editor shell.
//   - /api/*           → never cache; always network. Failures bubble.
//   - everything else  → pass-through (fetch only).
//
// The cache name embeds a version constant. Bump CACHE_VERSION on any
// change to this file so old clients shed stale code.

const CACHE_VERSION = 'ol-admin-v1';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

const SHELL_URLS = ['/admin/', '/admin', '/OL_logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(RUNTIME_CACHE)
      .then((cache) =>
        // Pre-cache shell HTML opportunistically; failures here don't
        // block install (a route might 401 if the SW boots before PIN
        // auth, which is fine — we'll cache on the next live fetch).
        Promise.allSettled(
          SHELL_URLS.map((u) => cache.add(u).catch(() => null)),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== RUNTIME_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isAdminHtml(url) {
  // The admin shell HTML. Excludes /admin-sw.js and /admin-manifest.*.
  if (!url.pathname.startsWith('/admin')) return false;
  if (url.pathname.startsWith('/admin-')) return false;
  return true;
}

function isApi(url) {
  return url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isApi(url)) {
    // Never cache API requests — they're personal/sensitive and the
    // admin needs to see fresh data or fail.
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (isAdminHtml(url)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          // Last resort: serve the shell so we at least render.
          const shell = await cache.match('/admin');
          if (shell) return shell;
          throw new Error('offline and no cache available');
        }
      })(),
    );
  }
});
