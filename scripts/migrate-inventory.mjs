#!/usr/bin/env node
/**
 * One-time migration: read inventory.json from the v1 repo, INSERT into the
 * v2 `items` table.
 *
 * Idempotent: uses `upsert` keyed on id, so re-running won't duplicate.
 *
 * Run: `node --env-file=.env.local scripts/migrate-inventory.mjs`
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const V1_REPO = '/Users/elikagan/Desktop/Claude stuff/Object Lesson App and Website';
const V1_INVENTORY = join(V1_REPO, 'inventory.json');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

console.log('Reading inventory.json from v1 repo:', V1_INVENTORY);
const raw = await readFile(V1_INVENTORY, 'utf8');
const items = JSON.parse(raw);
console.log(`Found ${items.length} items in v1 inventory.json`);

// Backup before mutating anything (rule from CLAUDE.md)
const backupDir = join(process.cwd(), 'migration-backup', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(backupDir, { recursive: true });
await writeFile(join(backupDir, 'inventory.json'), raw);
console.log(`Backup saved to: ${backupDir}/inventory.json`);

// Map v1 schema → v2 schema (camelCase → snake_case, normalize defaults)
const rows = items.map((v1) => ({
  id: v1.id,
  title: v1.title || '',
  description: v1.description || '',
  price: typeof v1.price === 'number' ? v1.price : 0,
  size: v1.size || '',
  category: v1.category || 'misc',
  maker: v1.maker || '',
  condition: v1.condition || '',
  dealer_code: v1.dealerCode || '',
  posted_by: v1.postedBy || '',
  is_new: !!v1.isNew,
  is_hold: !!v1.isHold,
  is_sold: !!v1.isSold,
  hero_image: v1.heroImage || (Array.isArray(v1.images) && v1.images[0]) || null,
  images: Array.isArray(v1.images) ? v1.images : [],
  display_order: typeof v1.order === 'number' ? v1.order : 0,
  created_at: v1.createdAt || new Date().toISOString(),
}));

// Validate categories before insert — catch unknowns early
const validCategories = new Set(['wall-art', 'object', 'ceramic', 'furniture', 'light', 'sculpture', 'misc']);
const badCategory = rows.filter((r) => !validCategories.has(r.category));
if (badCategory.length) {
  console.error('Items with unknown categories:', badCategory.map((r) => ({ id: r.id, category: r.category })));
  process.exit(1);
}

// Validate conditions
const validConditions = new Set(['New', 'Like New', 'Good', 'Fair', '']);
const badCondition = rows.filter((r) => !validConditions.has(r.condition));
if (badCondition.length) {
  console.warn('Items with unknown conditions (will be coerced to ""):',
    badCondition.map((r) => ({ id: r.id, condition: r.condition })));
  for (const r of badCondition) r.condition = '';
}

// Upsert in batches of 50
const BATCH = 50;
let total = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase
    .from('items')
    .upsert(batch, { onConflict: 'id' });
  if (error) {
    console.error(`❌ Batch ${i}-${i + batch.length}:`, error.message);
    process.exit(1);
  }
  total += batch.length;
  console.log(`  upserted ${total}/${rows.length}`);
}

// Verify final count
const { count: finalCount, error: countErr } = await supabase
  .from('items')
  .select('*', { count: 'exact', head: true });
if (countErr) {
  console.error('Count verify failed:', countErr.message);
  process.exit(1);
}
console.log(`\n✅ Migration complete. items table now contains ${finalCount} rows.`);
