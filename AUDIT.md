# V1 → V2 Feature Audit

**Source of truth: code, not docs.** I read every v1 source file end-to-end:
`index.html` (251), `app.js` (938), `admin/index.html` (314), `admin/app.js` (2377),
`worker/square-checkout.js` (1027), `gift/index.html` (387), `privacy/index.html` (96).

**Status legend**: ✅ matches v1 · ⚠️ partial / unverified · ❌ missing or broken

**Severity**: P0 = blocks revenue, P1 = data loss / known-bad UX, P2 = nice-to-have

---

## 1 · Public site (storefront)

### 1.1 Header & shell

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Header: house icon (Visit/About) | `index.html:55-57` | ✅ | — | `SiteHeader.tsx:11` |
| Header: gift box icon → `/gift` | `index.html:57` | ✅ | — | `SiteHeader.tsx:17` |
| Centered logo (3-col flex) | `index.html:59-66` | ✅ | — | |
| Instagram pill (right) | `index.html:62-66` | ✅ | — | |
| Site banner ("adding more of our collection") | `index.html:69` | ⚠️ | P2 | `SiteBanner.tsx` exists — verify it renders + dismissal persists in localStorage |
| Footer: copy + IG + Contact (sms) | `index.html:99-107` | ✅ | — | `SiteFooter.tsx` |
| Meta Pixel (id 938556951941278) | `index.html:22-37` | ✅ | — | `app/(public)/layout.tsx:14` — verify fbevents.js loads + PageView fires |
| CSP header | `index.html:21` | ❌ | P2 | Not in v2 layout (Next.js sets some by default) |

### 1.2 Grid view

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Animated mosaic hero (18 tiles, 3D flip) | `app.js:646-765` | ✅ | — | `Mosaic.tsx` (188 lines) — verify flip cadence + responsive |
| Mosaic pause when tab hidden / detail open | `app.js:763-765` | ⚠️ | P2 | Verify |
| Inlined `__PRELOAD` for first 8 items | `index.html:48` | ❓ | P1 | Next.js SSR may make this irrelevant — verify TTI is similar |
| Filter dropdown (9 categories incl Under $400) | `index.html:73-90` | ⚠️ | P0 | Need to verify all 9 options + click-outside close |
| `under-400` price filter | `app.js:142-143` | ⚠️ | P0 | Verify filtering logic |
| Sold items pushed to end of "All" | `app.js:138-141` | ⚠️ | P1 | Verify ordering |
| Card animation (fadeUp, 0.04s stagger) | `app.js:161` | ⚠️ | P2 | Verify |
| Card image + title + price + badges | `app.js:175-179` | ✅ | — | `Grid.tsx` |
| `New` auto-expires after 7 days | `app.js:64-70` | ✅ | — | `lib/items.ts isItemNew()` |
| Loading dot animation | `index.html:95` | ⚠️ | P2 | SSR makes this less needed |

### 1.3 Detail view

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Sticky header with back + small logo | `index.html:112-120` | ✅ | — | `SiteHeader.tsx:46` |
| Bouncing scroll hint, dismisses on scroll 50+ | `index.html:122-124`, `app.js:212-221` | ⚠️ | P2 | Verify |
| Touch-drag carousel (finger-following) | `app.js:559-615` | ⚠️ | P0 | `ItemDetail.tsx` — verify direction lock, edge resistance, 20% threshold |
| Thumbnail strip below carousel | `index.html:130`, `app.js:425-438` | ⚠️ | P1 | Verify |
| Title, price, size, description | `index.html:137-145` | ✅ | — | |
| Maker / condition meta (conditional) | `app.js:241-251` | ⚠️ | P1 | Verify |
| Item ID (A000XXX format) | `index.html:176`, `app.js:634-637` | ⚠️ | P2 | Verify |
| Badges: New / Sold / On Hold | `index.html:134-136` | ✅ | — | |
| **Discount code input** ("Discount or gift certificate code") | `index.html:147-149`, `app.js:828-928` | ⚠️ | P0 | `ItemDetail.tsx` — verify validation against Supabase |
| Strikethrough + green discounted price | `app.js:847-859` | ⚠️ | P0 | Verify |
| Discount badge with code label | `app.js:894-898` | ⚠️ | P1 | Verify |
| Discount remove (x) button | `index.html:153`, `app.js:917-928` | ⚠️ | P1 | Verify |
| **Buy Now → Square checkout** | `app.js:326-355` | ⚠️ | P0 | Untested end-to-end (per Eli HOLD on $1 test) |
| **Inquire** — SMS on mobile, mailto on desktop | `app.js:475-485` | ⚠️ | P0 | Verify URL format `sms:3104985138&body=...` |
| Share button (Web Share API + clipboard fallback) | `app.js:404-418` | ⚠️ | P1 | Verify "copied" 1.5s state |
| **Email gate** before first checkout | `index.html:163-169`, `app.js:317-396` | ⚠️ | P0 | Verify flow + insert with `source='abandoned_cart'` |
| Shipping note ("Free pickup in Pasadena…") | `index.html:170` | ⚠️ | P1 | Verify text matches |
| Post-purchase thank-you card with SMS link | `index.html:171-175`, `app.js:286-292` | ⚠️ | P1 | Verify `?purchased=1#{id}` flow |

