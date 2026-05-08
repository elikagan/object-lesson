import { redirect, notFound } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import { ItemEditor } from '@/components/admin/ItemEditor';
import type { Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminItemEdit({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect('/admin');
  const { id } = await params;
  const supabase = createServiceClient();
  const { data } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (!data) notFound();
  return <ItemEditor mode="edit" item={data as Item} />;
}
