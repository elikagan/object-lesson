import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import { CATEGORY_LABELS } from '@/lib/types';
import { thumbUrl } from '@/lib/items';
import {
  aggregateAnalytics,
  type EventRow,
  type Range,
  type SaleRow,
} from '@/lib/analytics-aggregate';
import { AdminAnalyticsView } from '@/components/admin/AdminAnalyticsView';

export const dynamic = 'force-dynamic';

function parseRange(raw: string | string[] | undefined): Range {
  const r = Number(Array.isArray(raw) ? raw[0] : raw);
  if (r === 1 || r === 7 || r === 30 || r === 90) return r;
  return 7; // default
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isAdmin())) redirect('/admin');
  const params = await searchParams;
  const range = parseRange(params.range);

  const supabase = createServiceClient();

  // Pull enough history for both the range view AND its previous-period
  // comparison. v1 used Math.max(14, range) for page views and `range` for
  // everything else; we mirror that.
  const pvSince = daysAgoIso(Math.max(14, range * 2));
  const rangeSince = daysAgoIso(range);

  const [pvResp, ieResp, seResp, salesResp, itemsResp] = await Promise.all([
    supabase
      .from('events')
      .select('event,item_id,session_id,referrer,utm_source,ua_mobile,duration,created_at')
      .eq('event', 'page_view')
      .gte('created_at', pvSince)
      .limit(50000),
    supabase
      .from('events')
      .select('event,item_id,session_id,referrer,utm_source,ua_mobile,duration,created_at')
      .in('event', ['item_view', 'inquire'])
      .gte('created_at', rangeSince)
      .not('item_id', 'is', null)
      .limit(50000),
    supabase
      .from('events')
      .select('event,item_id,session_id,referrer,utm_source,ua_mobile,duration,created_at')
      .eq('event', 'session_end')
      .gte('created_at', rangeSince)
      .not('duration', 'is', null)
      .limit(50000),
    supabase.from('sales').select('type, amount, created_at'),
    supabase.from('items').select('id, title, category, hero_image, images'),
  ]);

  const pageViews = (pvResp.data ?? []) as EventRow[];
  const itemEvents = (ieResp.data ?? []) as EventRow[];
  const sessionEnds = (seResp.data ?? []) as EventRow[];
  const sales = (salesResp.data ?? []) as SaleRow[];
  const items = itemsResp.data ?? [];

  const data = aggregateAnalytics({
    range,
    now: new Date(),
    pageViews,
    itemEvents,
    sessionEnds,
    sales,
    items,
    thumbUrl: (path) => {
      const url = thumbUrl(path);
      return url || null;
    },
    categoryLabel: (cat) =>
      (CATEGORY_LABELS as Record<string, string>)[cat] ?? cat,
  });

  // If literally everything is zero — table is dark — show a friendlier note
  // alongside the empty cards. This is the state the v2 dashboard was in
  // before P1-13 shipped.
  const isEmpty = data.rangeViews === 0 && data.salesCount === 0 && data.todayViews === 0;
  if (isEmpty) {
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
            <span className="version-label">Analytics</span>
          </div>
        </header>
        <div className="marketing-body">
          <div className="range-toggle">
            {([1, 7, 30, 90] as Range[]).map((r) => (
              <Link
                key={r}
                href={`/admin/analytics?range=${r}`}
                className={`range-btn${r === range ? ' active' : ''}`}
                prefetch={false}
              >
                {r === 1 ? '1d' : `${r}d`}
              </Link>
            ))}
          </div>
          <div className="analytics-empty">No analytics data for the selected range yet.</div>
        </div>
      </div>
    );
  }

  return <AdminAnalyticsView data={data} range={range} />;
}
