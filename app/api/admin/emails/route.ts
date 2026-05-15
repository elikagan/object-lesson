/**
 * GET /api/admin/emails → list newsletter / purchase / cart subscribers,
 *                         most recent first, capped at 500 (matches v1).
 *
 * Read-only — no writes. The public site adds rows here from EmailBar and
 * the Square webhook; admin only consumes.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('emails')
    .select('email, source, discount_code, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ emails: data ?? [] });
}
