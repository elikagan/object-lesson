# CLAUDE.md — read at the start of every session

This file is the **contract** for AI agents working on this codebase. It is short on purpose. Read it. Follow it.

---

## Session start (do this every time)

1. Read this file (`CLAUDE.md`).
2. Read `AUDIT.md` — the v1 → v2 parity gap list. **The work queue.**
3. Read `README.md` — project layout + how the safeguards work.
4. Pick the **top unchecked P0 row** in `AUDIT.md`.
5. Open a PR for that single row. Use the PR template. Provide browser evidence (screenshot or recording) in the PR description.
6. Do NOT work on multiple rows in one PR. Do NOT mark anything done without a screenshot or recording.

If you can't find the row, can't reproduce, or hit ambiguity: **stop and ask Eli.** Do not guess.

---

## The rules (binding, no exceptions)

### Development discipline

1. **`main` is protected.** Open a PR; do not push directly. If a push gets rejected, that's the protection working.
2. **Tests must pass before merge.** Vercel preview + GitHub Actions both green. No bypassing CI.
3. **Every bug fix gets a regression test FIRST.** Write the test. Confirm it fails. Then fix. Confirm it passes.
4. **Every new feature gets a happy-path test.** Minimum: one Playwright test that exercises the user-facing flow.
5. **If you change the schema, write a migration.** SQL file in `supabase/migrations/`. Do not edit the database directly.
6. **Verify in a browser before claiming "done."** Code that compiles is not code that works. Open a preview URL, click the button, see the result.
7. **Don't guess.** If you do not understand the bug, stop and ask. The cost of asking is 30 seconds. The cost of guessing wrong is hours.
8. **Smaller PRs > bigger PRs.** One concern per PR. Mixing unrelated changes is how regressions hide.

### Architectural rules

1. **Admin saves use PATCH** (single-field updates), never PUT (whole record). The save flow must NEVER write fields the user did not change. This is the rule that prevents the "stale state erases other items" bug class from v1.
2. **Inventory lives in Supabase.** Never write items to a JSON file or Git repo. The `items` table is the only source of truth.
3. **All API keys live in Vercel env vars.** Never in client code. Server-only secrets (service role key, Square access token, Resend, Gemini) are read in API routes only.
4. **Images go through Supabase Storage.** Never commit binary images to the Git repo.
5. **Don't read from the public site's database from the admin or vice versa.** Use the right Supabase client (anon for public, service-role for admin API routes).

### Process

1. **Stop and ask, don't stop and guess.** Ambiguity → message. Not silent assumption.
2. **Don't disable a check to "save time."** If a test is failing, fix the bug, not the test. If a hook is in the way, the hook is right and you are wrong.
3. **Every commit message says what changed and why** in one line. No "fix stuff" or "update".

---

## When in doubt

- Roll back, don't fix forward, on production payment/checkout failures.
- Smaller PRs > bigger PRs.
- Read the existing test before writing a new one.
- If a process feels like overhead, that's the friction working — don't bypass it.

---

## Files that matter (in load-bearing order)

- `CLAUDE.md` (this file) — read at session start
- `AGENTS.md` — Next.js 16 specific notices
- `ARCHITECTURE.md` — why the stack is what it is
- `RUNBOOK.md` — common operations
- `tests/` — the executable spec (read this to understand expected behavior)
- `supabase/migrations/` — schema history
- `lib/types.ts` — data shapes (single source of truth)

If a doc is out of date, fix it before continuing your task. Do not work from a different mental model than what's written down.
