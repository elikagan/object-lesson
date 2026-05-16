/**
 * Helpers for working with items + their images.
 *
 * Image storage: items reference image paths like "images/products/000079/foo.jpg".
 * Those paths live in the Supabase Storage `product-images` bucket.
 *
 * `imgUrl()` returns a same-origin `/img/<path>` URL. Vercel rewrites
 * that to the Supabase Storage URL server-side (see next.config.ts) and
 * adds a 1-year immutable Cache-Control header on the response — the
 * long-TTL edge cache that v1 had via its Cloudflare Worker `/img/*`
 * proxy. Supabase Storage itself sends `cache-control: no-cache`
 * regardless of upload options, which is why we don't link directly.
 */
import type { Item, Category } from './types';

/**
 * Full-resolution image URL, routed through Vercel's edge cache.
 * Caller passes the storage path (e.g. "images/products/000079/foo.jpg")
 * and we return "/img/images/products/000079/foo.jpg". The rewrite in
 * next.config.ts maps that to the Supabase Storage public URL.
 *
 * Use this for `<img>` tags rendered in the browser. For Open Graph or
 * JSON-LD metadata, where Google / Meta need an absolute URL to crawl,
 * use `absoluteImgUrl()` instead.
 */
export function imgUrl(path: string | null | undefined): string {
  if (!path) return '';
  // External absolute URLs pass through unchanged.
  if (path.startsWith('http')) return path;
  const clean = path.replace(/^\/+/, '');
  return `/img/${clean}`;
}

const SITE_ORIGIN = 'https://objectlesson.la';

/**
 * Same as imgUrl() but returns a fully-qualified absolute URL on the
 * production origin. Required by Open Graph + JSON-LD which are crawled
 * from a different origin than the page they're declared on.
 */
export function absoluteImgUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const clean = path.replace(/^\/+/, '');
  return `${SITE_ORIGIN}/img/${clean}`;
}

/** 400px thumbnail URL — converts `foo.jpg` → `thumb_foo.jpg`. */
export function thumbUrl(path: string | null | undefined): string {
  if (!path) return '';
  const thumbPath = path.replace(/([^/]+)$/, 'thumb_$1');
  return imgUrl(thumbPath);
}

/** Format an item id as A000079 for display. */
export function formatId(id: string): string {
  const n = parseInt(id, 10);
  if (Number.isNaN(n)) return 'A' + id;
  return 'A' + String(n).padStart(6, '0');
}

/** Hero image path for an item — heroImage if set, else first in images[]. */
export function heroOf(item: Pick<Item, 'hero_image' | 'images'>): string {
  return item.hero_image || (item.images && item.images[0]) || '';
}

/** "New" badge auto-expires 7 days after createdAt. */
const NEW_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export function isItemNew(item: Pick<Item, 'is_new' | 'created_at'>): boolean {
  if (!item.is_new) return false;
  if (!item.created_at) return false;
  return Date.now() - new Date(item.created_at).getTime() < NEW_DURATION_MS;
}

/** Apply category/price filter to a list. */
export function filterItems(items: Item[], filter: string): Item[] {
  if (filter === 'all') {
    // Sold items pushed to the end
    const available = items.filter((i) => !i.is_sold);
    const sold = items.filter((i) => i.is_sold);
    return [...available, ...sold];
  }
  if (filter === 'under-400') {
    return items.filter((i) => !i.is_sold && Number(i.price) > 0 && Number(i.price) < 400);
  }
  return items.filter((i) => !i.is_sold && i.category === (filter as Category));
}
