/**
 * Pure functions that compute the admin analytics dashboard payload from
 * raw rows. Separated from the API route so unit-style assertions can be
 * made against deterministic inputs (events the user is going to see live
 * in production aren't suitable for fixture-based testing).
 *
 * Mirrors v1 admin/app.js loadAnalytics() (lines 1578-1873). One change:
 * server-side aggregation, so the browser never pulls 50k rows.
 */

import type { Item } from './types';

export type Range = 1 | 7 | 30 | 90;

export type EventRow = {
  event: string;
  item_id: string | null;
  session_id: string | null;
  referrer: string | null;
  utm_source: string | null;
  ua_mobile: boolean | null;
  duration: number | null;
  created_at: string;
};

export type SaleRow = {
  type: 'item' | 'gift_certificate';
  amount: number;
  created_at: string;
};

export type DeltaCls = 'up' | 'down' | 'flat' | 'new';
export type Delta = { text: string; cls: DeltaCls };

export type SparkBucket = { label: string; count: number; isToday: boolean };

export type TopItem = {
  id: string;
  views: number;
  inquiries: number;
  title: string;
  thumb: string | null;
};

export type AnalyticsPayload = {
  range: Range;
  rangeLabel: string;
  rangeViews: number;
  rangeUniques: number;
  rangeDelta: Delta;
  avgDurationSec: number;
  durationsCount: number;
  todayViews: number;
  todayUniques: number;
  todayDelta: Delta;
  revenueUsd: number;
  salesCount: number;
  giftCertsCount: number;
  sparkline: SparkBucket[];
  sparkLabel: string;
  funnel: { visitors: number; itemViews: number; inquiries: number };
  inquiriesCount: number;
  topItems: TopItem[];
  categories: { label: string; count: number; pct: number }[];
  sources: { label: string; count: number; pct: number }[];
  devices: { mobile: { count: number; pct: number }; desktop: { count: number; pct: number } };
};

const RANGE_LABELS: Record<Range, string> = {
  1: 'Today',
  7: 'This Week',
  30: 'This Month',
  90: 'Last 90 Days',
};

function pctChange(cur: number, prev: number): Delta {
  if (prev === 0 && cur === 0) return { text: '—', cls: 'flat' };
  if (prev === 0) return { text: '↑ new', cls: 'new' };
  const p = Math.round(((cur - prev) / prev) * 100);
  if (p === 0) return { text: '—', cls: 'flat' };
  if (p > 0) return { text: `↑ ${p}%`, cls: 'up' };
  return { text: `↓ ${Math.abs(p)}%`, cls: 'down' };
}

function msAtMidnightUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function aggregateAnalytics(input: {
  range: Range;
  now: Date;
  pageViews: EventRow[];
  itemEvents: EventRow[];
  sessionEnds: EventRow[];
  sales: SaleRow[];
  items: Pick<Item, 'id' | 'title' | 'category' | 'hero_image' | 'images'>[];
  thumbUrl: (path: string | null | undefined) => string | null;
  categoryLabel: (cat: string) => string;
}): AnalyticsPayload {
  const { range, now, pageViews, itemEvents, sessionEnds, sales, items, thumbUrl, categoryLabel } = input;

  // Pre-compute timestamps once
  const pvWithTs = pageViews.map((r) => ({ ...r, _ts: new Date(r.created_at).getTime() }));

  const todayMs = msAtMidnightUtc(now);
  const yesterdayMs = todayMs - 86400000;
  const rangeMs = range === 1 ? todayMs : now.getTime() - range * 86400000;
  const prevRangeMs = range === 1 ? yesterdayMs : now.getTime() - range * 2 * 86400000;

  const pvBetween = (s: number, e?: number) =>
    pvWithTs.filter((r) => r._ts >= s && (e === undefined || r._ts < e));

  const todayPV = pvBetween(todayMs);
  const yesterdayPV = pvBetween(yesterdayMs, todayMs);
  const rangePV = pvBetween(rangeMs);
  const prevRangePV = pvBetween(prevRangeMs, rangeMs);

  const rangeViews = rangePV.length;
  const rangeUniques = new Set(rangePV.map((r) => r.session_id)).size;
  const rangeDelta = pctChange(rangeViews, prevRangePV.length);

  const todayViews = todayPV.length;
  const todayUniques = new Set(todayPV.map((r) => r.session_id)).size;
  const todayDelta = pctChange(todayViews, yesterdayPV.length);

  // Avg session duration over the range. Filter out absurd values (matches v1).
  const rangeSE = sessionEnds.filter((r) => new Date(r.created_at).getTime() >= rangeMs);
  const durations = rangeSE
    .map((r) => Number(r.duration))
    .filter((d) => Number.isFinite(d) && d > 0 && d < 3600);
  const avgDurationSec = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Revenue
  const rangeSales = sales.filter((s) => new Date(s.created_at).getTime() >= rangeMs);
  const revenueUsd = rangeSales.reduce((sum, s) => sum + Number(s.amount), 0);
  const giftCertsCount = rangeSales.filter((s) => s.type === 'gift_certificate').length;

  // Sparkline. 1d = 24 hourly buckets; other ranges = N daily buckets capped at 14.
  const sparkline: SparkBucket[] = [];
  if (range === 1) {
    for (let i = 23; i >= 0; i--) {
      const bucketStart = new Date(now);
      bucketStart.setHours(now.getHours() - i, 0, 0, 0);
      const s = bucketStart.getTime();
      const e = s + 3600000;
      const hour = bucketStart.getHours();
      const label =
        hour % 6 === 0
          ? bucketStart.toLocaleTimeString('en', { hour: 'numeric', hour12: true }).replace(' ', '')
          : '';
      sparkline.push({
        label,
        count: pvWithTs.filter((r) => r._ts >= s && r._ts < e).length,
        isToday: i === 0,
      });
    }
  } else {
    const buckets = Math.min(range, 14);
    for (let i = buckets - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const s = msAtMidnightUtc(d);
      const e = s + 86400000;
      sparkline.push({
        label: d.toLocaleDateString('en', { weekday: 'narrow' }),
        count: pvWithTs.filter((r) => r._ts >= s && r._ts < e).length,
        isToday: i === 0,
      });
    }
  }
  const sparkLabel = range === 1 ? 'Hourly Views today' : `Daily Views (${range}d)`;

  // Funnel: visitors (unique session_ids in pageviews), item_views, inquiries
  const funnelVisitors = new Set(rangePV.map((r) => r.session_id)).size;
  const itemEventsInRange = itemEvents.filter(
    (r) => new Date(r.created_at).getTime() >= rangeMs,
  );
  const itemViewEvents = itemEventsInRange.filter((r) => r.event === 'item_view');
  const inquireEvents = itemEventsInRange.filter((r) => r.event === 'inquire');
  const funnel = {
    visitors: funnelVisitors,
    itemViews: itemViewEvents.length,
    inquiries: inquireEvents.length,
  };

  // Top items
  const ivCounts = new Map<string, number>();
  const iqCounts = new Map<string, number>();
  for (const ev of itemEventsInRange) {
    if (!ev.item_id) continue;
    const counts = ev.event === 'item_view' ? ivCounts : ev.event === 'inquire' ? iqCounts : null;
    if (counts) counts.set(ev.item_id, (counts.get(ev.item_id) ?? 0) + 1);
  }
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const topItems: TopItem[] = [...ivCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, views]) => {
      const it = itemsById.get(id);
      const thumbPath = it ? it.hero_image ?? it.images?.[0] ?? null : null;
      return {
        id,
        views,
        inquiries: iqCounts.get(id) ?? 0,
        title: it?.title ?? `Item ${id}`,
        thumb: thumbUrl(thumbPath),
      };
    });

  // Categories
  const catCounts = new Map<string, number>();
  for (const ev of itemViewEvents) {
    const it = ev.item_id ? itemsById.get(ev.item_id) : null;
    if (!it?.category) continue;
    const label = categoryLabel(it.category);
    catCounts.set(label, (catCounts.get(label) ?? 0) + 1);
  }
  const totalCat = [...catCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const categories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count, pct: Math.round((count / totalCat) * 100) }));

  // Traffic sources
  const sourceCounts = new Map<string, number>();
  for (const r of rangePV) {
    let src = 'Direct';
    if (r.utm_source) {
      src = r.utm_source.charAt(0).toUpperCase() + r.utm_source.slice(1);
    } else if (r.referrer) {
      try {
        const h = new URL(r.referrer).hostname.replace('www.', '');
        const first = h.split('.')[0] || 'Other';
        src = first.charAt(0).toUpperCase() + first.slice(1);
      } catch {
        src = 'Other';
      }
    }
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1);
  }
  const totalSrc = rangePV.length || 1;
  const sources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count, pct: Math.round((count / totalSrc) * 100) }));

  // Devices
  const mobile = rangePV.filter((r) => r.ua_mobile).length;
  const desktop = rangePV.length - mobile;
  const totalDev = rangePV.length || 1;
  const devices = {
    mobile: { count: mobile, pct: Math.round((mobile / totalDev) * 100) },
    desktop: { count: desktop, pct: Math.round((desktop / totalDev) * 100) },
  };

  return {
    range,
    rangeLabel: RANGE_LABELS[range],
    rangeViews,
    rangeUniques,
    rangeDelta,
    avgDurationSec,
    durationsCount: durations.length,
    todayViews,
    todayUniques,
    todayDelta,
    revenueUsd,
    salesCount: rangeSales.length,
    giftCertsCount,
    sparkline,
    sparkLabel,
    funnel,
    inquiriesCount: inquireEvents.length,
    topItems,
    categories,
    sources,
    devices,
  };
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return '—';
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
}

export function formatUsd(n: number): string {
  return `$${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
