'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DiscountCode, EmailSubscriber } from '@/lib/types';

/**
 * Admin Marketing view — matches v1 admin/app.js loadEmails() +
 * loadDiscountCodes() + dc-create handler (lines 1953-2106).
 *
 * Two sections:
 *   1. Email subscribers — read-only table with CSV export.
 *   2. Discount codes (non-gift-cert) — list with active toggle, plus
 *      a create form (random 8-char code generator + manual entry).
 *
 * Gift certs live in the same Postgres table but are surfaced through
 * /admin/giftcerts.
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRandomCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function AdminMarketingView({
  emails,
  initialDiscounts,
}: {
  emails: EmailSubscriber[];
  initialDiscounts: DiscountCode[];
}) {
  const router = useRouter();
  const [discounts, setDiscounts] = useState(initialDiscounts);

  // Create-form state
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Toggle state (in-flight)
  const [, startToggleTransition] = useTransition();
  const [toggleTargetId, setToggleTargetId] = useState<string | null>(null);

  function onExportCsv() {
    const rows: string[][] = [['Email', 'Source', 'Discount Code', 'Date']];
    for (const e of emails) {
      rows.push([
        e.email,
        e.source,
        e.discount_code ?? '',
        new Date(e.created_at).toLocaleDateString(),
      ]);
    }
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ol-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const trimmedCode = code.trim().toUpperCase();
    const val = parseFloat(value);
    if (!trimmedCode) {
      setFeedback({ kind: 'err', text: 'Code is required' });
      return;
    }
    if (!Number.isFinite(val) || val <= 0) {
      setFeedback({ kind: 'err', text: 'Value must be greater than 0' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/discounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: trimmedCode,
          type,
          value: val,
          max_uses: maxUses ? parseInt(maxUses, 10) : null,
        }),
      });
      const body = (await res.json()) as { discount?: DiscountCode; error?: string };
      if (!res.ok || !body.discount) {
        throw new Error(body.error ?? 'Create failed');
      }
      setDiscounts((prev) => [body.discount!, ...prev]);
      setCode('');
      setValue('');
      setMaxUses('');
      setFeedback({ kind: 'ok', text: `Code created: ${body.discount.code}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setFeedback({ kind: 'err', text: msg });
    } finally {
      setCreating(false);
    }
  }

  function onToggle(id: string, newActive: boolean) {
    setToggleTargetId(id);
    startToggleTransition(async () => {
      try {
        const res = await fetch(`/api/admin/discounts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: newActive }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Update failed');
        }
        setDiscounts((prev) =>
          prev.map((d) => (d.id === id ? { ...d, is_active: newActive } : d)),
        );
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed';
        setFeedback({ kind: 'err', text: msg });
      } finally {
        setToggleTargetId(null);
      }
    });
  }

  return (
    <div id="view-marketing" className="view">
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
        {/* Email subscribers section */}
        <section className="marketing-section">
          <div className="marketing-section-header">
            <h2 className="marketing-section-title">Email Subscribers</h2>
            <button type="button" className="btn-small" onClick={onExportCsv} disabled={emails.length === 0}>
              Export CSV
            </button>
          </div>
          <div className="marketing-count">
            {emails.length} subscriber{emails.length !== 1 ? 's' : ''}
          </div>
          {emails.length === 0 ? (
            <p className="marketing-empty">No subscribers yet.</p>
          ) : (
            <div className="marketing-table-wrap">
              <table className="marketing-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Source</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e, i) => (
                    <tr key={`${e.email}-${e.created_at}-${i}`}>
                      <td>{e.email}</td>
                      <td>{e.source}</td>
                      <td>{new Date(e.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Discount codes section */}
        <section className="marketing-section">
          <h2 className="marketing-section-title">Discount Codes</h2>

          <form className="discount-create" onSubmit={onCreate}>
            <div className="discount-create-row">
              <input
                className="field field-sm"
                type="text"
                placeholder="CODE"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={32}
                required
              />
              <button
                type="button"
                className="btn-small"
                onClick={() => setCode(generateRandomCode())}
              >
                Random
              </button>
            </div>
            <div className="discount-create-row">
              <select
                className="field field-sm"
                value={type}
                onChange={(e) => setType(e.target.value as 'percent' | 'fixed')}
              >
                <option value="percent">% off</option>
                <option value="fixed">$ off</option>
              </select>
              <input
                className="field field-sm"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                placeholder={type === 'percent' ? '10' : '5'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
              <input
                className="field field-sm"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="Max uses (optional)"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-sm" disabled={creating}>
              {creating ? 'Creating…' : 'Create Code'}
            </button>
            {feedback && (
              <div
                role="status"
                className="dc-info"
                style={{ marginTop: 8, color: feedback.kind === 'err' ? '#b00020' : 'var(--text)' }}
              >
                {feedback.text}
              </div>
            )}
          </form>

          <div id="dc-list">
            {discounts.length === 0 ? (
              <p className="marketing-empty">No discount codes yet.</p>
            ) : (
              discounts.map((d) => (
                <DiscountRow
                  key={d.id}
                  code={d}
                  onToggle={onToggle}
                  busy={toggleTargetId === d.id}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function DiscountRow({
  code,
  onToggle,
  busy,
}: {
  code: DiscountCode;
  onToggle: (id: string, newActive: boolean) => void;
  busy: boolean;
}) {
  const discountLabel =
    code.type === 'percent' ? `${code.value}% off` : `$${code.value} off`;
  const usesLabel = code.max_uses
    ? `${code.used_count}/${code.max_uses} uses`
    : `${code.used_count} uses`;
  return (
    <div className="dc-row">
      <span className="dc-code">{code.code}</span>
      <span className="dc-info">
        {discountLabel} · {usesLabel}
      </span>
      <button
        type="button"
        className={`dc-toggle${code.is_active ? ' active' : ''}`}
        data-id={code.id}
        data-active={code.is_active}
        aria-label={code.is_active ? 'Deactivate code' : 'Activate code'}
        disabled={busy}
        onClick={() => onToggle(code.id, !code.is_active)}
      />
    </div>
  );
}