### 1.4 About / Not Found

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| About page (tagline, founders, address, links) | `index.html:208-233` | ✅ | — | `app/(public)/about/page.tsx` |
| Not Found ("This item is no longer available") | `index.html:191-206` | ✅ | — | `app/(public)/not-found.tsx` |

### 1.5 Email capture bar

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Bottom-fixed bar, slide-up animation | `index.html:236-247`, `app.js:769-826` | ✅ | — | `EmailBar.tsx` |
| Hide if `ol_email_dismissed` or `?purchased` | `app.js:786-789` | ✅ | — | |
| Submit → insert `emails` (source: 'newsletter', code: 'WELCOME10') | `app.js:806-816` | ✅ | — | Verify the insert hits Supabase from the live site |
| `email_signup` analytics event | `app.js:818` | ❌ | P1 | No `trackEvent` in v2 |
| Success state shows code 'WELCOME10', auto-hide 6s | `app.js:818-824` | ⚠️ | P2 | Verify |

### 1.6 Analytics — **broadest gap** (closed in PR #16)

v1 had `trackEvent()` calls scattered across the public site. v2 had zero analytics writes after Phase 7 cutover. PR #16 ported the trackEvent helper to `lib/analytics.ts`, added `POST /api/events`, and wired calls into the public layout, ItemDetail, Grid, EmailBar, and GiftClient. Events flow again.

| Event | v1 ref | v2 status | Severity |
|---|---|---|---|
| `page_view` | `app.js:128` (storefront), `gift/index.html:301` (gift page) | ✅ `AnalyticsTracker.tsx` (on pathname change) | P1 |
| `item_view` | `app.js:209` | ✅ `ItemDetail.tsx` (on mount) | P1 |
| `inquire` | `app.js:302, 309` | ✅ `ItemDetail.tsx` (on click) | P1 |
| `buy_now` | `app.js:329` | ✅ `ItemDetail.tsx` (on checkout submit) | P1 |
| `filter` | `app.js:503` | ✅ `Grid.tsx` (on filter change) | P2 |
| `email_signup` | `app.js:818` | ✅ `EmailBar.tsx` (on submit) | P1 |
| `discount_applied` | `app.js:906` | ✅ `ItemDetail.tsx` (on apply success) | P2 |
| `session_end` (with duration) | `app.js:78` | ✅ `AnalyticsTracker.tsx` (visibilitychange + pagehide) | P2 |
| `gift_purchase` (gift page) | `gift/index.html:355` | ✅ `GiftClient.tsx` (confirmation mount) | P1 |
| Bot/crawler exclusion (UA regex) | `app.js:40` | ✅ client + server defense-in-depth | P1 |
| Session ID per visitor | `app.js:18-25` | ✅ sessionStorage `ol_sid` | P1 |
| UTM source capture | `app.js:27-32` | ✅ cached on first call | P1 |

### 1.7 Gift certificate purchase page (`/gift`)

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Form: amount, To, From | `gift/index.html:228-247` | ⚠️ | P0 | `GiftClient.tsx` — verify field names match worker contract |
| POST `/gift-checkout` → Square redirect | `gift/index.html:344-383` | ⚠️ | P0 | Verify against `app/api/gift-checkout/route.ts` |
| Confirmation view (`?purchased=1&code=…`) | `gift/index.html:303-341` | ⚠️ | P0 | Verify |
| Code box (tap-to-copy) | `gift/index.html:313-318` | ⚠️ | P1 | |
| Email / Text / Native Share buttons | `gift/index.html:323-338` | ⚠️ | P1 | |
| `page_view` + `gift_purchase` events | `gift/index.html:301, 355` | ❌ | P1 | No analytics |

### 1.8 Privacy page

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| `/privacy` page with policy text | `privacy/index.html` | ❌ | P1 | **Not ported.** Linked-to from privacy laws/Meta Pixel disclosure expectations. |

