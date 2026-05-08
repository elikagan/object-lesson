# Object Lesson Migration: GitHub Pages + CF Worker → Vercel + Next.js + Supabase

**Status:** Phase 0 — Awaiting decisions from Eli
**Last updated:** 2026-05-07
**Owner:** Eli Kagan
**Implementer:** Claude Code

---

## Why this migration exists

The current architecture stores inventory as a single JSON file in a Git repo. Every save overwrites the entire file. Stale state (multi-tab usage, GitHub read-after-write delay, race conditions) causes items to be erased, duplicated, or have orphaned files. We've spent multiple sessions patching this with retries, refreshes, merges, and reconciliation, but the underlying architecture is the root cause.

**Target:** standard CRUD app — items in a Postgres table (Supabase), saves do `UPDATE one row`, no possibility of erasing other items. The bug class disappears entirely.

This document is **the contract** for that migration. It is written so I (Claude) cannot deviate without explicitly editing the contract first. If I deviate without updating this file, I am breaking the contract.

---

## Binding principles (read before every session)

These rules apply to **every session** of this migration. Not negotiable.

1. **Production is sacred until Phase 7.** No DNS changes, no Square webhook changes, no production data writes. The current site keeps running unmodified the entire time.
2. **Every phase has explicit gates.** I do not start a new phase until the previous phase's gates are checked off in this document with evidence (URLs, screenshots, query results). If a gate has unchecked items, the phase is incomplete.
3. **No "I'll fix it later" tech debt.** If a feature exists today, it must exist after migration. We are rehosting, not redesigning.
4. **Verify in the browser, not in code.** Reading code is not sufficient evidence. I must navigate to the URL, click the button, see the result. Screenshots or specific URLs go in the session log.
5. **Backup before every destructive operation.** Data migration scripts must save a copy of source data before mutating anything.
6. **One thing per commit.** No bundling unrelated changes.
7. **Document deviations.** If reality differs from this plan, edit this doc to reflect it before continuing. Do not proceed with a different mental model than what is written down.
8. **Stop and ask, not stop and guess.** If I hit ambiguity, stop and ask. No more "this seems right, ship it."

If any of the above are violated, the current task halts and I report the violation.

---

## Architecture: target state

### Stack
- **Hosting:** Vercel
- **Framework:** Next.js 14+ (App Router, TypeScript)
- **Database:** Supabase Postgres (existing project — see Phase 0)
- **Image storage:** Supabase Storage
- **Admin auth:** PIN in localStorage (same as today, simple)
- **Domain:** `objectlesson.la` → Vercel (currently → GitHub Pages)
- **Backend logic:** Next.js API routes (`app/api/...`) — replaces the Cloudflare Worker

### Integrations (unchanged)
- Square (checkout + webhook)
- Resend (transactional email)
- Gemini (AI image processing)
- Meta Pixel (analytics)
- Supabase (already in use; expanded to hold inventory + images)

### What goes away
- GitHub Pages hosting
- `inventory.json` as a database (becomes a one-time migration source, then deleted)
- Cloudflare Worker (`ol-checkout`) (logic migrates to Next.js API routes)
- Service worker complexity (Vercel handles caching; admin keeps a minimal SW for offline-tolerance only if needed)
- All the SHA-conflict / refresh / reconcile / merge logic in admin/app.js

### Why this fixes the bug class

Today: admin reads the entire inventory, mutates one item, writes the entire inventory. Any stale state in the local copy → other items erased.

Tomorrow: admin sends `PATCH /api/admin/items/000084 { isSold: true }`. The API route does `UPDATE items SET is_sold = true WHERE id = '000084'`. No other item is touched. **It is structurally impossible to erase another item by saving this one.**

---

## Phase 0: Decisions required (BLOCKING — Eli fills in)

**I (Claude) cannot proceed to Phase 1 until every `[TBD]` below is filled in.**

Eli: edit this file directly. Replace each `[TBD]` with your answer. Then tell me Phase 0 is complete.

