#!/usr/bin/env node
/**
 * One-time migration: upload images from v1 repo to Supabase Storage bucket
 * `product-images`. Preserves the same path structure (images/products/<id>/<file>.jpg).
 *
 * Idempotent: uses `upsert: true` so re-running doesn't fail on duplicates.
 *
 * Run: `node --env-file=.env.local scripts/migrate-images.mjs`
 */
import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const V1_REPO = '/Users/elikagan/Desktop/Claude stuff/Object Lesson App and Website';
const SOURCE_DIR = join(V1_REPO, 'images/products');
const BUCKET = 'product-images';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && /\.(jpe?g|png|webp)$/i.test(entry.name)) yield full;
  }
}

const files = [];
for await (const f of walk(SOURCE_DIR)) files.push(f);
console.log(`Found ${files.length} image files to upload`);

let totalBytes = 0;
let uploaded = 0;
let failed = 0;
const failures = [];

for (const file of files) {
  // Storage path mirrors the v1 layout: images/products/<id>/<file>.jpg
  const storagePath = relative(V1_REPO, file);
  const buffer = await readFile(file);
  totalBytes += buffer.length;

  const contentType = file.endsWith('.png') ? 'image/png' :
                      file.endsWith('.webp') ? 'image/webp' :
                      'image/jpeg';

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: true,
      cacheControl: '31536000', // 1 year
    });

  if (error) {
    failed++;
    failures.push({ file: storagePath, error: error.message });
    process.stdout.write('!');
  } else {
    uploaded++;
    if (uploaded % 50 === 0) process.stdout.write(`\n  ${uploaded}/${files.length} `);
    else process.stdout.write('.');
  }
}

console.log(`\n\n✅ Uploaded: ${uploaded}, ❌ Failed: ${failed}, total: ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

if (failed) {
  console.error('Failures:', failures.slice(0, 10));
  process.exit(1);
}

// Verify by listing the bucket
const { data, error: listErr } = await supabase.storage
  .from(BUCKET)
  .list('images/products', { limit: 1000 });
if (listErr) console.error('List failed:', listErr.message);
else console.log(`Bucket subdirectory count: ${data.length}`);
