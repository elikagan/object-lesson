import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import type { GiftCert } from '@/lib/types';
import { AdminGiftCertsView } from '@/components/admin/AdminGiftCertsView';

export const dynamic = 'force-dynamic';

export default async function AdminGiftCertsPage() {
  if (!(await isAdmin())) redirect('/admin');

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('discount_codes')
    .select('*')
    .eq('is_gift_certificate', true)
    .order('created_at', { ascending: false });

  if (error) {
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
            <span className="version-label">Gift Certificates</span>
          </div>
        </header>
        <div className="marketing-body">
          <p className="marketing-empty">Error loading gift certificates: {error.message}</p>
        </div>
      </div>
    );
  }

  const giftcerts = (data ?? []) as GiftCert[];
  return <AdminGiftCertsView initial={giftcerts} />;
}
