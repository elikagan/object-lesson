import Link from 'next/link';
import { formatDuration, formatUsd, type AnalyticsPayload, type Range } from '@/lib/analytics-aggregate';

/**
 * Admin Analytics dashboard — matches v1 admin/app.js loadAnalytics()
 * rendering (lines 1739-1873) verbatim. The aggregation has been moved
 * server-side (see lib/analytics-aggregate.ts + app/api/admin/analytics);
 * this component is pure presentation.
 */
export function AdminAnalyticsView({ data, range }: { data: AnalyticsPayload; range: Range }) {
  return (
    <div id="view-analytics" className="view">
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

        {/* Summary cards row 1: views + avg time + (today, when range > 1) */}
        <div className="analytics-cards">
          <div className="analytics-card">
            <div className="analytics-card-label">{data.rangeLabel}</div>
            <div className="analytics-card-value">{data.rangeViews}</div>
            <div className="analytics-card-sub">
              {data.rangeUniques} unique{data.rangeUniques !== 1 ? 's' : ''}
            </div>
            <div className={`analytics-card-change change-${data.rangeDelta.cls}`}>
              {data.rangeDelta.text}
            </div>
          </div>
          <div className="analytics-card">
            <div className="analytics-card-label">Avg. Time</div>
            <div className="analytics-card-value">{formatDuration(data.avgDurationSec)}</div>
            <div className="analytics-card-sub">
              {data.durationsCount} session{data.durationsCount !== 1 ? 's' : ''}
            </div>
          </div>
          {range !== 1 && (
            <div className="analytics-card">
              <div className="analytics-card-label">Today</div>
              <div className="analytics-card-value">{data.todayViews}</div>
              <div className="analytics-card-sub">
                {data.todayUniques} unique{data.todayUniques !== 1 ? 's' : ''}
              </div>
              <div className={`analytics-card-change change-${data.todayDelta.cls}`}>
                {data.todayDelta.text}
              </div>
            </div>
          )}
        </div>

        {/* Revenue card row */}
        <div className="analytics-cards">
          <div className="analytics-card">
            <div className="analytics-card-label">Revenue {data.rangeLabel}</div>
            <div className="analytics-card-value">{formatUsd(data.revenueUsd)}</div>
            <div className="analytics-card-sub">
              {data.salesCount} sale{data.salesCount !== 1 ? 's' : ''}
              {data.giftCertsCount > 0
                ? ` (${data.giftCertsCount} gift cert${data.giftCertsCount !== 1 ? 's' : ''})`
                : ''}
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="analytics-section">
          <div className="analytics-section-title">{data.sparkLabel}</div>
          <div className="sparkline">
            {data.sparkline.map((d, i) => {
              const sparkMax = Math.max(1, ...data.sparkline.map((x) => x.count));
              const h = Math.max(4, Math.round((d.count / sparkMax) * 100));
              return (
                <div key={i} className="sparkline-col">
                  <div
                    className={`sparkline-bar${d.isToday ? ' today' : ''}`}
                    style={{ height: `${h}%` }}
                  />
                  <span className="sparkline-day">{d.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Conversion funnel */}
        {data.funnel.visitors > 0 && (
          <div className="analytics-section">
            <div className="analytics-section-title">Conversion Funnel ({range}d)</div>
            <div className="funnel">
              <FunnelRow count={data.funnel.visitors} label="visitors" pct={100} />
              <FunnelRow
                count={data.funnel.itemViews}
                label="item views"
                pct={Math.round((data.funnel.itemViews / Math.max(1, data.funnel.visitors)) * 100)}
              />
              <FunnelRow
                count={data.funnel.inquiries}
                label="inquiries"
                pct={Math.round((data.funnel.inquiries / Math.max(1, data.funnel.visitors)) * 100)}
                accent
              />
            </div>
          </div>
        )}

        {/* Inquiries summary */}
        <div className="analytics-card analytics-card-full">
          <div className="analytics-card-label">Inquiries</div>
          <div className="analytics-card-value">{data.inquiriesCount}</div>
          <div className="analytics-card-sub">last {range}d</div>
        </div>

        {/* Most viewed */}
        {data.topItems.length > 0 && (
          <div className="analytics-section">
            <div className="analytics-section-title">Most Viewed ({range}d)</div>
            {data.topItems.map((t) => (
              <div key={t.id} className="analytics-item">
                <div className="item-thumb">
                  {t.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumb} alt="" />
                  ) : null}
                </div>
                <div className="analytics-item-info">
                  <div className="analytics-item-title">{t.title}</div>
                  <div className="analytics-item-stats">
                    {t.views} view{t.views !== 1 ? 's' : ''}
                    {t.inquiries > 0 ? ` · ${t.inquiries} inq` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Categories */}
        {data.categories.length > 0 && (
          <div className="analytics-section">
            <div className="analytics-section-title">Popular Categories ({range}d)</div>
            {data.categories.map((c) => (
              <BarRow key={c.label} label={c.label} pct={c.pct} />
            ))}
          </div>
        )}

        {/* Traffic sources */}
        <div className="analytics-section">
          <div className="analytics-section-title">Traffic Sources ({range}d)</div>
          {data.sources.length > 0 ? (
            data.sources.map((s) => <BarRow key={s.label} label={s.label} pct={s.pct} />)
          ) : (
            <div className="analytics-empty-small">No data yet</div>
          )}
        </div>

        {/* Devices */}
        <div className="analytics-section">
          <div className="analytics-section-title">Devices ({range}d)</div>
          <BarRow label="Mobile" pct={data.devices.mobile.pct} />
          <BarRow label="Desktop" pct={data.devices.desktop.pct} />
        </div>
      </div>
    </div>
  );
}

function FunnelRow({
  count,
  label,
  pct,
  accent,
}: {
  count: number;
  label: string;
  pct: number;
  accent?: boolean;
}) {
  return (
    <div className="funnel-row">
      <div
        className={`funnel-bar${accent ? ' funnel-accent' : ''}`}
        style={{ width: `${Math.max(3, pct)}%` }}
      />
      <span className="funnel-label">
        <span className="funnel-count">{count}</span> {label}{' '}
        <span className="funnel-pct">{pct}%</span>
      </span>
    </div>
  );
}

function BarRow({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="analytics-bar-row">
      <span className="analytics-bar-label">{label}</span>
      <div className="analytics-bar-track">
        <div className="analytics-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="analytics-bar-pct">{pct}%</span>
    </div>
  );
}
