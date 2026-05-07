# Runbook

Common operations. For *why* the stack is what it is, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Setup (first time on a new machine)

```bash
git clone https://github.com/elikagan/object-lesson.git
cd object-lesson
npm install
cp .env.example .env.local
# Fill in .env.local (ask Eli or pull from Vercel: `vercel env pull .env.local`)
npm run dev
```

## Daily development

```bash
git checkout main
git pull
git checkout -b feature/my-change
# ... make changes ...
npm test          # Playwright + unit tests
npm run lint
git push -u origin feature/my-change
gh pr create
```

CI runs on the PR. When green and reviewed, merge via GitHub UI (or `gh pr merge --squash`).

## Deploy

Deploys are automatic.

- **Push to a branch** → Vercel preview deploy → unique URL on the PR
- **Merge to `main`** → Vercel production deploy → `objectlesson.la`

Manual deploy is rarely needed but possible:

```bash
vercel deploy            # preview
vercel deploy --prod     # production (don't do this; let merges to main do it)
```

## Rollback

If a production deploy breaks something:

```bash
vercel rollback          # promotes the previous successful deployment back to production
```

The Vercel dashboard can also do this. Faster than waiting for a fix-forward PR. **Default action for any payment/checkout failure is rollback.**

## Database operations

### Create a new migration

```bash
supabase migration new add_something
# Edit the SQL file in supabase/migrations/
supabase db push --linked
```

### Connect to staging or prod DB

```bash
supabase login                   # one-time per machine
supabase link --project-ref <id> # switch projects
supabase db dump --linked        # local backup
```

### Restore from backup

Supabase keeps automatic daily backups on the paid tier. Point-in-time recovery for the past 7 days. To restore:

1. Supabase dashboard → Project → Database → Backups
2. Pick a timestamp
3. Click "Restore"

Always work from a backup before destructive operations.

## Square webhook URL

- **Production:** `https://objectlesson.la/api/webhook/square`
- **Staging:** uses a separate Square sandbox webhook (or omit if not testing payments in staging)

Update via the Square Developer dashboard. Signing key changes go in Vercel env vars (`SQUARE_WEBHOOK_SIGNATURE_KEY`).

## Common debugging

### A page on production looks broken

1. Reproduce on the latest preview deploy. If broken there too: PR to fix.
2. If only broken on production: rollback first (`vercel rollback`), then diagnose.

### Webhook isn't firing

1. Vercel logs (`vercel logs` or dashboard) for `/api/webhook/square`
2. Square dashboard → Webhooks → check delivery attempts + responses
3. Most common cause: signature key mismatch. Re-pull from Square dashboard, update Vercel env, redeploy.

### Admin save throws an error

1. Browser dev tools → Network tab → look at the PATCH/POST response
2. Vercel logs for the relevant `/api/admin/...` route
3. If the error mentions Supabase: check RLS policies and that the API route is using the service-role client, not the anon client

## Image storage

```bash
# Upload a single image
supabase storage cp ./local.jpg ss:///product-images/items/000084/image_1.jpg

# List a bucket
supabase storage ls ss:///product-images/items/000084/
```

Or use the Supabase dashboard → Storage.

## Environment variables

To pull production env into local for debugging:

```bash
vercel env pull .env.local
```

To add a new env var:

```bash
vercel env add MY_NEW_VAR
# then redeploy or it won't take effect
```

Public (browser-readable) vars must be prefixed `NEXT_PUBLIC_`. Everything else is server-only by default.

## Updating dependencies

```bash
npm outdated                   # see what's behind
npm update <package>           # safe minor updates
npm install <package>@latest   # major upgrade — test thoroughly
```

Major version bumps (Next.js, React, Supabase SDK): handle in their own PR, watch CI carefully.
