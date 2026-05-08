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
