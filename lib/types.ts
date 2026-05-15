/**
 * Item — the shape of a row in `public.items` (Supabase schema).
 * Matches the snake_case columns from Postgres directly.
 */
export type Item = {
  id: string;
  title: string;
  description: string;
  price: number;
  size: string;
  category: Category;
  maker: string;
  condition: Condition;
  dealer_code: string;
  posted_by: string;
  is_new: boolean;
  is_hold: boolean;
  is_sold: boolean;
  hero_image: string | null;
  images: string[];
  display_order: number;
  created_at: string;
  updated_at: string;
};

export type Category =
  | 'wall-art'
  | 'object'
  | 'ceramic'
  | 'furniture'
  | 'light'
  | 'sculpture'
  | 'misc';

export type Condition = 'New' | 'Like New' | 'Good' | 'Fair' | '';

export const CATEGORY_LABELS: Record<Category, string> = {
  'wall-art': 'Wall Art',
  object: 'Object',
  ceramic: 'Ceramic',
  furniture: 'Furniture',
  light: 'Light',
  sculpture: 'Sculpture',
  misc: 'Misc',
};

export const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'under-400', label: 'Under $400' },
  { value: 'wall-art', label: 'Wall Art' },
  { value: 'object', label: 'Object' },
  { value: 'ceramic', label: 'Ceramic' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'light', label: 'Light' },
  { value: 'sculpture', label: 'Sculpture' },
  { value: 'misc', label: 'Misc' },
];

/**
 * Sale — row in `public.sales`. Written by the Square webhook; read by the
 * admin sales view. Shape derived from the migration-backup JSON snapshot
 * under `migration-backup/cutover-{date}/sales.json`.
 */
export type SaleType = 'item' | 'gift_certificate';

export type Sale = {
  id: string;
  type: SaleType;
  amount: number;
  customer_email: string | null;
  customer_name: string | null;
  item_id: string | null;
  item_title: string | null;
  gift_code: string | null;
  discount_code: string | null;
  discount_amount: number | null;
  square_payment_id: string | null;
  note: string | null;
  posted_by: string | null;
  created_at: string;
};

/**
 * GiftCert — row in `public.discount_codes` with `is_gift_certificate = true`.
 * The same table holds discount codes (marketing) and gift cert codes; the
 * boolean discriminator splits them. Field shapes confirmed against
 * `migration-backup/cutover-{date}/discount_codes.json`.
 */
export type GiftCert = {
  id: string;
  code: string;
  type: 'fixed';
  value: number;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  is_gift_certificate: true;
  purchaser_name: string | null;
  recipient_name: string | null;
  purchaser_email: string | null;
  created_at: string;
};

export type GiftCertStatus = 'Active' | 'Redeemed' | 'Voided';

export function giftCertStatus(g: GiftCert): GiftCertStatus {
  if (!g.is_active) return 'Voided';
  if (g.used_count >= (g.max_uses || 1)) return 'Redeemed';
  return 'Active';
}
