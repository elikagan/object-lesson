/**
 * Resend email helpers — gift certificate delivery.
 */
import 'server-only';

const RESEND_API = 'https://api.resend.com/emails';
const FROM = 'Object Lesson <gift@objectlesson.la>';

function token() {
  const t = process.env.RESEND_API_KEY;
  if (!t) throw new Error('RESEND_API_KEY not configured');
  return t;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send a gift cert confirmation/delivery email.
 * Body matches v1 worker handleSendGiftEmail() / webhook gift cert path verbatim.
 */
export async function sendGiftCertEmail(opts: {
  to: string;
  code: string;
  amountUsd: number;
  purchaserName?: string | null;
  recipientName?: string | null;
}): Promise<void> {
  const purchaser = opts.purchaserName ? escapeHtml(opts.purchaserName) : '';
  const recipient = opts.recipientName ? escapeHtml(opts.recipientName) : '';
  const fromLine = purchaser ? `<p style="color:#888;font-size:14px;">From: ${purchaser}</p>` : '';
  const toLine = recipient ? `<p style="color:#888;font-size:14px;">To: ${recipient}</p>` : '';
  const code = escapeHtml(opts.code);

  const html = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
      <h1 style="font-size:20px;font-weight:500;margin-bottom:24px;">Gift Certificate</h1>
      ${toLine}${fromLine}
      <p style="font-size:15px;color:#555;line-height:1.6;margin-bottom:24px;">
        Here's your Object Lesson gift certificate. Give this code to the recipient to use at checkout.
      </p>
      <div style="text-align:center;padding:24px;border:2px solid #1a1a1a;border-radius:12px;margin-bottom:24px;">
        <div style="font-size:14px;color:#888;margin-bottom:8px;">GIFT CERTIFICATE CODE</div>
        <div style="font-size:28px;font-weight:600;letter-spacing:0.06em;">${code}</div>
        <div style="font-size:16px;color:#888;margin-top:8px;">$${opts.amountUsd}</div>
      </div>
      <p style="font-size:14px;color:#888;line-height:1.6;">
        This code can be used at checkout on <a href="https://objectlesson.la" style="color:#1a1a1a;">objectlesson.la</a> or in-store at Object Lesson in Pasadena. It does not expire.
      </p>
      <hr style="border:none;border-top:1px solid #ddd;margin:32px 0;">
      <p style="font-size:12px;color:#aaa;">Object Lesson — Uncommon Objects, Art and Design<br>Pasadena, CA</p>
    </div>
  `;

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [opts.to],
      subject: `Your Object Lesson Gift Certificate - $${opts.amountUsd}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }
}
