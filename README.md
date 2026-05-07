# Object Lesson

E-commerce site for Eli Kagan & Megan Gage's vintage/art shop in Pasadena. Live at [objectlesson.la](https://objectlesson.la).

This is the **v2** stack — Next.js + Vercel + Supabase. The previous stack (GitHub Pages + Cloudflare Worker + JSON-file inventory) lived at [`elikagan/objectlesson-site`](https://github.com/elikagan/objectlesson-site) and is being migrated here.

## Quickstart

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

## Project docs

If you're a human or AI agent picking this up:

- **[CLAUDE.md](./CLAUDE.md)** — rules for AI agents working on this codebase. Read first.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — what the stack is and why.
- **[RUNBOOK.md](./RUNBOOK.md)** — deploy, rollback, common operations.
- **[MIGRATION.md](./MIGRATION.md)** — active during the v1 → v2 migration. Archived after Phase 8.

## Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Hosting:** Vercel
- **Database:** Supabase Postgres
- **Image storage:** Supabase Storage
- **Styling:** Tailwind 4
- **Testing:** Playwright (browser flows) + Vitest (unit, when needed)
- **Payments:** Square
- **Email:** Resend
- **AI:** Google Gemini (image processing)

## Status

Phase 1 of migration in progress. Production traffic still on the v1 stack.
