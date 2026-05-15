/**
 * PATCH /api/admin/giftcerts/[id] → currently only supports `is_active` toggle
 *                                   (the "Void" button in the admin UI).
 *
 * We do NOT expose price / code / max_uses edits — once a gift cert is created,
 * its terms are fixed. The only legitimate mutation is voiding (setting
 * is_active=false), and only on un-redeemed certs.
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
    return NextResponse.json(
      { error: 'Body must be {is_active: boolean}' },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Defensive read: we only allow voiding gift certs (is_gift_certificate=true),
  // and only when they haven't been redeemed yet. Voiding a redeemed cert
  // would be a no-op anyway, but we'd rather 4xx than silently succeed.
  const { data: existing, error: readErr } = await supabase
    .from('discount_codes')
    .select('id, is_gift_certificate, used_count, max_uses')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!existing.is_gift_certificate) {
    return NextResponse.json({ error: 'Not a gift certificate' }, { status: 400 });
  }
  if (existing.used_count >= (existing.max_uses ?? 1) && body.is_active === false) {
    return NextResponse.json(
      { error: 'Cannot void a redeemed gift certificate' },
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
