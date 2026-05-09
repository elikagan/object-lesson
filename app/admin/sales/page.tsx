import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import type { Sale } from '@/lib/types';
import { AdminSalesView } from '@/components/admin/AdminSalesView';

export const dynamic = 'force-dynamic';

export default async function AdminSalesPage() {
  if (!(await isAdmin())) redirect('/admin');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    // Surface the error inline rather than 500 — the admin needs to see it.
    return (
      <div className="view">
        <header className="topbar">
          <Link href="/admin/items" className="icon-btn" aria-label="Back to items">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/OL_logo.svg" alt="Object Lesson" className="topbar-logo" />
          <div className="topbar-actions">
            <span className="version-label">Sales</span>
          </div>
        </header>
        <div className="marketing-body">
          <p className="marketing-empty">Error loading sales: {error.message}</p>
        </div>
      </div>
    );
  }

  const sales = (data ?? []) as Sale[];
  return <AdminSalesView sales={sales} />;
}
