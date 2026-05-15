/**
 * PATCH /api/admin/discounts/[id] → toggle `is_active`. Refuses to touch
 *                                   rows where is_gift_certificate=true
 *                                   (those belong to /api/admin/giftcerts).
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { is_active?: boolean } | null;
  if (!body || typeof body !== 'object' || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'Body must be {is_active: boolean}' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: existing, error: readErr } = await supabase
    .from('discount_codes')
    .select('id, is_gift_certificate')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.is_gift_certificate) {
    return NextResponse.json(
      { error: 'Use /api/admin/giftcerts for gift cert rows' },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from('discount_codes')
    .update({ is_active: body.is_active })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
