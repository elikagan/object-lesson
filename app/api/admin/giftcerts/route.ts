/**
 * GET  /api/admin/giftcerts → list all gift cert rows (is_gift_certificate=true), most-recent-first.
 * POST /api/admin/giftcerts → create a new gift cert.
 *
 * The server generates the GIFT-XXXX-XXXX code using the same 32-char
 * "no ambiguous letters" alphabet as v1 admin/app.js:2182-2186. We retry
 * on the rare collision (unique constraint on `code`).
 *
 * v1 wrote to Supabase directly from the browser using a public key.
 * v2 follows the "no client-side secrets" rule — every write goes through
 * a server route signed with the service-role key.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';

// 32-char alphabet: removes 0/O/1/I/L to avoid look-alikes in printed codes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateGiftCode(): string {
  let code = 'GIFT-';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('is_gift_certificate', true)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ giftcerts: data ?? [] });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | {
        amount?: number;
        purchaser_name?: string;
        recipient_name?: string;
        purchaser_email?: string;
      }
    | null;

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return NextResponse.json({ error: 'Amount must be between $0 and $10,000' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Retry on the unlikely event of a code collision (32^8 ≈ 10^12 possibilities,
  // but defensive is cheap). Three attempts is comfortably more than enough.
  let attempt = 0;
  while (attempt < 3) {
    const code = generateGiftCode();
    const insert: Record<string, unknown> = {
      code,
      type: 'fixed',
      value: amount,
      max_uses: 1,
      is_gift_certificate: true,
      is_active: true,
    };
    if (body.purchaser_name?.trim()) insert.purchaser_name = body.purchaser_name.trim();
    if (body.recipient_name?.trim()) insert.recipient_name = body.recipient_name.trim();
    if (body.purchaser_email?.trim()) insert.purchaser_email = body.purchaser_email.trim();

    const { data, error } = await supabase
      .from('discount_codes')
      .insert(insert)
      .select('*')
      .single();

    if (!error) return NextResponse.json({ giftcert: data });
    // 23505 = unique_violation in Postgres
    if (error.code !== '23505') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    attempt++;
  }

  return NextResponse.json({ error: 'Could not generate a unique gift code' }, { status: 500 });
}
