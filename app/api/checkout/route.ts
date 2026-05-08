/**
 * POST /api/checkout
 *   Body: { itemId: string, title: string, price: number, discountCode?: string }
 *   Returns: { url: string } — the Square hosted checkout URL.
 *
 * Replaces the v1 Cloudflare Worker /checkout route. Same input/output contract.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createItemCheckoutLink } from '@/lib/square';

type DiscountRow = {
  id: string | number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  max_uses: number | null;
  used_count: number;
};

export async function POST(request: Request) {
  let body: { itemId?: string; title?: string; price?: number; discountCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Input validation matching v1 worker behavior
  const { itemId, title, price, discountCode } = body;
  if (typeof price !== 'number' || price <= 0 || price > 100_000) {
    return NextResponse.json({ error: 'Invalid price' }, { status: 400 });
  }
  if (typeof itemId !== 'string' || !/^\d{1,8}$/.test(itemId)) {
    return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
  }
  if (typeof title !== 'string' || title.length < 1 || title.length > 200) {
    return NextResponse.json({ error: 'Invalid title' }, { status: 400 });
  }

  // Validate discount code (if any) BEFORE creating the Square link
  let appliedDiscount: DiscountRow | null = null;
  const supabase = createServiceClient();
  if (discountCode) {
    const { data, error } = await supabase
      .from('discount_codes')
      .select('id, code, type, value, max_uses, used_count')
      .eq('code', discountCode.toUpperCase())
      .eq('is_active', true)
      .limit(1);
    if (!error && data && data.length > 0) {
      const dc = data[0] as DiscountRow;
      if (!dc.max_uses || dc.used_count < dc.max_uses) {
        appliedDiscount = dc;
      }
    }
  }

  // Build redirect URL pointing back at the originating site
  // (works for staging and production without code changes).
  const origin = new URL(request.url).origin;
  const redirectUrl = `${origin}/item/${itemId}?purchased=1`;

  let link;
  try {
    link = await createItemCheckoutLink({
      itemId,
      title,
      priceUsd: price,
      redirectUrl,
      discount: appliedDiscount
        ? { type: appliedDiscount.type, value: Number(appliedDiscount.value), code: appliedDiscount.code }
        : undefined,
    });
  } catch (err) {
    console.error('[checkout] Square error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Checkout failed' },
      { status: 500 },
    );
  }

  // Increment used_count on the discount code (best-effort — non-fatal)
  if (appliedDiscount) {
    void supabase
      .from('discount_codes')
      .update({ used_count: appliedDiscount.used_count + 1 })
      .eq('id', appliedDiscount.id);
  }

  return NextResponse.json({ url: link.url });
}
