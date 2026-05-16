/**
 * POST /api/admin/send-gift-email
 *
 * Sends an existing gift certificate's code to a recipient via email.
 * Called from the admin Gift Certificates view after creating a cert with
 * a recipient email; admin can also call it later to re-deliver a code.
 *
 * Body: { code: string, amount: number, email: string,
 *         purchaserName?: string, recipientName?: string }
 *
 * Mirrors v1 worker handleSendGiftEmail (worker/square-checkout.js:312-372),
 * but delegates to the existing sendGiftCertEmail helper in lib/email.ts
 * (which the Square webhook already uses for post-purchase delivery).
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { sendGiftCertEmail } from '@/lib/email';

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | {
        code?: string;
        amount?: number;
        email?: string;
        purchaserName?: string;
        recipientName?: string;
      }
    | null;

  if (!body || !body.code || !body.amount || !body.email) {
    return NextResponse.json(
      { error: 'code, amount, and email required' },
      { status: 400 },
    );
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  // Basic email sanity check (a real RFC-5322 regex would be overkill here;
  // Resend will hard-reject obvious junk anyway).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  try {
    await sendGiftCertEmail({
      to: body.email,
      code: body.code,
      amountUsd: amount,
      purchaserName: body.purchaserName ?? null,
      recipientName: body.recipientName ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Don't surface raw Resend errors directly — log + return a sanitized
    // message the admin can act on.
    console.warn('[send-gift-email] failed:', msg);
    return NextResponse.json(
      { error: 'Email delivery failed. Try again or copy the code manually.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
