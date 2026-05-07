# Architecture

This document explains *why* the stack is what it is. For *how* to run things, see [RUNBOOK.md](./RUNBOOK.md).

## Stack

```
                                ┌──────────────────────────────────────┐
                                │         User's browser                │
                                └────────────────┬─────────────────────┘
                                                 │
                              objectlesson.la (DNS → Vercel)
                                                 │
                ┌────────────────────────────────┼────────────────────────────────┐
                │                                                                 │
                │   Next.js app on Vercel                                         │
                │   ─ Server components → render HTML with data from Supabase    │
                │   ─ Client components → interactivity (forms, mosaic, etc)     │
                │   ─ API routes (`app/api/...`) → server-side actions           │
                │                                                                 │
                └─────────┬────────────────────────────┬──────────────┬──────────┘
                          │                            │              │
                          ▼                            ▼              ▼
                  ┌──────────────┐            ┌────────────────┐  ┌─────────┐
                  │   Supabase   │            │     Square     │  │ Resend  │
                  │   Postgres   │            │  payment links │  │  email  │
                  │   Storage    │            │  + webhooks    │  └─────────┘
                  └──────────────┘            └────────────────┘
```

## Why this stack

### Why Next.js + Vercel?

- **Single deployment unit.** Frontend and API routes ship together. No worker/static-site coordination problems.
- **Preview deploys per branch.** Every PR gets a unique URL that's safe to test. This is how we avoid the "deploy to prod and pray" pattern from v1.
- **Server components + Suspense** — render with live data without manual hydration plumbing.
- **Image optimization built in** — `next/image` handles thumbnails, sizing, lazy loading, modern formats. We don't run a custom image proxy.

### Why Supabase?

- **Real Postgres database.** Saves are `UPDATE one row`. The "stale state erases other items" bug class from v1 is structurally impossible.
- **Row-level security.** Public anon role can read public data; only service-role (server-side) can write.
- **Storage buckets.** Image hosting + CDN out of the box. Replaces the v1 GitHub-repo-as-image-store kludge.
- **Existing project.** v1 already uses Supabase for analytics/sales/gift certs; we extend it instead of adding another vendor.

### Why a database instead of a JSON file (the v1 mistake)?

In v1, the inventory was a single JSON file in a Git repo. Every save overwrote the whole file. That works for a single user, single tab, no concurrency. The moment ANY of those assumptions broke (multi-tab, GitHub read-after-write delay, webhook firing during a save), stale state could erase items. We patched it for months. The patches stacked into a brittle pile.

In v2, items are rows. `UPDATE items SET is_sold = true WHERE id = '000084'` doesn't touch any other row. The bug class is gone.

## Data flow examples

### Public site renders the homepage

1. Browser requests `/`
2. Vercel runs the server component for `app/page.tsx`
3. Server component queries `select * from items where is_sold = false order by display_order` via Supabase JS client (anon key)
4. Server returns HTML with items embedded
5. Browser renders. Client-side JS hydrates for interactivity (mosaic, filtering)

### Admin saves an item edit

1. Admin form sends `PATCH /api/admin/items/000084` with `{ price: 200 }`
2. API route:
   - Verifies the admin PIN cookie/session
   - Uses service-role Supabase client (bypasses RLS)
   - Runs `UPDATE items SET price = 200, updated_at = now() WHERE id = '000084'`
   - Returns the updated row
3. Admin UI updates from the response

**Critical:** the API route only updates the fields in the request body. It never reads the entire item, mutates it client-side, and writes it back. This is the rule that prevents v1's bug class.

### Square webhook arrives (purchase completed)

1. Square sends `POST /api/webhook/square` with the event
2. API route:
   - Reads raw body (not parsed JSON — needed for HMAC)
   - Verifies the signature against `SQUARE_WEBHOOK_SIGNATURE_KEY`
   - Parses the event
   - Resolves the item ID from the payment note
   - Runs `UPDATE items SET is_sold = true, is_new = false, is_hold = false WHERE id = ?`
   - Inserts a row into `sales`
   - For gift cert purchases: sends the email via Resend
3. Returns 200

## Tables (target schema)

```
items                   ← inventory (REPLACES v1's inventory.json)
  id, title, description, price, size, category, maker, condition,
  dealer_code, posted_by, is_new, is_hold, is_sold,
  hero_image, images[], display_order, created_at, updated_at

sales                   ← already exists from v1
  id, type, amount, customer_name, customer_email, item_id, item_title,
  gift_code, posted_by, square_payment_id, note, created_at

discount_codes          ← already exists from v1
  code, type, value, max_uses, current_uses, is_gift_certificate, ...

emails                  ← already exists from v1
  email, source, item_id, created_at

events                  ← already exists from v1
  event, session_id, item_id, ...
```

## Storage buckets

- `product-images` — full-resolution and thumbnail product photos. Public read, service-role write.

## What does NOT live here

- **Cloudflare Worker** — replaced by Next.js API routes. The old worker (`ol-checkout`) stays running for 30 days post-cutover as a fallback, then deleted.
- **GitHub Pages** — replaced by Vercel hosting.
- **`inventory.json`** — replaced by the `items` table. Will not exist in v2 (a built artifact for the public site is generated server-side per request).
- **Service worker complexity** — Vercel handles caching. We may keep a minimal SW for offline-tolerance on the admin if useful.
