/**
 * POST /api/webhook/square
 *   Square's webhook endpoint. Signed with HMAC-SHA-256 over the request URL +
 *   raw body. We verify the signature, parse the event, and on COMPLETED payments:
 *     - mark the item sold (UPDATE one row in items table — the architectural fix)
 *     - record a row in sales (with customer name + posted_by for commission tracking)
 *     - capture the buyer email
 *     - send the gift cert email via Resend if it's a gift cert purchase
 *
 * Replaces v1 Cloudflare Worker /webhook route. Same behavior, modern stack.
 */
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifySquareWebhook } from '@/lib/square';
import { sendGiftCertEmail } from '@/lib/email';

// Force dynamic — we need the raw body for HMAC verification, and Next.js
// otherwise might cache or transform the request.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SquarePayment = {
  id?: string;
  status?: string;
  note?: string;
  amount_money?: { amount?: number; currency?: string };
  buyer_email_address?: string;
  card_details?: { card?: { cardholder_name?: string } };
  shipping_address?: { first_name?: string; last_name?: string };
};

type SquareEvent = {
  type?: string;
  data?: { object?: { payment?: SquarePayment } };
};

export async function POST(request: Request) {
  // Read the RAW body first — we need it for signature verification.
  // Square signs URL + raw body; any reformatting would break the signature.
  const rawBody = await request.text();
  const signature = request.headers.get('x-square-hmacsha256-signature');
  const url = request.url;

  const valid = await verifySquareWebhook({ url, rawBody, signature });
  if (!valid) {
    console.warn('[webhook] signature verification failed');
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let event: SquareEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  // We only care about completed payments
  if (event.type !== 'payment.updated') {
    return new NextResponse('OK (ignored event type)', { status: 200 });
  }
  const payment = event.data?.object?.payment;
  if (!payment || payment.status !== 'COMPLETED') {
    return new NextResponse('OK (not completed)', { status: 200 });
  }

  const note = payment.note ?? '';
  const amountUsd = (payment.amount_money?.amount ?? 0) / 100;
  const isGiftCert = note.includes('Gift Certificate');

  // Extract the id from the note: "Object Lesson | <title> (<id>)"
  // For gift certs, <id> is the GIFT-XXXX-XXXX code; for items, the numeric id.
  let extractedId: string | null = null;
  let itemInfo = '';
  if (note.startsWith('Object Lesson |')) {
    itemInfo = note.replace('Object Lesson | ', '');
    const m = note.match(/\(([^)]+)\)$/);
    extractedId = m ? m[1] : null;
  }

  const supabase = createServiceClient();

  // 1. Mark the item sold (only for item purchases, not gift certs).
  //    UPDATE one row — the architectural fix. is_new and is_hold get cleared too.
  if (!isGiftCert && extractedId && /^\d{1,8}$/.test(extractedId)) {
    const { error } = await supabase
      .from('items')
      .update({ is_sold: true, is_new: false, is_hold: false })
      .eq('id', extractedId);
    if (error) console.error(`[webhook] mark-sold ${extractedId} failed:`, error.message);
  }

  // 2. Capture the buyer email — useful for marketing + customer service.
  const buyerEmail = payment.buyer_email_address ?? null;
  if (buyerEmail) {
    const { error } = await supabase
      .from('emails')
      .insert({
        email: buyerEmail,
        source: 'purchase',
        item_id: !isGiftCert && extractedId ? extractedId : null,
      });
    // Ignore duplicate-email errors (unique constraint on email column)
    if (error && !error.message.includes('duplicate')) {
      console.warn('[webhook] email capture failed:', error.message);
    }
  }

  // 3. Send the gift cert email + patch purchaser_email on the cert record.
  if (isGiftCert && extractedId && buyerEmail) {
    try {
      const { data: gcRows } = await supabase
        .from('discount_codes')
        .select('value, purchaser_name, recipient_name')
        .eq('code', extractedId)
        .eq('is_gift_certificate', true)
        .limit(1);
      const gc = gcRows?.[0] as
        | { value: number; purchaser_name: string | null; recipient_name: string | null }
        | undefined;

      // Patch purchaser_email so we know who bought it
      void supabase
        .from('discount_codes')
        .update({ purchaser_email: buyerEmail })
        .eq('code', extractedId);

      await sendGiftCertEmail({
        to: buyerEmail,
        code: extractedId,
        amountUsd: gc?.value ?? amountUsd,
        purchaserName: gc?.purchaser_name ?? null,
        recipientName: gc?.recipient_name ?? null,
      });
    } catch (e) {
      console.error('[webhook] gift cert email failed:', e);
    }
  }

  // 4. Record the sale in the sales table (idempotent on square_payment_id).
  if (note.startsWith('Object Lesson |')) {
    let cardholderName = payment.card_details?.card?.cardholder_name ?? null;
    if (!cardholderName && payment.shipping_address) {
      const a = payment.shipping_address;
      const composed = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim();
      if (composed) cardholderName = composed;
    }

    // Look up posted_by from items for commission tracking
    let postedBy: string | null = null;
    if (extractedId && !isGiftCert) {
      const { data } = await supabase
        .from('items')
        .select('posted_by')
        .eq('id', extractedId)
        .maybeSingle();
      if (data?.posted_by) postedBy = data.posted_by;
    }

    const { error } = await supabase.from('sales').insert({
      type: isGiftCert ? 'gift_certificate' : 'item',
      amount: amountUsd,
      customer_email: buyerEmail,
      customer_name: cardholderName,
      item_id: !isGiftCert ? extractedId : null,
      item_title: isGiftCert ? `Gift Certificate - $${amountUsd}` : itemInfo,
      gift_code: isGiftCert ? extractedId : null,
      posted_by: postedBy,
      square_payment_id: payment.id ?? null,
      note,
    });
    if (error && !error.message.includes('duplicate')) {
      console.warn('[webhook] sales insert failed:', error.message);
    }
  }

  return new NextResponse('OK', { status: 200 });
}
