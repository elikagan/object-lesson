import type { NextConfig } from 'next';

// Read at build time from env so we don't hardcode the Supabase ref.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const STORAGE_BASE = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public/product-images`
  : '';

const nextConfig: NextConfig = {
  // /img/<path> → Supabase Storage. Routing through our own origin lets
  // us add long-cache headers (Supabase Storage sends cache-control:
  // no-cache for public objects regardless of upload options) and gives
  // us a stable URL surface independent of storage backend.
  //
  // Mirrors v1's Cloudflare Worker /img/* proxy with 1-year edge cache.
  async rewrites() {
    if (!STORAGE_BASE) return [];
    return [
      {
        source: '/img/:path*',
        destination: `${STORAGE_BASE}/:path*`,
      },
    ];
  },
  async headers() {
    // A modest Content Security Policy. Public pages only — admin loads
    // Sortable / dnd-kit assets from same-origin so default-src covers
    // them. Meta Pixel needs facebook.net + connect.facebook.net,
    // Supabase REST needs the project domain, Square's hosted checkout
    // needs square.site (we redirect TO it, not embed). v1 had no CSP;
    // this is a v2 improvement covering P2-29.
    const csp = [
      `default-src 'self'`,
      // Vercel + Next.js inject some inline scripts; Meta Pixel boot is inline.
      `script-src 'self' 'unsafe-inline' https://connect.facebook.net https://www.facebook.com`,
      `style-src 'self' 'unsafe-inline'`,
      // Same-origin /img/* rewrites cover most; allow facebook.com pixel
      // tracking pixel and inline data: URLs (used by AI processing previews).
      `img-src 'self' data: blob: https://www.facebook.com`,
      `font-src 'self' data:`,
      `connect-src 'self' https://*.supabase.co https://api.resend.com https://connect.facebook.net https://www.facebook.com`,
      // No iframes; no Flash.
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self' https://*.squareup.com https://*.square.site`,
    ].join('; ');
    return [
      {
        source: '/img/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Skip admin routes (broader script needs for the editor) and
        // /api (API routes set their own headers).
        source: '/((?!admin|api).*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
