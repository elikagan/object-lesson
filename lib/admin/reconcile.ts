/**
 * Sales reconciliation — catches webhook misses where a Square sale row
 * exists but the corresponding `items.is_sold` flag never flipped (e.g.
 * the webhook fired but the Supabase update silently failed).
 *
 * Mirrors v1 admin/app.js reconcileSales() (lines 378-404). Runs at admin
 * list load time — fast no-op when there's nothing to fix.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ReconcileResult = { fixed: number; ids: string[] };

export async function reconcileSales(
  supabase: SupabaseClient,
): Promise<ReconcileResult> {
  // Pull just the columns we need.
  // - sales: item-type rows only (gift certs don't flip items).
  // - items: id + is_sold so we can detect mismatches.
  const [salesRes, itemsRes] = await Promise.all([
    supabase.from('sales').select('item_id').eq('type', 'item').not('item_id', 'is', null),
    supabase.from('items').select('id, is_sold'),
  ]);

  if (salesRes.error || itemsRes.error) {
    // Reconciliation is best-effort; surface the error but don't fail the
    // page load.
    console.warn(
      '[reconcile] read failed:',
      salesRes.error?.message ?? itemsRes.error?.message,
    );
    return { fixed: 0, ids: [] };
  }

  const soldIds = new Set(
    (salesRes.data ?? [])
      .map((r) => r.item_id as string | null)
      .filter((id): id is string => !!id),
  );
  const mismatches = (itemsRes.data ?? []).filter(
    (i) => !i.is_sold && soldIds.has(i.id as string),
  ) as { id: string }[];

  if (mismatches.length === 0) return { fixed: 0, ids: [] };

  // Single batched update via .in() — one round trip, not one per id.
  // Same fields v1 cleared: is_sold=true, is_new=false, is_hold=false.
  const ids = mismatches.map((m) => m.id);
  const { error } = await supabase
    .from('items')
    .update({ is_sold: true, is_new: false, is_hold: false })
    .in('id', ids);
  if (error) {
    console.warn('[reconcile] write failed:', error.message);
    return { fixed: 0, ids: [] };
  }

  console.log(`[reconcile] fixed ${ids.length} items not marked sold: ${ids.join(', ')}`);
  return { fixed: ids.length, ids };
}
