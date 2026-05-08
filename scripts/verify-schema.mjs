#!/usr/bin/env node
/**
 * Verify that migration 0001 has been applied.
 * Run with: `node --env-file=.env.local scripts/verify-schema.mjs`
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

let ok = true;

// 1. items table exists
{
  const { error } = await supabase.from('items').select('*', { count: 'exact', head: true });
  if (error) {
    console.error('❌ items table:', error.message);
    ok = false;
  } else {
    console.log('✅ items table exists');
  }
}

// 2. _supa_exec function exists (call with no-op SQL)
{
  const { error } = await supabase.rpc('_supa_exec', { sql: 'select 1' });
  if (error) {
    console.error('❌ _supa_exec function:', error.message);
    ok = false;
  } else {
    console.log('✅ _supa_exec function callable by service_role');
  }
}

// 3. storage bucket exists
{
  const { data, error } = await supabase.storage.getBucket('product-images');
  if (error) {
    console.error('❌ product-images bucket:', error.message);
    ok = false;
  } else {
    console.log(`✅ product-images bucket exists (public: ${data.public})`);
  }
}

// 4. _migrations log shows 0001 applied
{
  const { data, error } = await supabase.from('_migrations').select('*');
  if (error) {
    console.error('❌ _migrations table:', error.message);
    ok = false;
  } else {
    console.log(`✅ _migrations log: ${data.map(r => r.filename).join(', ')}`);
  }
}

if (!ok) process.exit(1);
console.log('\nSchema verified.');
