/**
 * GET  /api/admin/items   → list all items, including sold
 * POST /api/admin/items   → create new item, body matches Item shape (snake_case)
 *
 * Both require admin cookie (requireAdmin guard).
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .order('display_order', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Required fields
  const required = ['id', 'title', 'category'] as const;
  for (const f of required) {
    if (!body[f]) {
      return NextResponse.json({ error: `Missing field: ${f}` }, { status: 400 });
    }
  }

  // Determine display_order: lowest existing - 1 (so the new item appears at top)
  const supabase = createServiceClient();
  const { data: minRow, error: minErr } = await supabase
    .from('items')
    .select('display_order')
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (minErr) return NextResponse.json({ error: minErr.message }, { status: 500 });
  const newOrder = (minRow?.display_order ?? 0) - 1;

  const insert = {
    id: body.id,
    title: body.title,
    description: body.description ?? '',
    price: typeof body.price === 'number' ? body.price : 0,
    size: body.size ?? '',
    category: body.category,
    maker: body.maker ?? '',
    condition: body.condition ?? '',
    dealer_code: body.dealer_code ?? '',
    posted_by: body.posted_by ?? '',
    is_new: !!body.is_new,
    is_hold: !!body.is_hold,
    is_sold: !!body.is_sold,
    hero_image: body.hero_image ?? null,
    images: Array.isArray(body.images) ? body.images : [],
    display_order: newOrder,
  };

  const { data, error } = await supabase.from('items').insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
