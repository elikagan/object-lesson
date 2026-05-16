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
    ];
  },
};

export default nextConfig;
