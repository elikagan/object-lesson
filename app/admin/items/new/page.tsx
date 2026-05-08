import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import { ItemEditor } from '@/components/admin/ItemEditor';

export const dynamic = 'force-dynamic';

export default async function AdminItemNew() {
  if (!(await isAdmin())) redirect('/admin');

  // Determine the next id by scanning existing ids
  const supabase = createServiceClient();
  const { data } = await supabase.from('items').select('id');
  let max = 0;
  for (const row of data ?? []) {
    const n = parseInt(row.id, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return <ItemEditor mode="create" nextNumericId={max + 1} />;
}
