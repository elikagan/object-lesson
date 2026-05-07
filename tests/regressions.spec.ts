import { test } from '@playwright/test';

/**
 * Regression tests for v1 bug classes that must NEVER come back.
 *
 * Each `test.fixme` becomes a real test as the corresponding v2 feature lands.
 * They live here from day 1 so the suite documents what we promised to prevent.
 *
 * Rule (from CLAUDE.md): every bug fix gets a regression test FIRST.
 * This file is the standing reminder of what "first" looked like for v1.
 */

test.fixme('mark-sold persists after save (v1 lost it on stale-state retry)', async () => {
  // Reproduce: open an item in the admin, toggle "Mark as Sold", save.
  // Verify: re-fetching the item from the database shows is_sold=true.
  // The v1 bug: PUT-then-GET race on a JSON file overwrote the just-saved flag.
  // The v2 architecture (PATCH single field) makes this structurally impossible —
  // but we keep the test in place as a guarantee.
});

test.fixme('saving item A does not delete item B (v1 stale-state resurrection)', async () => {
  // Reproduce: open admin in two tabs. In tab 1, add item A. In tab 2 (with stale state),
  // edit item B's price.
  // Verify: both A and B still exist in the database after tab 2's save.
  // The v1 bug: tab 2's save overwrote the entire JSON file with its stale items[]
  // that didn't include A, erasing A.
  // The v2 architecture (PATCH only the changed field) prevents this entirely.
});

test.fixme('deleting an item also removes its thumbnails from storage', async () => {
  // Reproduce: add an item with photos, delete it.
  // Verify: neither full images nor thumbnails remain in storage.
  // The v1 bug: delete handler only removed the array contents (full images),
  // leaving thumb_*.jpg orphaned.
});

test.fixme('"New" badge auto-expires after 7 days', async () => {
  // Reproduce: create an item with created_at older than 7 days, is_new=true.
  // Verify: public site does not render the "New" badge.
  // The v1 bug: admin trusted item.is_new without checking created_at,
  // and inlined preload data lacked created_at, so badges showed forever.
});

test.fixme('new items appear at the top of the admin list immediately after save', async () => {
  // Reproduce: add an item, click save, return to list view.
  // Verify: the new item is visible at position 0 without a manual reload.
  // The v1 bug: in-memory render lagged the saved state due to async preload regen
  // racing with the list render.
});

test.fixme('save button cannot double-submit (v1 created duplicate items)', async () => {
  // Reproduce: rapid double-click the Save button on a new item form.
  // Verify: only one item is created in the database.
  // The v1 bug: the saveInProgress flag was added late; before that, double-clicks
  // created duplicate inventory entries.
});
