/**
 * GET  /api/admin/discounts → list non-gift-cert discount codes, newest first.
 * POST /api/admin/discounts → create a new discount code.
 *
 * Gift certs live in the same Postgres table (`discount_codes`) but are
 * surfaced through /api/admin/giftcerts and the giftcerts admin view.
 * Both endpoints filter on `is_gift_certificate` so the two surfaces
 * stay disjoint.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';

const ALLOWED_TYPES = new Set(['percent', 'fixed']);

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('discount_codes')
    .select('id, code, type, value, is_active, max_uses, used_count, created_at')
    .eq('is_gift_certificate', false)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ discounts: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | {
        code?: string;
        type?: string;
        value?: number;
        max_uses?: number | null;
      }
    | null;

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const code = (body.code ?? '').trim().toUpperCase();
  const type = body.type ?? '';
  const value = Number(body.value);
  const maxUses = body.max_uses == null ? null : Number(body.max_uses);

  if (!code || code.length < 3 || code.length > 32) {
    return NextResponse.json({ error: 'Code must be 3–32 characters' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: 'type must be "percent" or "fixed"' }, { status: 400 });
  }
  if (!Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'value must be > 0' }, { status: 400 });
  }
  if (type === 'percent' && value > 100) {
    return NextResponse.json({ error: 'percent value must be ≤ 100' }, { status: 400 });
  }
  if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) {
    return NextResponse.json({ error: 'max_uses must be ≥ 1 if set' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const insert: Record<string, unknown> = {
    code,
    type,
    value,
    max_uses: maxUses,
    is_active: true,
    is_gift_certificate: false,
  };

  const { data, error } = await supabase
    .from('discount_codes')
    .insert(insert)
    .select('id, code, type, value, is_active, max_uses, used_count, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A code with that name already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ discount: data });
}
