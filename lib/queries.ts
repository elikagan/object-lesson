/**
 * Server-only data fetchers — used by Server Components.
 * The anon key is fine here because RLS allows public SELECT on items.
 */
import 'server-only';
import { createServerClient } from './supabase/server';
import type { Item } from './types';

/** Fetch all items, ordered by display_order ascending. */
export async function getAllItems(): Promise<Item[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('display_order', { ascending: true });
  if (error) {
    console.error('[getAllItems]', error.message);
    return [];
  }
  return (data ?? []) as Item[];
}

/** Fetch one item by id. Returns null if not found. */
export async function getItemById(id: string): Promise<Item | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('[getItemById]', id, error.message);
    return null;
  }
  return (data as Item) ?? null;
}
