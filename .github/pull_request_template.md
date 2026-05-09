<!--
  Every PR uses this template. The pr-checklist GitHub Action will block
  merging until every box below is checked. If something doesn't apply,
  delete that line — don't leave it unchecked.
-->

## What changed

<!-- One sentence. -->

## Audit row (if applicable)

<!-- e.g. "AUDIT.md row 2.4 — drag-to-reorder photos in editor" -->

## Evidence

<!--
  Required: a screenshot, a screen recording, OR a Vercel preview URL with
  reproduction steps. "It compiles" / "tests pass" are NOT evidence —
  CI catches those automatically. This section proves you used the feature.
-->

## Checklist

- [ ] I exercised this change in a real browser (local dev or Vercel preview). Evidence is in the section above.
- [ ] No new `coming soon`, `placeholder`, or `TODO ... later/port/follow-up` strings in shipped code (the `check-no-stubs` step enforces this; this checkbox confirms intent).
- [ ] If this is a bug fix: a regression test exists in this PR, and CI on the parent commit was confirmed to fail without the fix.
- [ ] If this PR touches `MIGRATION.md` checkbox state: evidence for each newly-checked box is linked above.
- [ ] No v1 feature is removed or regressed by this PR (cross-check `AUDIT.md`).
