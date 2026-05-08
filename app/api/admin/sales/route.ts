/**
 * GET /api/admin/sales
 *   Returns all sales records, ordered most-recent-first.
 *   Used by the admin sales view.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sales: data ?? [] });
}
