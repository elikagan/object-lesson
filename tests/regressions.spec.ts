import { test } from '@playwright/test';

/**
 * Active v1 regression tests live in tests/admin.spec.ts (they exercise the
 * admin API + UI). The fixme stubs that used to live here have been
 * implemented:
 *   - mark-sold persists ✓
 *   - saving item A doesn't delete item B ✓ (the architectural bug-class fix)
 *   - PATCH only updates given fields ✓
 *   - delete cleans up thumbnails ✓
 *   - "New" badge auto-expires ✓
 *
 * One remaining stub: save button double-submit. The ItemEditor uses a
 * `submitting` state to disable the button; covered indirectly by the create
 * flow tests in admin.spec.ts. Kept as fixme until we have a more direct test.
 */

test.fixme('save button cannot double-submit (rapid double-click creates one item)', async () => {
  // Open new item form, rapid double-click Save, verify only one item appears in DB.
});
