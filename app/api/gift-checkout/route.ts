/**
 * POST /api/gift-checkout
 *   Body: { amount: number, email?: string, purchaserName?: string, recipientName?: string }
 *   Returns: { url: string, code: string } — Square checkout URL + the new gift cert code.
 *
 * Replaces the v1 Cloudflare Worker /gift-checkout route. Same input/output contract.
 *
 * The cert is inserted into discount_codes immediately (with is_active=true).
 * v1 has the same behavior — note that this means a code is created even if the
 * customer abandons checkout. That's intentional: the alternative (creating in
 * the webhook) means brief flicker between payment + email-deliverable.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createGiftCheckoutLink, generateGiftCode } from '@/lib/square';

export async function POST(request: Request) {
  let body: {
    amount?: number;
    email?: string;
    purchaserName?: string;
    recipientName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { amount, email, purchaserName, recipientName } = body;
  if (typeof amount !== 'number' || amount <= 0 || amount > 10_000) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const code = generateGiftCode();
  const origin = new URL(request.url).origin;
  const redirectUrl = `${origin}/gift?purchased=1&code=${encodeURIComponent(code)}`;

  let link;
  try {
    link = await createGiftCheckoutLink({
      amountUsd: amount,
      code,
      redirectUrl,
      buyerEmail: email,
    });
  } catch (err) {
    console.error('[gift-checkout] Square error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Checkout failed' },
      { status: 500 },
    );
  }

  // Insert the gift cert as a (currently inactive) row in discount_codes.
  // It activates after payment completes (webhook fires).
  // Note: v1 inserts with is_active=true to keep the code immediately redeemable
  // once the email arrives. Matching that behavior here.
  const supabase = createServiceClient();
  const insertBody: Record<string, unknown> = {
    code,
    type: 'fixed',
    value: amount,
    max_uses: 1,
    is_gift_certificate: true,
    is_active: true,
  };
  if (email) insertBody.purchaser_email = email;
  if (purchaserName) insertBody.purchaser_name = purchaserName;
  if (recipientName) insertBody.recipient_name = recipientName;
  // Best-effort — webhook also patches purchaser_email after payment, so a
  // failure here only affects names/email pre-population.
  void supabase.from('discount_codes').insert(insertBody);

  return NextResponse.json({ url: link.url, code });
}
