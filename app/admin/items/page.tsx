import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import type { Item } from '@/lib/types';
import { AdminListView } from '@/components/admin/AdminListView';

export const dynamic = 'force-dynamic';

const APP_VERSION = 'v2.0';

export default async function AdminItemsList() {
  if (!(await isAdmin())) redirect('/admin');

  const supabase = createServiceClient();
  const { data } = await supabase
    .from('items')
    .select('*')
    .order('display_order', { ascending: true });
  const items = (data ?? []) as Item[];

  return <AdminListView items={items} version={APP_VERSION} />;
}
