import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import type { DiscountCode, EmailSubscriber } from '@/lib/types';
import { AdminMarketingView } from '@/components/admin/AdminMarketingView';

export const dynamic = 'force-dynamic';

export default async function AdminMarketingPage() {
  if (!(await isAdmin())) redirect('/admin');

  const supabase = createServiceClient();
  const [emailsRes, discountsRes] = await Promise.all([
    supabase
      .from('emails')
      .select('email, source, discount_code, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('discount_codes')
      .select('id, code, type, value, is_active, max_uses, used_count, created_at')
      .eq('is_gift_certificate', false)
      .order('created_at', { ascending: false }),
  ]);

  if (emailsRes.error || discountsRes.error) {
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
            <span className="version-label">Marketing</span>
          </div>
        </header>
        <div className="marketing-body">
          <p className="marketing-empty">
            Error loading marketing data:{' '}
            {emailsRes.error?.message ?? discountsRes.error?.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminMarketingView
      emails={(emailsRes.data ?? []) as EmailSubscriber[]}
      initialDiscounts={(discountsRes.data ?? []) as DiscountCode[]}
    />
  );
}
