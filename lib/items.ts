/**
 * Helpers for working with items + their images.
 *
 * Image storage: items reference image paths like "images/products/000079/foo.jpg".
 * Those paths live in the Supabase Storage `product-images` bucket.
 * `imgUrl()` and `thumbUrl()` produce the public URL the browser can load.
 */
import type { Item, Category } from './types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images`;

/** Full-resolution image URL. */
export function imgUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${STORAGE_BASE}/${path}`;
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
