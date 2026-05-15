'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { type GiftCert, giftCertStatus } from '@/lib/types';

/**
 * Admin Gift Certificates view — matches v1 admin/app.js loadGiftCertificates()
 * and the gc-create-btn handler (lines 2110-2247).
 *
 * Behavior parity with v1:
 *   - Create form: amount (required), purchaser name, recipient name, email.
 *   - On create: server generates GIFT-XXXX-XXXX, inserts to discount_codes
 *     with is_gift_certificate=true, value=amount, max_uses=1.
 *   - List below: code + status (Active/Redeemed/Voided) + amount + names
 *     + email + date. Void button on Active rows only.
 *   - Empty state when no gift certs exist.
 *
 * Note: the v1 form had an "auto-email recipient" path that hit a
 * `/send-gift-email` worker endpoint. That endpoint hasn't been ported yet
 * (audit row P1-19). Until it ships, this form stores `purchaser_email`
 * on the record but does not auto-send; the success state shows the code
 * so the admin can email it manually.
 */
export function AdminGiftCertsView({ initial }: { initial: GiftCert[] }) {
  const router = useRouter();
  const [giftcerts, setGiftcerts] = useState(initial);
  const [amount, setAmount] = useState('');
  const [purchaser, setPurchaser] = useState('');
  const [recipient, setRecipient] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [voidingId, startVoidTransition] = useTransition();
  const [voidingTarget, setVoidingTarget] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFeedback({ kind: 'err', text: 'Amount required' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/giftcerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          purchaser_name: purchaser || undefined,
          recipient_name: recipient || undefined,
          purchaser_email: email || undefined,
        }),
      });
      const body = (await res.json()) as { giftcert?: GiftCert; error?: string };
      if (!res.ok || !body.giftcert) {
        throw new Error(body.error ?? 'Create failed');
      }
      setGiftcerts((prev) => [body.giftcert!, ...prev]);
      setAmount('');
      setPurchaser('');
      setRecipient('');
      setEmail('');
      setFeedback({
        kind: 'ok',
        text: `Created ${body.giftcert.code}${email ? ` — email manually to ${email}` : ''}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Create failed';
      setFeedback({ kind: 'err', text: msg });
    } finally {
      setCreating(false);
    }
  }

  function onVoid(id: string) {
    if (!confirm('Void this gift certificate? It cannot be redeemed afterward.')) return;
    setVoidingTarget(id);
    startVoidTransition(async () => {
      try {
        const res = await fetch(`/api/admin/giftcerts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: false }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Void failed');
        }
        setGiftcerts((prev) =>
          prev.map((g) => (g.id === id ? { ...g, is_active: false } : g)),
        );
        // Keep the server cache fresh for any other tabs.
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Void failed';
        setFeedback({ kind: 'err', text: msg });
      } finally {
        setVoidingTarget(null);
      }
    });
  }

  return (
    <div id="view-giftcerts" className="view">
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
        <section className="marketing-section">
          <h2 className="marketing-section-title">Create Gift Certificate</h2>
          <form className="discount-create" onSubmit={onCreate}>
            <div className="discount-create-row">
              <input
                className="field field-sm"
                type="number"
                inputMode="decimal"
                min="1"
                max="10000"
                step="1"
                placeholder="Amount (USD)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
              <input
                className="field field-sm"
                type="text"
                placeholder="Purchaser name"
                value={purchaser}
                onChange={(e) => setPurchaser(e.target.value)}
              />
            </div>
            <div className="discount-create-row">
              <input
                className="field field-sm"
                type="text"
                placeholder="Recipient name"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
              <input
                className="field field-sm"
                type="email"
                placeholder="Recipient email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-sm" disabled={creating}>
              {creating ? 'Creating…' : 'Create Gift Certificate'}
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
        </section>

        <section className="marketing-section">
          <div className="marketing-section-header">
            <h2 className="marketing-section-title">All Gift Certificates</h2>
            <span className="marketing-count">{giftcerts.length} total</span>
          </div>
          <div id="gc-list">
            {giftcerts.length === 0 ? (
              <p className="marketing-empty">No gift certificates yet.</p>
            ) : (
              giftcerts.map((g) => (
                <GiftCertRow
                  key={g.id}
                  giftcert={g}
                  onVoid={onVoid}
                  busy={voidingId && voidingTarget === g.id}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function GiftCertRow({
  giftcert,
  onVoid,
  busy,
}: {
  giftcert: GiftCert;
  onVoid: (id: string) => void;
  busy: boolean;
}) {
  const status = giftCertStatus(giftcert);
  const statusClass =
    status === 'Voided' ? 'gc-voided' : status === 'Redeemed' ? 'gc-redeemed' : 'gc-active';
  const names = [giftcert.purchaser_name, giftcert.recipient_name].filter(Boolean) as string[];
  const nameLabel = names.length ? names.join(' → ') : '';
  const date = new Date(giftcert.created_at).toLocaleDateString();
  const infoParts: string[] = [`$${Number(giftcert.value).toLocaleString('en-US')}`];
  if (nameLabel) infoParts.push(nameLabel);
  if (giftcert.purchaser_email) infoParts.push(giftcert.purchaser_email);
  infoParts.push(date);

  const canVoid = status === 'Active';

  return (
    <div className="dc-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dc-code">{giftcert.code}</span>
          <span className={`gc-status ${statusClass}`}>{status}</span>
        </div>
        <div className="dc-info">{infoParts.join(' · ')}</div>
      </div>
      {canVoid && (
        <button
          type="button"
          className="btn-small gc-void"
          data-id={giftcert.id}
          onClick={() => onVoid(giftcert.id)}
          disabled={busy}
        >
          {busy ? '…' : 'Void'}
        </button>
      )}
    </div>
  );
}
