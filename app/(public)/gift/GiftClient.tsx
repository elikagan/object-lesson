'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './gift.module.css';
import { trackEvent } from '@/lib/analytics';

const CHECKOUT_URL = '/api/gift-checkout';

export function GiftClient() {
  const params = useSearchParams();
  const purchasedCode = params.get('purchased') === '1' ? params.get('code') : null;

  if (purchasedCode) {
    return <GiftConfirmation code={purchasedCode} />;
  }
  return <GiftForm />;
}

function GiftForm() {
  const [amount, setAmount] = useState('');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onBuy() {
    const a = parseFloat(amount);
    if (!a || a <= 0 || a > 10000) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { amount: a };
      if (to.trim()) body.recipientName = to.trim();
      if (from.trim()) body.purchaserName = from.trim();
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Unable to process. Please try again.');
        setSubmitting(false);
      }
    } catch {
      alert('Unable to process. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <Link href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/OL_logo.svg" alt="Object Lesson" className={styles.logo} />
      </Link>
      <div className={styles.container}>
        <h1 className={styles.h1}>Gift Certificate</h1>
        <p className={styles.subtitle}>
          Give the gift of something unexpected. Object Lesson gift certificates can be used online
          or in-store at our Pasadena shop — and they never expire.
        </p>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="amount">
            Amount
          </label>
          <div className={styles.amountWrap}>
            <input
              id="amount"
              type="number"
              className={styles.input}
              placeholder="50"
              min={1}
              max={10000}
              step={1}
              inputMode="numeric"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="to">
            To <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
          </label>
          <input
            id="to"
            type="text"
            className={styles.input}
            placeholder="Recipient name"
            maxLength={100}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="from">
            From <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span>
          </label>
          <input
            id="from"
            type="text"
            className={styles.input}
            placeholder="Your name"
            maxLength={100}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <button className={styles.btn} onClick={onBuy} disabled={submitting}>
          {submitting ? 'Processing...' : 'Purchase Gift Certificate'}
        </button>
        <Link className={styles.back} href="/">
          ← Back to shop
        </Link>
      </div>
    </div>
  );
}

function GiftConfirmation({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const shareSubject = 'Gift Certificate for Object Lesson';
  const shareText = `Here's a gift certificate for Object Lesson!\n\nCode: ${code}\n\nUse it at objectlesson.la or in-store in Pasadena. It doesn't expire.`;

  // Fire `gift_purchase` exactly once when the confirmation view mounts.
  // Re-mounting via the back button doesn't re-fire because Next.js routes
  // away from this view on any navigation that loses `?purchased=1`.
  useEffect(() => {
    trackEvent('gift_purchase');
  }, []);
  const isMobile =
    typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <div className={styles.page}>
      <Link href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/OL_logo.svg" alt="Object Lesson" className={styles.logo} />
      </Link>
      <div className={styles.container}>
        <div className={styles.confirmation}>
          <div className={styles.confTitle}>Gift Certificate Purchased</div>
          <p className={styles.confSubtitle}>Give this code to the recipient to use at checkout.</p>
          <div
            className={styles.giftCode}
            onClick={() => {
              navigator.clipboard.writeText(code).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
          >
            {code}
          </div>
          <p className={styles.copyHint}>{copied ? 'Copied!' : 'Tap to copy'}</p>
          <div className={styles.shareButtons}>
            <a
              className={styles.shareBtn}
              href={`mailto:?subject=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(shareText)}`}
            >
              Email
            </a>
            <a className={styles.shareBtn} href={`sms:?&body=${encodeURIComponent(shareText)}`}>
              Text
            </a>
            {isMobile && typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                className={styles.shareBtn}
                onClick={() => {
                  navigator.share({ title: shareSubject, text: shareText }).catch(() => {});
                }}
              >
                Share
              </button>
            )}
          </div>
          <p className={styles.confNote}>
            This code can be used at checkout on objectlesson.la or in-store at Object Lesson in
            Pasadena. It does not expire.
          </p>
          <p className={styles.confNote} style={{ fontSize: 13, marginTop: -16 }}>
            A confirmation email with this code has been sent to your payment email.
          </p>
          <Link
            href="/"
            className={styles.btn}
            style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
