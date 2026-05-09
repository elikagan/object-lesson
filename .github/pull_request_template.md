<!--
  Every PR uses this template. The pr-checklist GitHub Action will block
  merging until every box below is checked. If something doesn't apply,
  delete that line — don't leave it unchecked.
-->

## What changed

<!-- One sentence. -->

## Audit row (if applicable)

<!--
  e.g. "P0-2 — Admin Sales view"
  If this PR closes one or more audit rows, list their IDs (P0-N / P1-N / P2-N)
  here or in the title. The audit-row-sync workflow will require this PR's
  diff to flip those rows from `- [ ]` to `- [x]` in AUDIT.md. No silent
  claims of completion.
-->

## Evidence

<!--
  Required: a screenshot or a screen recording showing the change working.
  The `evidence` workflow blocks merge if this section has no embedded image,
  GitHub user-attachment URL, or Loom/YouTube link.

  A bare Vercel preview URL is NOT evidence — it doesn't prove anyone
  clicked through. The picture / video does.
-->

## Checklist

- [ ] I exercised this change in a real browser (local dev or Vercel preview). Evidence is in the section above.
- [ ] No new `coming soon`, `placeholder`, or `TODO ... later/port/follow-up` strings in shipped code (the `check-no-stubs` step enforces this; this checkbox confirms intent).
- [ ] If this is a bug fix: a regression test exists in this PR, and CI on the parent commit was confirmed to fail without the fix.
- [ ] If this PR closes an `AUDIT.md` row: this PR also flips that row's `- [ ]` to `- [x]` (the `audit-row-sync` workflow enforces this).
- [ ] No v1 feature is removed or regressed by this PR (cross-check `AUDIT.md`).