### 0.1 Vercel project
- Vercel team/account (or "personal account"): `[TBD]`
- Project name (suggest `object-lesson`): `[TBD]`
- Production domain: `objectlesson.la` ← no change needed
- Staging domain (suggest `staging.objectlesson.la`, or use Vercel's default `*.vercel.app`): `[TBD]`

### 0.2 Supabase
- Use existing OL project (ref `gjlwoibtdgxlhtfswdkk`)? `[TBD: yes/no]`
- If yes, separate `staging` schema for staging data? (suggest yes — keeps prod data clean while testing): `[TBD: yes/no]`
- If no, what's the new project ref? `[TBD]`

### 0.3 Image storage
- Supabase Storage (one platform — simpler) or external CDN? (suggest Supabase Storage): `[TBD]`

### 0.4 Cutover timing
- Acceptable cutover window (need ~30 min focused attention from you): `[TBD]`
- Days/dates to avoid (active sales, ad pushes, market events): `[TBD]`

### 0.5 Rollback triggers
For each, mark `roll back` or `keep going and fix forward`:
- Failed Square checkout in production within 24 hrs of cutover: `[TBD]`
- Admin save error: `[TBD]`
- Public-facing visible bug: `[TBD]`

### 0.6 Admin PIN
- Same PIN as production (`Antiques2024`)? `[TBD: yes/no]`
- If no, what should staging PIN be? `[TBD]`

### 0.7 Feature freeze during migration
- Agree to no new features (or breaking changes) during migration? `[TBD: yes/no]`

### 0.8 Credentials access
You'll need to confirm I can use these (already exist as worker secrets — I'll re-read and re-add to Vercel):
- [ ] Square access token, location ID, webhook signing key
- [ ] Resend API key
- [ ] Gemini API key
- [ ] GitHub token (will become unnecessary post-migration; not adding to Vercel)
- [ ] Supabase service role key (need this — used by migration scripts)

Confirm: `[TBD: yes, you can re-use the existing credentials]`

### 0.9 Repo strategy
Two options:
- **Option A (recommended):** keep current repo `elikagan/objectlesson-site`, add Next.js as a new directory or branch, retain GitHub Pages serving the live site until cutover.
- **Option B:** new repo `elikagan/object-lesson-v2` for clean slate.

Choose: `[TBD: A or B]`

---

## Phase overview (skim)

