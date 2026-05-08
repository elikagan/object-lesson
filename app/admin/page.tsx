import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { LockScreen } from './LockScreen';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  if (await isAdmin()) {
    redirect('/admin/items');
  }
  return <LockScreen />;
}
