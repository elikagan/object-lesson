/**
 * Square Online Checkout helpers.
 *
 * The shop uses Square's hosted "payment links" — we POST an order spec, Square
 * returns a hosted checkout URL, the customer pays there, and Square fires a
 * webhook back when the payment completes.
 */
import 'server-only';

const SQUARE_API = 'https://connect.squareup.com/v2';
const SQUARE_VERSION = '2024-12-18';

function token() {
  const t = process.env.SQUARE_ACCESS_TOKEN;
  if (!t) throw new Error('SQUARE_ACCESS_TOKEN not configured');
  return t;
}
function locationId() {
  const id = process.env.SQUARE_LOCATION_ID;
  if (!id) throw new Error('SQUARE_LOCATION_ID not configured');
  return id;
}

export type CheckoutLink = { url: string };

type DiscountSpec =
  | { type: 'percent'; value: number; code: string }
  | { type: 'fixed'; value: number; code: string };

/**
 * Create a payment link for a single inventory item.
 * Mirrors v1 worker handleCheckout(). Tax line included; discount applied if provided.
 */
export async function createItemCheckoutLink(opts: {
  title: string;
  priceUsd: number;
  itemId: string;
  redirectUrl: string;
  discount?: DiscountSpec;
}): Promise<CheckoutLink> {
  const amountCents = Math.round(opts.priceUsd * 100);
  const orderBody: Record<string, unknown> = {
    location_id: locationId(),
    line_items: [
      {
        name: opts.title,
        quantity: '1',
        base_price_money: { amount: amountCents, currency: 'USD' },
      },
    ],
    taxes: [
      {
        uid: 'ca-sales-tax',
        name: 'CA Sales Tax',
        percentage: '10.25',
        scope: 'ORDER',
      },
    ],
  };

  if (opts.discount) {
    if (opts.discount.type === 'percent') {
      orderBody.discounts = [
        {
          uid: 'promo',
          name: `Discount (${opts.discount.code})`,
          percentage: String(opts.discount.value),
          scope: 'ORDER',
        },
      ];
    } else {
      orderBody.discounts = [
        {
          uid: 'promo',
          name: `Discount (${opts.discount.code})`,
          amount_money: {
            amount: Math.round(opts.discount.value * 100),
            currency: 'USD',
          },
          scope: 'ORDER',
        },
      ];
    }
  }

  const res = await fetch(`${SQUARE_API}/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: orderBody,
      checkout_options: {
        redirect_url: opts.redirectUrl,
        ask_for_shipping_address: true,
      },
      payment_note: `Object Lesson | ${opts.title} (${opts.itemId})`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const detail = data.errors?.[0]?.detail || `Square HTTP ${res.status}`;
    throw new Error(detail);
  }

  const url = data.payment_link?.url ?? '';
  if (!url.startsWith('https://square.link/') && !url.startsWith('https://checkout.square.site/')) {
    throw new Error('Unexpected checkout URL from Square');
  }
  return { url };
}

/**
 * Create a payment link for a gift certificate purchase.
 * Mirrors v1 worker handleGiftCheckout(). No tax (gift certs are not taxable).
 */
export async function createGiftCheckoutLink(opts: {
  amountUsd: number;
  code: string;
  redirectUrl: string;
  buyerEmail?: string;
}): Promise<CheckoutLink> {
  const amountCents = Math.round(opts.amountUsd * 100);
  const orderBody = {
    location_id: locationId(),
    line_items: [
      {
        name: `Gift Certificate - $${opts.amountUsd}`,
        quantity: '1',
        base_price_money: { amount: amountCents, currency: 'USD' },
      },
    ],
  };

  const res = await fetch(`${SQUARE_API}/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      order: orderBody,
      checkout_options: {
        redirect_url: opts.redirectUrl,
        ask_for_shipping_address: false,
      },
      ...(opts.buyerEmail ? { pre_populated_data: { buyer_email: opts.buyerEmail } } : {}),
      payment_note: `Object Lesson | Gift Certificate (${opts.code})`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const detail = data.errors?.[0]?.detail || `Square HTTP ${res.status}`;
    throw new Error(detail);
  }

  const url = data.payment_link?.url ?? '';
  if (!url.startsWith('https://square.link/') && !url.startsWith('https://checkout.square.site/')) {
    throw new Error('Unexpected checkout URL from Square');
  }
  return { url };
}

/**
 * Verify Square's HMAC-SHA-256 webhook signature.
 *
 * Signature payload = exact request URL + raw request body.
 * Square header: x-square-hmacsha256-signature, base64-encoded.
 *
 * Returns true if signature matches OR if no signature key is configured (dev).
 */
export async function verifySquareWebhook(opts: {
  url: string;
  rawBody: string;
  signature: string | null;
}): Promise<boolean> {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) {
    // Dev environments may not have the key set; log a warning and skip verification.
    console.warn('[square webhook] no signature key configured; skipping verification');
    return true;
  }
  if (!opts.signature) return false;

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(opts.url + opts.rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return expected === opts.signature;
}

/** Generate a gift cert code in the GIFT-XXXX-XXXX format. */
export function generateGiftCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `GIFT-${part()}-${part()}`;
}
