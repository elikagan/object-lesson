# Object Lesson

E-commerce site for Eli Kagan & Megan Gage's vintage / art shop in Pasadena.
Live at [objectlesson.la](https://objectlesson.la).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind 4)
- **Supabase** (Postgres + Storage)
- **Vercel** (hosting + auto-deploy from `main`)
- **Square** (payments + webhooks)
- **Resend** (transactional email — gift certificates)
- **Gemini** (admin AI image processing)

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Required env vars in `.env.local` (ask Eli for values):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_PIN
ADMIN_SESSION_SECRET
GEMINI_API_KEY
SQUARE_ACCESS_TOKEN
SQUARE_LOCATION_ID
SQUARE_WEBHOOK_SIGNATURE_KEY
RESEND_API_KEY
```

## Deploy

`git push origin main` → Vercel auto-deploys to production.

After every successful production deploy, the **post-deploy smoke** workflow
hits the live site with read-only Playwright tests. If anything fails, an
issue is auto-opened. No human needs to remember to check.

## Where things live

| Path | What |
|---|---|
| `app/(public)/` | Public site — homepage, item detail, about, gift |
| `app/admin/` | Admin panel — lock screen, item list, item editor |
| `app/api/` | Server routes — checkout, gift checkout, Square webhook, admin endpoints |
| `components/` | Shared React components |
| `lib/` | Server + client helpers (Supabase clients, types) |
| `tests/` | Playwright tests — smoke, regressions, **production-smoke** |
| `scripts/` | Build & guard scripts (e.g. `check-no-stubs.mjs`) |
| `supabase/migrations/` | Schema history |

## Read these before changing code

| File | Purpose |
|---|---|
| `CLAUDE.md` | Binding rules for AI agents working on this repo. |
| `AUDIT.md` | v1 → v2 feature parity gaps. **The work queue.** |
| `README.md` | This file — project layout + how the safeguards work. |

`MIGRATION.md` is archived once parity is achieved.

## Mechanical safeguards

These are not optional. Each one breaks the build / blocks the merge if violated.

| Guard | Where | What it catches |
|---|---|---|
| **No-stub regex** | `scripts/check-no-stubs.mjs` — pre-commit hook + CI | `alert("...coming soon")`, `// TODO ... later`, etc. in shipped code |
| **Post-deploy production smoke** | `tests/production-smoke.spec.ts` + `.github/workflows/post-deploy.yml` | Anything broken on the live site within minutes of deploy. Auto-opens issue. |
| **PR checklist enforcer** | `.github/pull_request_template.md` + `.github/workflows/pr-checklist.yml` `checklist` job | PRs that lack browser evidence — every box must be checked before merge. |
| **PR evidence regex** | `.github/workflows/pr-checklist.yml` `evidence` job | PRs whose body has no embedded screenshot, video link, or attached image. A bare preview URL is not evidence. |
| **AUDIT row sync** | `.github/workflows/pr-checklist.yml` `audit-row-sync` job | A PR that references audit row `P0-N` (or P1-N / P2-N) in its title or body but doesn't flip that row's `[ ]` to `[x]` in `AUDIT.md`. Stops silent claims of completion. |

Plus the existing layer:

- ESLint + `tsc --noEmit` — pre-commit
- Full Playwright suite — pre-push
- Branch protection on `main` — PR-only, CI required, linear history

## The work loop

1. Read `CLAUDE.md`, `AUDIT.md`, this README.
2. Pick the **top unchecked `[ ]` row** in `AUDIT.md` section 4.
3. Branch off `main`. Open a PR. Title and/or body must reference the row ID (e.g. `P0-2`).
4. The same PR flips `- [ ] **P0-2 ...` to `- [x] **P0-2 ...` in `AUDIT.md`. The audit-row-sync workflow blocks merge if you don't.
5. PR body must include a screenshot or recording. The evidence workflow blocks merge if it doesn't.
6. Every checkbox in the PR template must be ticked. The checklist workflow blocks merge otherwise.
7. CI runs lint + typecheck + check-stubs + Playwright. After merge, Vercel deploys, post-deploy smoke runs against the live site.
8. Pick the next row.

**One row per PR. Never declare anything "done" without browser evidence.**

## Common commands

```bash
npm run dev               # local dev server
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run check-stubs       # forbidden-pattern guard
npm test                  # Playwright suite (excludes prod smoke)
npm run test:prod-smoke   # Playwright against live https://objectlesson.la
```

## CLI tools

- `gh` (GitHub CLI), `vercel`, `supabase` — all installed and authenticated.
- Non-interactive shells need `eval "$(/opt/homebrew/bin/brew shellenv zsh)"` first (per Eli's environment).

## Project history

The v1 stack (GitHub Pages + Cloudflare Worker + `inventory.json`) is being decommissioned. The architectural reason for the rebuild was the JSON-file inventory pattern — every save overwrote the entire file, so stale state in any one tab could erase items in another. v2 puts items in a Postgres table with single-row PATCH updates, killing that bug class entirely.

The migration was bumpy. `AUDIT.md` is the honest record of which v1 features still need to land in v2. We work it top to bottom, one PR per row.