### 1.9 SEO

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Static `item/{id}/index.html` per item | Generated by `admin/app.js:1214-1293` | ✅ (different mechanism) | — | v2 uses `app/(public)/item/[id]/page.tsx` SSR. Net result: same, possibly better. |
| `sitemap.xml` | `admin/app.js:1295-1316` | ✅ | — | `app/sitemap.ts` |
| `robots.txt` | (implicit) | ✅ | — | `app/robots.ts` |
| Product JSON-LD | `admin/app.js:1222-1230` | ✅ | — | `app/(public)/item/[id]/page.tsx` |
| OG / Twitter tags per item | `admin/app.js:1241-1252` | ✅ | — | |
| IndexNow ping on save | `admin/app.js:1382-1390` | ✅ | — | `lib/indexnow.ts` |
| Google sitemap ping on save | `admin/app.js:1393` | ❌ | P2 | Worth re-adding |
| Auto-regenerate `__PRELOAD` in index.html on save | `admin/app.js:1320-1360` | n/a | — | SSR makes this irrelevant |

---

## 2 · Admin

### 2.1 Auth + shell

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| PIN lock (SHA-256 hash) | `admin/app.js:118-122` | ✅ | — | `lib/admin/auth.ts` (HMAC cookie) |
| Rate limit (5 attempts → 5min lockout) | `admin/app.js:125-157` | ⚠️ | P1 | Verify v2 has equivalent |
| Browser autofill (hidden username) | `admin/index.html:22` | ⚠️ | P2 | Verify |
| Service worker (offline cache) | `admin/sw.js`, registered in `app.js:163` | ❌ | P2 | Not ported. PWA install no longer works offline. |
| PWA manifest (Add to Home Screen) | `admin/index.html:11`, `manifest.json` | ❌ | P2 | Not ported |
| Topbar: logo + version label + menu | `admin/index.html:48-80` | ✅ | — | `AdminListView.tsx:154` |

### 2.2 Hamburger menu

| Menu item | v1 wires up | v2 status | Severity |
|---|---|---|---|
| Analytics → analytics view | `admin/app.js:221-226` | ❌ | P0 — links to dead v1 URL |
| Sales → sales view | `admin/app.js:228-233` | ❌ | P0 — links to dead v1 URL |
| Gift Certificates → gc view | `admin/app.js:235-240` | ❌ | P0 — links to dead v1 URL |
| Marketing → marketing view | `admin/app.js:242-247` | ❌ | P0 — links to dead v1 URL |
| Settings → setup view | `admin/app.js:213-219` | ❌ | P1 — links to dead v1 URL |
| Logout | (n/a in v1) | ✅ | — | New in v2 |

**Root cause:** the four broken items point to `https://objectlesson.la/admin/#analytics` etc. with a comment in code admitting these are placeholders. After cutover, that URL is now v2 itself, so the hash routes nowhere.

### 2.3 Item list

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Render with thumb / id / price / badge / category | `admin/app.js:425-453` | ✅ | — | `AdminListView.tsx` |
| Posted-by badge (purple) | `admin/app.js:448` | ⚠️ | P1 | Verify |
| Drag-to-reorder (Sortable.js) | `admin/app.js:476-484` | ⚠️ | P0 | Verify v2 has this — drag handle + Sortable + persist |
| Swipe-to-reveal delete (touch, 70px) | `admin/app.js:524-573` | ⚠️ | P1 | Verify |
| Click row to open editor | `admin/app.js:489-495` | ✅ | — | |
| Archive section (collapsible, sold items) | `admin/app.js:455-473` | ⚠️ | P1 | Verify |
| FAB (+) to add new | `admin/index.html:82-84` | ✅ | — | |
| Reconcile sales on load (mark items sold from `sales` table) | `admin/app.js:378-404` | ⚠️ | P1 | Verify |

### 2.4 Item editor — fields & save

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Title / Description / Price / Size | `admin/index.html:118-130` | ✅ | — | `ItemEditor.tsx` |
| Category select (7 options) | `admin/index.html:131-141` | ✅ | — | |
| Maker / Brand | `admin/index.html:143-144` | ✅ | — | |
| Condition select (4 options) | `admin/index.html:146-153` | ✅ | — | |
| Dealer Code | `admin/index.html:155-156` | ✅ | — | |
| Posted By (with localStorage persist per device) | `admin/index.html:158-159`, `admin/app.js:1422-1423` | ⚠️ | P1 | Verify localStorage `ol_posted_by` |
| Toggles: New / Hold / Sold | `admin/index.html:161-178` | ✅ | — | |
| `isSold` clears `isNew` + `isHold` | `admin/app.js:1496-1497` | ✅ | — | |
| Double-tap save protection | `admin/app.js:1404-1410` | ✅ | — | |
| Save: refresh inventory before write (stale-state fix) | `admin/app.js:1440` | ✅ | — | v2 PATCH eliminates the bug class entirely |
| Hero is first photo | `admin/app.js:1500` | ⚠️ | P1 | Verify |
| `order` push for new items (top of list) | `admin/app.js:1519` | ✅ | — | |
| `createdAt` timestamp | `admin/app.js:1502` | ✅ | — | |

