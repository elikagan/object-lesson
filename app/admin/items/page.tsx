import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import { reconcileSales } from '@/lib/admin/reconcile';
import type { Item } from '@/lib/types';
import { AdminListView } from '@/components/admin/AdminListView';

export const dynamic = 'force-dynamic';

const APP_VERSION = 'v2.0';

export default async function AdminItemsList() {
  if (!(await isAdmin())) redirect('/admin');

  const supabase = createServiceClient();

  // P1-21: auto-mark items sold where a sale row exists but the
  // webhook miss left them unsold. Idempotent no-op on a clean DB.
  await reconcileSales(supabase);

  const { data } = await supabase
    .from('items')
    .select('*')
    .order('display_order', { ascending: true });
  const items = (data ?? []) as Item[];

  return <AdminListView items={items} version={APP_VERSION} />;
}
