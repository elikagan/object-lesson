import Link from 'next/link';
import type { Sale } from '@/lib/types';

/**
 * Admin Sales view — matches v1 admin/app.js loadSales() (lines 2270-2375)
 * verbatim. Pure presentational; data is fetched server-side and passed in.
 *
 * Behavior parity with v1:
 *   - Three summary stat cards: All Time / This Month / Today (USD revenue).
 *   - Meta line: total transactions, item-vs-gift-cert split with subtotals.
 *   - Transaction list (most recent first), one row per sale, with:
 *       Item / Gift Cert badge, title, customer name, date+time, customer
 *       email, posted-by, gift code, discount code.
 *   - Empty state when there are no sales recorded.
 */
export function AdminSalesView({ sales }: { sales: Sale[] }) {
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.amount), 0);
  const itemSales = sales.filter((s) => s.type === 'item');
  const giftSales = sales.filter((s) => s.type === 'gift_certificate');
  const itemRevenue = itemSales.reduce((sum, s) => sum + Number(s.amount), 0);
  const giftRevenue = giftSales.reduce((sum, s) => sum + Number(s.amount), 0);

  // Today's sales (slice instead of date math — matches v1 exactly)
  const today = new Date().toISOString().slice(0, 10);
  const todaySales = sales.filter((s) => (s.created_at ?? '').slice(0, 10) === today);
  const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.amount), 0);

  // This month's sales
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthSales = sales.filter((s) => (s.created_at ?? '').slice(0, 7) === thisMonth);
  const monthRevenue = monthSales.reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    <div id="view-sales" className="view">
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
        <section className="marketing-section">
          <div className="sales-summary">
            <div className="sales-stat">
              <div className="sales-stat-value">{formatUsd(totalRevenue)}</div>
              <div className="sales-stat-label">All Time</div>
            </div>
            <div className="sales-stat">
              <div className="sales-stat-value">{formatUsd(monthRevenue)}</div>
              <div className="sales-stat-label">This Month</div>
            </div>
            <div className="sales-stat">
              <div className="sales-stat-value">{formatUsd(todayRevenue)}</div>
              <div className="sales-stat-label">Today</div>
            </div>
          </div>
          <div className="sales-meta">
            {sales.length} total transactions &middot;{' '}
            {itemSales.length} items ({formatUsd(itemRevenue)}) &middot;{' '}
            {giftSales.length} gift certs ({formatUsd(giftRevenue)})
          </div>
        </section>

        <section className="marketing-section">
          <h2 className="marketing-section-title">Transaction History</h2>
          <div className="sales-list">
            {sales.length === 0 ? (
              <p className="marketing-empty">No sales recorded yet.</p>
            ) : (
              sales.map((sale) => <SaleRow key={sale.id} sale={sale} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SaleRow({ sale }: { sale: Sale }) {
  const isGift = sale.type === 'gift_certificate';
  const typeLabel = isGift ? 'Gift Cert' : 'Item';
  const typeCls = isGift ? 'sale-type-gift' : 'sale-type-item';

  // Title resolution matches v1: prefer item_title, fall back to parsed note,
  // fall back to a generic label. Trims the "Object Lesson | " prefix and the
  // trailing "(<id>)" — both produced by the Square checkout note format.
  let title = sale.item_title ?? '';
  if (!title && sale.note) {
    title = sale.note.replace('Object Lesson | ', '').replace(/\s*\([^)]*\)$/, '');
  }
  if (!title) title = isGift ? 'Gift Certificate' : 'In-store sale';

  const date = new Date(sale.created_at);
  const dateStr = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const customerName = sale.customer_name ?? '';
  const customerEmail = sale.customer_email ?? '';
  const giftCode = sale.gift_code ? `Code: ${sale.gift_code}` : '';
  const discount = sale.discount_code ? `Discount: ${sale.discount_code}` : '';

  // Build the detail line in the same separator style as v1 (· between fields,
  // each piece omitted if empty so we never render "· · ·").
  const detailParts = [`${dateStr} ${timeStr}`];
  if (customerEmail) detailParts.push(customerEmail);
  if (sale.posted_by) detailParts.push(`Posted by ${sale.posted_by}`);
  if (giftCode) detailParts.push(giftCode);
  if (discount) detailParts.push(discount);

  return (
    <div className="sale-row">
      <div className="sale-row-left">
        <span className={`sale-type ${typeCls}`}>{typeLabel}</span>
        <div className="sale-info">
          <div className="sale-title">{title}</div>
          {customerName && <div className="sale-customer">{customerName}</div>}
          <div className="sale-detail">{detailParts.join(' · ')}</div>
        </div>
      </div>
      <div className="sale-amount">{formatUsd(sale.amount)}</div>
    </div>
  );
}

function formatUsd(n: number): string {
  return `$${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