### 2.5 Item editor — photos

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Add Photos (multi-select) | `admin/index.html:104-108` | ✅ | — | (just fixed in PR #10) |
| Photo grid (3 col) | `admin/style.css` | ✅ | — | |
| Drag-to-reorder photos (Sortable, 150ms touch delay) | `admin/app.js:842-857` | ❌ | P1 | **Not built in v2** |
| Hero indicator (white dot on first) | `admin/app.js:779` | ⚠️ | P1 | Verify |
| Per-photo remove (x) | `admin/app.js:794-803` | ✅ | — | |
| **Per-photo AI exempt toggle** (star icon) | `admin/app.js:781-782, 827-834` | ❌ | P1 | **Not built in v2** — `aiProcess` field exists in type but no UI |
| **Per-photo reprocess menu** (lighting / background / shadow) | `admin/app.js:783-790, 805-825, 962-1022` | ❌ | P1 | **Not built in v2** |
| Spinner overlay on processing photo | `admin/app.js:977-984` | ❌ | P2 | |

### 2.6 Process with AI button

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Tag detection → OCR → fill price/dealer/title | `admin/app.js:872-886` | ✅ | — | (PR #11 — needs end-to-end verification) |
| Tape detection → fill size, exempt that photo | `admin/app.js:888-901` | ✅ | — | |
| Background removal on remaining (3 retries) | `admin/app.js:903-924` | ✅ | — | |
| Title/desc/category/maker/condition suggestion | `admin/app.js:926-944` | ✅ | — | |
| Reprocess single image (lighting/background/shadow) | `admin/app.js:962-1022` | ❌ | P1 | Not built |

### 2.7 Save flow → SEO + IndexNow

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Resize images: 1200px full @ q82 + 400px thumb @ q75 | `admin/app.js:1467-1478` | ✅ | — | `app/api/admin/items/[id]/images/route.ts` |
| SEO-friendly slug from title | `admin/app.js:1447` | ✅ | — | |
| Generate per-item static page on save | `admin/app.js:1362-1400` | ✅ (SSR) | — | Different mechanism, same outcome |
| Update sitemap.xml on save | `admin/app.js:1372-1376` | ✅ (dynamic) | — | `app/sitemap.ts` |
| Notify IndexNow | `admin/app.js:1382-1390` | ✅ | — | `lib/indexnow.ts` |
| Ping Google sitemap | `admin/app.js:1393` | ❌ | P2 | |

### 2.8 Delete item

| Feature | v1 ref | v2 status | Severity | Notes |
|---|---|---|---|---|
| Trash icon in editor topbar | `admin/index.html:94-96` | ✅ | — | |
| Custom confirm dialog | `admin/app.js:2249-2268` | ⚠️ | P2 | Verify (may use `window.confirm` in v2) |
| Delete from inventory + all images + thumbnails | `admin/app.js:716-740`, `admin/app.js:498-521` | ✅ | — | |

### 2.9 Analytics dashboard (admin)

**Status: ✅ Built in v2 (PR #17)** at `/admin/analytics`. Aggregation moved server-side; the browser never pulls raw events.

| Feature | v1 ref | Severity | v2 |
|---|---|---|---|
| Range toggle: 1d / 7d / 30d / 90d | `admin/index.html:193-198` | P0 | ✅ URL-driven (`?range=N`) |
| Pull-to-refresh on touch | `admin/app.js:270-281` | P2 | ⚠️ not ported (SSR re-renders on navigation already) |
| Range views card (with delta vs prev period) | `admin/app.js:1741-1747` | P0 | ✅ |
| Avg time on site card | `admin/app.js:1748-1752` | P0 | ✅ |
| Today views card (when range != 1d) | `admin/app.js:1754-1760` | P1 | ✅ |
| Revenue card | `admin/app.js:1763-1768` | P0 | ✅ |
| Sparkline (hourly for 1d, daily otherwise) | `admin/app.js:1652-1677, 1773-1781` | P1 | ✅ |
| Conversion funnel (visitors → views → inquiries) | `admin/app.js:1679-1683, 1783-1801` | P1 | ✅ |
| Inquiries count card | `admin/app.js:1803-1807` | P1 | ✅ |
| Most viewed top 10 (with thumbs) | `admin/app.js:1685-1693, 1809-1827` | P1 | ✅ |
| Popular categories bar chart | `admin/app.js:1696-1705, 1829-1842` | P2 | ✅ |
| Traffic sources bar chart | `admin/app.js:1707-1722, 1844-1855` | P2 | ✅ |
| Devices (mobile vs desktop) | `admin/app.js:1724-1727, 1857-1873` | P2 | ✅ |

### 2.10 Sales view (admin)

**Status: ✅ Built in v2 (PR #14).** Server-rendered at `/admin/sales`, wired into the hamburger menu.

| Feature | v1 ref | Severity | v2 |
|---|---|---|---|
| Summary stats: All Time / Month / Today revenue | `admin/app.js:2305-2320` | P0 | ✅ `AdminSalesView.tsx` |
| Total transactions, items vs gift cert split | `admin/app.js:2321-2323` | P0 | ✅ |
| Transaction list (type, title, customer, date, posted-by, code, discount) | `admin/app.js:2325-2369` | P0 | ✅ |

### 2.11 Marketing view (admin)

**Status: ✅ Built in v2 (PR #18)** at `/admin/marketing`. Same PR closes P0-1 (last dead hamburger link).

| Feature | v1 ref | Severity | v2 |
|---|---|---|---|
| Email subscribers table + count | `admin/app.js:1953-1997` | P1 | ✅ `AdminMarketingView.tsx` |
| CSV export | `admin/app.js:1981-1992` | P1 | ✅ |
| Discount code list (excl gift certs) with active toggle | `admin/app.js:1999-2055` | P1 | ✅ `PATCH /api/admin/discounts/[id]` |
| Create discount code form (code, type, value, max uses, "Random" generator) | `admin/app.js:2057-2106` | P1 | ✅ `POST /api/admin/discounts` |

### 2.12 Gift Certificates view (admin)

**Status: ✅ Built in v2 (PR #15)** at `/admin/giftcerts`. Auto-email pending P1-19.

| Feature | v1 ref | Severity | v2 |
|---|---|---|---|
| Create form (amount, purchaser, recipient, recipient email) | `admin/index.html:267-285`, `admin/app.js:2172-2247` | P1 | ✅ `AdminGiftCertsView.tsx` |
| Auto-generate `GIFT-XXXX-XXXX` (32-char no-ambiguous alphabet) | `admin/app.js:2182-2186` | P1 | ✅ server-side in `POST /api/admin/giftcerts` |
| Insert with `is_gift_certificate=true`, `type=fixed`, `max_uses=1` | `admin/app.js:2192-2199` | P1 | ✅ |
| Auto-email if recipient email provided (`/send-gift-email`) | `admin/app.js:2221-2231` | P1 | ⚠️ stored on row but not auto-sent — wires up when P1-19 ships |
| List view: code, status (Active/Redeemed/Voided), amount, names, email, date | `admin/app.js:2125-2143` | P1 | ✅ |
| Void button | `admin/app.js:2141, 2145-2165` | P1 | ✅ `PATCH /api/admin/giftcerts/[id]` (only on Active rows) |

### 2.13 Settings view (admin)

| Feature | v1 ref | v2 status | Severity |
|---|---|---|---|
| Settings screen (mostly stub since keys are server-side) | `admin/index.html:30-44` | ❌ | P2 |

---

## 3 · Backend / integrations

### 3.1 Worker endpoint parity

| Endpoint | v1 ref | v2 ref | Status | Severity |
|---|---|---|---|---|
| POST /checkout | `worker:9, 76-213` | `app/api/checkout/route.ts` | ✅ | — |
| POST /gift-checkout | `worker:13, 215-310` | `app/api/gift-checkout/route.ts` | ✅ | — |
| POST /webhook | `worker:17, 374-604` | `app/api/webhook/square/route.ts` | ✅ | — |
| POST /send-gift-email | `worker:25, 312-372` | ❌ | P1 | Used by admin GC create — needed when admin GC is built |
| POST /sales | `worker:29, 723-742` | `app/api/admin/sales/route.ts` | ⚠️ | Verify behavior matches |
| POST /sales-backfill | `worker:33, 744-849` | ❌ | P2 | Maintenance tool — only needed if we run it again |
| POST /sales-backfill-names | `worker:37, 851-920` | ❌ | P2 | Same |
| POST /removebg | `worker:21, 616-655` | ❌ | P2 | Legacy — Gemini does this now |
| POST /admin/github | `worker:47, 962-1004` | n/a | — | v2 doesn't use GitHub for inventory; Supabase replaces it |
| POST /admin/gemini | `worker:51, 1006-1027` | `app/api/admin/gemini/route.ts` | ✅ | — |
| GET /img/* | `worker:42, 922-960` | ❌ | P1 | v2 likely uses Supabase Storage public URLs directly. Verify cache headers / TTL — v1 had 1-year edge cache on Cloudflare. |

### 3.2 Webhook → mark-sold + email + sale record

| Sub-step | v1 ref | v2 status | Severity |
|---|---|---|---|
| HMAC signature validation | `worker:382-411` | ⚠️ | P0 | Verify v2 actually checks signature |
| Auto-mark item sold on payment | `worker:442-452, 657-719` | ⚠️ | P0 | v2: PATCH item.is_sold via Supabase. Verify with $1 test. |
| Capture buyer email to `emails` table (source: 'purchase') | `worker:454-479` | ⚠️ | P1 | Verify |
| Send gift cert confirmation email after Square payment | `worker:481-539` | ⚠️ | P1 | Verify in v2 webhook |
| Update purchaser_email on gift cert record | `worker:498-505` | ⚠️ | P1 | Verify |
| Record sale in `sales` table (with cardholder name, posted_by) | `worker:541-588` | ⚠️ | P0 | Verify |
| SHA conflict retry (mark-sold) | `worker:706-711` | n/a | — | v2 PATCH eliminates this concern |

### 3.3 Discount code application at /checkout

| Sub-step | v1 ref | v2 status |
|---|---|---|
| Validate code in Supabase (active + max_uses) | `worker:95-116` | ⚠️ — verify |
| Apply percent or fixed discount on Square order | `worker:135-153` | ⚠️ — verify |
| Increment `used_count` after success | `worker:188-205` | ⚠️ — verify |

### 3.4 Database tables

| Table | v1 columns | v2 status |
|---|---|---|
| `events` | event, item_id, session_id, referrer, utm_source, ua_mobile, path, created_at, duration | ⚠️ Exists, but no v2 code writes to it (1.6 broken) |
| `emails` | email, source, discount_code, item_id, created_at | ⚠️ EmailBar writes; verify Square webhook also writes |
| `discount_codes` | id, code, type, value, is_active, max_uses, used_count, is_gift_certificate, purchaser_name, recipient_name, purchaser_email, created_at | ⚠️ Verify reads/writes |
| `sales` | id, type, amount, customer_email, customer_name, item_id, item_title, gift_code, posted_by, square_payment_id, note, discount_code, created_at | ⚠️ Webhook writes; verify shape matches |

---

## 4 · Punch list (the work queue)

**Each row is a single PR.** Pick the top unchecked P0 row. When the PR
that resolves it is merged, mark the box `[x]` in the same PR.

A row is **resolved** when EITHER:
- The feature works in v2 with browser evidence (screenshot/recording in the merged PR), OR
- We've explicitly decided it's out of scope (note that decision under the row).

A row is **NOT resolved** by:
- Code that compiles. Tests passing. "Looks right." A previous AI claiming it was done.

Order of work: P0 → P1 → P2. Within a tier, top to bottom. Don't skip.

### P0 — blocks revenue or admin operations

- [x] **P0-1 · Hamburger menu sub-views are dead links.** All four (Analytics / Sales / Gift Certificates / Marketing) point at `https://objectlesson.la/admin/#analytics` etc. — after Phase 7 cutover that URL is v2 itself, so the fragment goes nowhere. See §2.2. Fix: either build the four sub-views (P0-2/3/4 plus Marketing P1-17), or replace the menu with the items we actually have. Decide first; don't ship dead links.
- [x] **P0-2 · Admin Sales view — not built.** §2.10. v1 had a transaction list with All-Time / Month / Today revenue cards and per-row customer/posted-by/code/discount. Data source already exists at `/api/admin/sales`. Just need the UI.
- [x] **P0-3 · Admin Analytics dashboard — not built.** §2.9. v1 had range toggle (1d/7d/30d/90d), sparkline, conversion funnel, top items, categories, traffic sources, devices, revenue. **Note:** dashboard is empty until P1-13 (analytics writes) is fixed.
- [x] **P0-4 · Admin Gift Certificates view — not built.** §2.12. Create + list + void. Without this you cannot view, create, or void gift certs without going back to v1. Depends on P1-19 (`/send-gift-email` endpoint) for the auto-email flow.
- [x] **P0-5 · End-to-end checkout untested.** Run the $1 test purchase: Buy Now → Square → return to site with `?purchased=1` → thank-you card shows. Verify item is marked sold, sale row written, buyer email captured. Hold per Eli pending mechanical safeguards in place — now in place.
- [x] **P0-6 · Webhook end-to-end untested.** §3.2. With the $1 test (P0-5) verify: signature validates, item flipped sold, buyer email landed in `emails`, sale row written with cardholder name + posted_by + payment id. Same test exercises gift-cert email path if the test purchase is a gift cert.
- [ ] **P0-7 · Discount code apply at checkout — untested.** §3.3. Enter `WELCOME10` (or any active code) on a detail page → strikethrough + green discounted price → Buy Now → Square shows discounted total → on success `used_count` increments by 1.
- [x] **P0-8 · Filter dropdown parity.** §1.2. Verify all 9 options (`all`, `under-400`, plus 7 categories), `under-400` filters to non-sold items where `0 < price < 400`, click-outside closes, sold-items-pushed-to-end on `all`.
- [x] **P0-9 · Touch carousel on detail page.** §1.3. Verify on a real phone: finger-following drag, vertical-vs-horizontal direction lock, 0.3x edge resistance at boundaries, 20% width threshold to advance, smooth snap-back. Single-image items hide thumb strip.
- [x] **P0-10 · Drag-to-reorder items in admin list.** §2.3. Verify: drag handle works, reorder persists across reload (writes to `items.display_order` or equivalent), archive (sold) section is excluded from reorder.
- [x] **P0-11 · Email gate before Buy Now.** §1.3. Verify: first-time buyer (no `ol_email_collected` in localStorage) clicks Buy Now → email gate appears → submit → row written to `emails` with `source='abandoned_cart'`, `item_id` set → checkout proceeds. Subsequent buys skip the gate.
- [x] **P0-12 · Square webhook signature validation — hardened.** §3.2. Verify: signature mismatch returns non-2xx (v1 logged a warning and continued — fix that here). Test with a deliberately bad signature.

### P1 — data loss / known-bad UX

- [x] **P1-13 · No analytics writes anywhere in v2.** §1.6. v1 wrote 8+ event types (`page_view`, `item_view`, `inquire`, `buy_now`, `filter`, `email_signup`, `discount_applied`, `session_end`, `gift_purchase`) to Supabase `events`. v2 writes none. Port the `trackEvent()` helper + bot-UA filter + session-id + UTM capture, then sprinkle the calls. The events table is currently going dark.
- [x] **P1-14 · Per-photo AI exempt toggle — not built.** §2.5. v1 had a star button on each unprocessed photo to skip background-removal (e.g. tape-measure photos). The `aiProcess` field is in the v2 type but no UI toggles it.
- [x] **P1-15 · Per-photo reprocess menu — not built.** §2.5. v1 had three options per processed photo: Better lighting / Better background / Better shadow. Each maps to a Gemini prompt in `lib/admin/gemini.ts` (port from v1 `admin/app.js:962-1022`).
- [x] **P1-16 · Drag-to-reorder photos in editor — not built.** §2.5. v1 used Sortable.js with 150ms touch delay. Reorder must update both the `images` array order and which photo is `hero_image` (first one).
- [x] **P1-17 · Admin Marketing view — not built.** §2.11. Email subscribers table + count + CSV export, plus discount codes list with create/toggle-active. Filters out gift certs (those live in P0-4).
- [x] **P1-18 · Privacy page (`/privacy`) — not ported.** §1.8. Static page; v1 source is `privacy/index.html` (96 lines). Required disclosure for Meta Pixel / GDPR.
- [x] **P1-19 · `/send-gift-email` endpoint — not ported.** §3.1. Needed by P0-4 (admin Gift Cert create with optional auto-send). Mirrors v1 worker `handleSendGiftEmail` — Resend API call with the gift-cert HTML template.
- [x] **P1-20 · PIN rate limiting.** §2.1. v1: 5 attempts → 5-minute lockout. Verify v2 enforces this (or build it).
- [x] **P1-21 · Reconcile sales on admin load.** §2.3. v1 admin called `/sales` on load and auto-marked any item sold whose Square sale row exists but `is_sold` is still false. Catches webhook misses. Verify or port.
- [x] **P1-22 · Inquire link format on mobile.** §1.3. Mobile: `sms:3104985138&body=...`; desktop: `mailto:eli@objectlesson.la?subject=Inquiry: {title}&body=...`. Verify both formats and the body text.
- [x] **P1-23 · Post-purchase thank-you with SMS link.** §1.3. Returning from `?purchased=1#{id}` shows thank-you card with pickup info and an SMS link prefilled with the purchased item's title.
- [x] **P1-24 · Image CDN with long TTL.** §3.1. v1 served images via `/img/*` with `Cache-Control: public, max-age=31536000, immutable` at the Cloudflare edge. Verify v2 (Supabase Storage) gets equivalent caching, or proxy.
- [x] **P1-25 · Site banner ("We're adding more of our collection every day").** §1.1. Dismissable, persists dismissal in localStorage. Verify it renders and dismiss sticks across reloads.
- [x] **P1-26 · Card sold-pushed-to-end ordering on `all`.** §1.2. v1: in `all` view, sold items show at end at 45% opacity. Other categories exclude sold entirely. Verify the sort order matches.
- [x] **P1-27 · `New` badge auto-expires after 7 days.** §1.2. Already in `lib/items.ts` per audit, but verify it works on a real fresh item and on a stale one.

### P2 — polish (don't touch until P0/P1 empty)

- [x] **P2-28 · PWA service worker + manifest** for admin (offline shell, Add to Home Screen).
- [x] **P2-29 · CSP header** on public pages (currently relying on Next.js defaults).
- [x] **P2-30 · Mosaic pause** when tab hidden or on detail view.
- [x] **P2-31 · Card fade-up animation** with 0.04s stagger.
- [x] **P2-32 · Detail-page scroll hint** (bouncing chevron, dismisses after 50px scroll).
- [x] **P2-33 · Custom confirm dialog** (replace any `window.confirm` calls in admin).
- [x] **P2-34 · Photo reprocess spinner overlay** (depends on P1-15).
- [x] **P2-35 · Hero white-dot indicator** on first photo in editor.
- [x] **P2-36 · Posted-by badge** purple styling in admin list.
- [x] **P2-37 · Browser autofill** on PIN screen (hidden username field).
- [x] **P2-38 · Google sitemap ping** on item save.
- [x] **P2-39 · v1 worker endpoints — decided not to port (parked with rationale).**
  - `/removebg` — v1 proxied to the remove.bg paid API. v2 does background removal locally via Gemini (`gemini-2.5-flash-image` in admin AI processing). Re-adding remove.bg would re-introduce a paid third-party dependency with no functional gain.
  - `/sales-backfill`, `/sales-backfill-names` — one-time maintenance tools that scraped Square's transaction history to retroactively fill v1's sales JSON. v2 starts the sales table fresh and the live `/api/webhook/square` handler writes new rows on every sale, so there's no backfill to run. Historical v1 sales remain in v1's record and aren't needed in v2.

  If a future need arises (e.g. importing the v1 sales archive for analytics), the v1 worker code at `Object Lesson App and Website/worker/square-checkout.js` (lines 616–920) is a clean reference.

---

## 5 · How to work a row

For every row, the workflow is:

1. **Read the section it links back to** (e.g. P0-2 references §2.10) for the v1 reference and the expected behavior.
2. **If status is "verify"** (not "not built"): drive the live v2 site in a browser. Network tab open. Either:
   - It works → mark `[x]` with a screenshot in the PR description that resolves the row.
   - It's broken → leave unchecked, open a PR that fixes it.
3. **If status is "not built"**: port from v1, exercise it in browser, screenshot, ship.
4. **One row per PR.** Use the PR template. Required evidence checkbox enforced by `pr-checklist` workflow.
5. **The PR that resolves a row is the same PR that flips its `[ ]` to `[x]` in this file.**
6. After merge, the post-deploy smoke runs against the live site. If it fails, fix forward immediately or roll back; the row stays unchecked until the production version actually works.

**Critical path first within P0:** revenue path (P0-5/6/7/11/12) before admin views (P0-1/2/3/4) before UX verification (P0-8/9/10).

---

## 6 · Open questions for Eli

- Is the Lazy Poster integration in scope for v2? v1 admin doesn't reference it (only worker secret). v2 has zero references.
- Is the v1 PWA (admin offline / install) something we still want? You haven't mentioned it.
- The privacy page — required by Meta Pixel TOS. Port?
- Sales backfill endpoints — port for safety, or wait until needed?
- Static `/item/{id}/index.html` files in v1 are now generated by SSR in v2. Do we plan to delete the v1 static files from the v1 repo, or leave for backwards compat?

---

**Next step:** read this file, mark anything I got wrong or missed, set priorities. I do not write any code until that's done.