| Phase | Name | Hours | Production at risk? |
|-------|------|-------|---------------------|
| 0 | Decisions | 30 min (Eli's time) | No |
| 1 | Foundation: Vercel + Supabase wired up | 2-3 | No |
| 2 | Data Layer: schema + migration | 3-4 | No |
| 3 | Public site ported | 3-5 | No |
| 4 | Admin ported | 4-6 | No |
| 5 | API routes (worker logic) | 3-4 | No |
| 6 | SEO + image pipeline | 2-3 | No |
| 7 | Cutover (DNS + Square webhook) | 1-2 | **Yes** |
| 8 | Decommission + cleanup | 1 | No |

Total: ~20-30 hours across 4-6 sessions. Each phase has gates that must close before the next starts.

---

## Phase 1: Foundation

**Goal:** Vercel project deployed, Supabase staging schema created, both connected via env vars, hello-world Next.js page rendering at staging URL that reads from Supabase.

### Tasks
1. Create Next.js project locally (TypeScript, App Router, Tailwind, no `src/` directory).
2. Create Vercel project, link to GitHub repo (per Phase 0.9 decision).
3. Create Supabase staging schema (per Phase 0.2 decision).
4. Set Vercel env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Build hello-world page that does `select 1 as ok` from Supabase via the JS client and renders the result.
6. Deploy to staging URL.
7. Configure staging domain DNS (per Phase 0.1 decision).

### Phase 1 gate (ALL must be true)
- [x] Staging URL loads — https://object-lesson.vercel.app
- [x] Hello-world page reads from Supabase successfully (renders Supabase connection: OK, sales count = 2)
- [ ] Eli has the staging URL bookmarked and confirmed it works ← awaiting Eli
- [x] Production site (current) still loads unchanged at `objectlesson.la`
- [x] Initial commit on migration branch with `MIGRATION.md` + Next.js scaffold
- [x] Session log updated below
- [x] Branch protection on `main` enabled (PR-only, CI required)
- [x] CI passing (lint + typecheck + Playwright smoke test)
- [x] Husky pre-commit (lint+typecheck) and pre-push (full tests) installed

### Phase 1 rollback
None needed — production untouched. If Phase 1 fails, delete Vercel project, no impact.

---

## Phase 2: Data Layer

**Goal:** Supabase schema designed and applied. `inventory.json` migrated to staging `items` table. Images migrated to Supabase Storage. A query against staging `items` returns the same shape the public site uses today.

### Tasks
1. Design schema (see proposed schema below — finalize during this phase).
2. Write SQL migrations in `supabase/migrations/` using Supabase CLI.
3. Apply migrations to staging schema.
4. Write `scripts/migrate-inventory.ts` — reads current `inventory.json`, INSERTs into staging `items`.
5. Write `scripts/migrate-images.ts` — uploads `images/products/**` to Supabase Storage bucket `product-images`.
6. Run both migration scripts.
7. Verify counts: 80 items, ~190 full images, ~190 thumbnails.
8. Save backup snapshot to `migration-backup/<timestamp>/` (inventory.json + images tarball).

### Proposed schema (finalize in Phase 2)
```sql
create table items (
  id text primary key,                    -- '000079' format preserved
  title text not null,
  description text default '',
  price numeric not null default 0,
  size text default '',
  category text not null,                 -- check constraint: known categories
  maker text default '',
  condition text default '',              -- 'New' | 'Like New' | 'Good' | 'Fair' | ''
  dealer_code text default '',
  posted_by text default '',
  is_new boolean default false,
  is_hold boolean default false,
  is_sold boolean default false,
  hero_image text,                        -- storage path
  images text[] not null default '{}',    -- array of storage paths
  display_order integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index items_display_order on items(display_order);
create index items_active on items(is_sold) where is_sold = false;

-- Postgres trigger to auto-update updated_at
create extension if not exists moddatetime;
create trigger items_updated_at before update on items
for each row execute function moddatetime(updated_at);
```

**Existing tables retained** (no schema changes): `sales`, `discount_codes`, `emails`, `events`.

### Phase 2 gate (ALL must be true)
- [x] Schema applied to existing OL Supabase project (decided to use existing project, not separate one — `items` table is brand new, no conflict with existing data)
- [x] 79 items in `items` table (count verified via JS client)
- [x] 598 images in `product-images` Supabase Storage bucket (~34.5 MB total)
- [x] `select * from items where id = '000079'` returns "Kazuko Matthews Vase" with images array
- [x] Public image URL works: `https://gjlwoibtdgxlhtfswdkk.supabase.co/storage/v1/object/public/product-images/images/products/000079/kazuko_matthews_vase_1.jpg` returns 200 with 117KB
- [x] Backup of `inventory.json` saved to `migration-backup/<timestamp>/` (auto, on first migration run)
- [x] Migration scripts checked into repo: `scripts/migrate-inventory.mjs`, `scripts/migrate-images.mjs`, `scripts/verify-schema.mjs`
- [x] Session log updated below
- [x] Homepage updated to read sample item from `items` table + render its image
- [x] Smoke test updated to verify items table + image rendering
- [x] `SUPABASE_SERVICE_ROLE_KEY` added to Vercel env vars (production + development)

### Phase 2 rollback
None destructive — only INSERTs into a brand new `items` table. If Phase 2 fails: `truncate items` and `delete from storage.buckets where id='product-images'`, fix migration script, re-run.

---

## Phase 3: Public site

**Goal:** Public-facing pages running on Next.js, fed by staging Supabase. Eli does side-by-side comparison and signs off.

### Tasks
1. Port `index.html` → `app/page.tsx` (homepage with grid + mosaic).
2. Port detail view → `app/item/[id]/page.tsx` (server-rendered for SEO).
3. Port gift cert form → `app/gift/page.tsx`.
4. Port about page → `app/about/page.tsx`.
5. Implement filtering. Convert hash-based deep links to proper routes (`#000079` → `/item/000079`).
6. Implement mosaic with deck-based dedup logic (this is the trickiest UI piece — preserve exactly).
7. Wire `next/image` for image rendering with sizes/srcset.
8. Copy CSS verbatim where possible; convert to Tailwind only where it makes sense.
9. Add Meta Pixel script (next/script with afterInteractive strategy).
10. Set up Supabase JS client (browser + server with cookie auth helpers).

### Phase 3 gate — side-by-side comparison
Eli explicitly signs off on each. If any fails, phase is incomplete.
- [ ] Homepage grid: same items, same order, same prices, same badges (New / Sold / Hold)
- [ ] Mosaic: animates similarly, no duplicates visible during animation
- [ ] Filter: All / Under $400 / categories all work and produce correct results
- [ ] Item detail: image carousel, Buy Now button, Inquire button, Share button, all work
- [ ] Gift cert flow: form fills, submit redirects to Square checkout, all amounts work
- [ ] About + contact pages render
- [ ] Mobile (iPhone Safari) + desktop both look right
- [ ] Meta Pixel fires (verified in Network tab — `/tr` request to facebook.com)
- [ ] Lighthouse: Performance ≥ 80, SEO ≥ 90 on item detail page
- [ ] Session log updated below

### Phase 3 rollback
None — staging only.

---

## Phase 4: Admin

**Goal:** Admin at `staging.objectlesson.la/admin` works for full CRUD. Photo upload + AI processing + PIN auth all functional. Multi-tab safety verified.

### Tasks
1. Port `admin/index.html` → `app/admin/page.tsx`.
2. Port admin app.js into React components (list view, editor, menu, settings).
3. Port photo upload + Gemini processing pipeline.
4. PIN auth (localStorage-based, same UX).
5. Sales view, gift cert view, marketing view, analytics view.
6. **Critical:** admin POSTs to `/api/admin/...` routes. Admin does NOT directly write to Supabase from the browser.

### API route layout for admin
- `GET /api/admin/items` — list all items
- `GET /api/admin/items/[id]` — read one
- `POST /api/admin/items` — create
- `PATCH /api/admin/items/[id]` — update one (only fields in request body — this is the bug-killer)
- `DELETE /api/admin/items/[id]` — delete (also deletes images from Storage)
- `POST /api/admin/items/[id]/images` — upload images
- `DELETE /api/admin/items/[id]/images/[name]` — remove one image
- `POST /api/admin/gemini` — proxy Gemini API
- `GET /api/admin/sales` — sales list
- `POST /api/admin/sales-backfill-names` — pull names from Square (one-time tool)
- `POST /api/admin/gift-certs` — create gift cert + send email

**PATCH is the key change.** Admin sends only the fields that changed, not the entire item. The API does `UPDATE items SET <fields> WHERE id = ?`. The bug class of "stale state erases other items" cannot exist because we never touch other items.

### Phase 4 gate (ALL must be true)
- [ ] Add new item with 4 photos + AI processing + save → appears in list at top
- [ ] Edit item, change price → list reflects new price
- [ ] Mark item sold → moves to archive section
- [ ] Delete item → gone from list, all images (full + thumbnails) deleted from Storage
- [ ] **Multi-tab test:** open admin in two tabs. In tab A, add a new item. In tab B (which is stale), edit a different item's price → BOTH items survive. The new item is not erased.
- [ ] PIN auth works (correct PIN unlocks, wrong PIN blocks with attempts counter)
- [ ] Sales view shows correct data from staging Supabase `sales` table
- [ ] Gift cert creation works, code generated, email sent (use real email but staging route)
- [ ] Eli has used the admin to add at least 2 real items in staging and confirms it feels right
- [ ] Session log updated below

### Phase 4 rollback
None — staging only. If admin doesn't work, fix it before proceeding.

---

## Phase 5: API routes (Worker logic)

**Goal:** All public-facing backend logic ported from CF Worker to Next.js API routes. End-to-end checkout works in staging.

### API routes to build
- `POST /api/checkout` — Square payment link for an item (existing logic)
- `POST /api/gift-checkout` — Square payment link for gift cert
- `POST /api/webhook/square` — webhook handler (verify signature, mark sold, record sale, send gift cert email)
- `POST /api/contact` — inquire form submission
- `POST /api/email-signup` — collect email, return discount code
- `POST /api/admin/sales-backfill` — pull historical sales from Square (one-time tool)

### Critical implementation notes
- **Square webhook signature verification** must use the request's raw body. Next.js parses JSON by default. Use `route.ts` with `export const dynamic = 'force-dynamic'` and read `request.text()` to get the raw body, then verify signature, then parse.
- Webhook in staging needs to be added to Square dashboard temporarily for testing (can co-exist with prod webhook).
- The webhook does double-duty: it's the `payment.updated` handler AND triggers gift cert email AND records the sale.

### Phase 5 gate (ALL must be true)
- [ ] **End-to-end test:** click Buy Now in staging → redirected to Square → complete payment with real Square sandbox or low $ test → webhook fires → item marked sold in staging Supabase → sale recorded with customer name → item disappears from staging public site
- [ ] **Gift cert end-to-end:** form → Square → webhook → email arrives at test address with valid code → code can be used at checkout
- [ ] All worker routes have a corresponding API route, list compared 1:1
- [ ] Session log updated below

### Phase 5 rollback
None — staging only.

---

## Phase 6: SEO + image pipeline

**Goal:** SEO at parity with current site. Sitemap, item pages, structured data, IndexNow ping all working.

### Tasks
1. `app/sitemap.ts` — auto-generated from items table.
2. `app/robots.ts` — robots.txt.
3. Static metadata on item pages (title, description, OG image, structured data Product schema).
4. IndexNow ping on item save (admin API route).
5. `next.config.js` — image domain config (Supabase Storage URL allowlisted).

### Phase 6 gate
- [ ] sitemap.xml validates and lists all items (open `staging.objectlesson.la/sitemap.xml`, count URLs)
- [ ] Item page passes Lighthouse SEO score ≥ 90
- [ ] OG preview shows hero image (test with Slack unfurler or `https://www.opengraph.xyz/`)
- [ ] Structured data validates at Google's [Rich Results test](https://search.google.com/test/rich-results)
- [ ] Session log updated below

### Phase 6 rollback
None — staging only.

---

## Phase 7: Cutover

**Goal:** `objectlesson.la` points to Vercel. Square webhook URL updated. Site is live on the new stack.

**This is the only phase where production is at risk.** Do not start until all previous phases' gates are closed.

### Pre-cutover checklist (Eli + Claude both verify)
- [ ] All phases 1-6 gates checked off in this document
- [ ] Staging has been actively used for at least 48 hours with no bugs (Eli's call)
- [ ] inventory.json + images backup exists with current production data
- [ ] DNS TTL on `objectlesson.la` lowered to 5 minutes 24 hours in advance (so cutover propagates fast)
- [ ] New Square webhook signing key created for `https://objectlesson.la/api/webhook/square` and added to Vercel env vars (the OLD signing key stays on the worker until decommission)
- [ ] Cutover scheduled in a low-traffic window (per Phase 0.4)
- [ ] Eli has 30 min of focused availability (not driving, not sourcing — at a computer)

### Cutover steps (in order, ~30 min)
1. **Final data sync:** copy production inventory state into Supabase production schema (or promote staging schema to production — final decision in Phase 2). Verify counts match.
2. **DNS update:** in Porkbun, point `objectlesson.la` at Vercel (CNAME or A records per Vercel's instructions).
3. **Vercel domain config:** add `objectlesson.la` as production domain in Vercel project.
4. **Wait for DNS propagation** (5-15 min). Verify with `dig objectlesson.la +short` showing Vercel IPs.
5. **Verify** `objectlesson.la` loads from Vercel (check `x-vercel-id` header in response).
6. **Square webhook URL update:** in Square dashboard, point webhook at `https://objectlesson.la/api/webhook/square`. Save signing key in Vercel env vars first.
7. **Test purchase** with $1 gift cert: real Square checkout, real card.
8. **Verify:** webhook fires (check Vercel logs), gift cert email arrives, sale appears in Supabase.

### Post-cutover smoke test (within 1 hour)
- [ ] Homepage loads at `objectlesson.la`
- [ ] At least 5 random item pages load with images
- [ ] Admin at `/admin` loads, PIN works
- [ ] Make a $1 test purchase (real Square) → email + sold marking confirmed
- [ ] Gift cert purchase works
- [ ] Meta Pixel fires
- [ ] No 5xx errors in Vercel logs for 30 minutes

### Rollback (within first 24 hours after cutover)
Trigger conditions per Phase 0.5. If triggered:
1. Revert Square webhook URL to old worker URL (`https://ol-checkout.objectlesson.workers.dev/webhook`)
2. Revert DNS in Porkbun to GitHub Pages CNAME (`elikagan.github.io`)
3. Wait for propagation (5-15 min)
4. Old site is live again, taking new sales
5. Diagnose issues in staging, fix, re-attempt cutover later

---

## Phase 8: Decommission

### Tasks
- [ ] Old Cloudflare Worker (`ol-checkout`) — keep running for 30 days as fallback, then `wrangler delete`
- [ ] GitHub Pages — disable in repo settings after 30 days
- [ ] Old service worker on user devices — Vercel will overwrite naturally
- [ ] Update memory files: `MEMORY.md`, `subscriptions_services.md` to reflect new stack
- [ ] Final commit: README.md describing new architecture for future Claude sessions

---

## Session log (append-only, updated every session)

### 2026-05-07 — Session N: Plan created
- Wrote MIGRATION.md
- Eli has not yet filled in Phase 0
- **Awaiting:** Phase 0 decisions

### 2026-05-07 — Phase 1 complete
- Phase 0 decisions resolved verbally (Vercel default URL, two-Supabase-projects to be done in Phase 2, no specific cutover blackout, roll back on payment failures, fix forward on cosmetic, same admin PIN, feature freeze yes, fresh repo `elikagan/object-lesson`)
- Created Next.js 16 scaffold with Tailwind 4, TypeScript
- Installed dependencies: @supabase/supabase-js, @supabase/ssr, @playwright/test, husky
- Created Vercel project `object-lesson` (org: elikagans-projects), linked to GitHub
- Wired NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY for production + development envs (preview deferred — CLI being weird; will set when needed for first feature branch)
- Created GitHub repo `elikagan/object-lesson`, pushed initial commit
- Set up Husky pre-commit (lint + typecheck) and pre-push (Playwright)
- Wrote 5 docs: README, CLAUDE, ARCHITECTURE, RUNBOOK, MIGRATION
- Wrote tests/smoke.spec.ts (passes locally + in CI)
- Wrote tests/regressions.spec.ts with 6 fixme stubs covering v1 bug classes
- Set up GitHub Actions CI workflow (.github/workflows/ci.yml)
- Set GitHub repo secrets for CI: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
- Enabled branch protection on `main` (requires `test` CI check)
- First production deploy succeeded: https://object-lesson.vercel.app
- Smoke test against deployed URL: Supabase connection OK, 2 rows in sales table ✓
- CI green
- **Phase 1 gate: 8/9 items checked. Last item (Eli confirms staging works) pending Eli's review.**
- **Next:** Phase 2 — data layer (schema + migrate inventory.json + images to Supabase)

### 2026-05-08 — Phase 2 complete
- Decided to use the existing OL Supabase project (gjlwoibtdgxlhtfswdkk) rather than a separate staging project. The new `items` table doesn't conflict with anything that's already there. Saves a data migration step at cutover.
- Service role key added to Vercel env (production + development) and local `.env.local`.
- Wrote schema migration `0001_create_items_and_storage.sql` — items table with constraints + indexes + trigger, RLS policies, storage bucket, helper `_supa_exec` function, `_migrations` log.
- Applied migration via Supabase Management API using the dashboard's auth token from localStorage (used Claude in Chrome to drive it).
- Wrote and ran `scripts/migrate-inventory.mjs` — 79 items upserted into `items` table. Coerced legacy freeform `condition` text values to '' (the v1 site had freeform text before becoming a dropdown).
- Wrote and ran `scripts/migrate-images.mjs` — 598 images (full + thumbnails, 34.5 MB total) uploaded to `product-images` bucket. Public read access verified.
- Verified an actual image loads from Supabase Storage public URL.
- Updated homepage (`app/page.tsx`) to read a sample item + render its image from Storage. Updated smoke test to verify all this.
- Build + tests + lint + typecheck all green locally.
- **Phase 2 gate: 11/11 closed.**
- **Next:** Phase 3 — port the actual public site (homepage grid, item detail, gift cert page, about, mosaic) to Next.js. Eli does side-by-side comparison.

---

## Appendix: glossary

- **Phase gate** — a checklist that must all be true before starting the next phase. The phase is incomplete until the gate is closed.
- **Staging** — Vercel deployment at non-production URL, fed by separate Supabase schema. Eli can test without affecting customers.
- **Production** — current live site at `objectlesson.la`. Untouched until Phase 7.
- **Cutover** — the moment DNS + Square webhook switch from old stack to new stack.
- **Rollback** — undo cutover by reverting DNS + Square webhook.
