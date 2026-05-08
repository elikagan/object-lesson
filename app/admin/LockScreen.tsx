'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './admin.module.css';

export function LockScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'Invalid PIN');
        setPin('');
        return;
      }
      router.replace('/admin/items');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.lockShell}>
      <div className={styles.lockBox}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/OL_logo.svg" alt="Object Lesson" style={{ width: 120, marginBottom: 24 }} />
        <h1>Admin</h1>
        <form onSubmit={onSubmit}>
          <input
            type="password"
            inputMode="text"
            autoFocus
            className={styles.pinInput}
            placeholder="• • • •"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            disabled={submitting}
          />
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            style={{ width: '100%' }}
            disabled={submitting || !pin}
          >
            {submitting ? 'Checking...' : 'Unlock'}
          </button>
        </form>
        {error && <p style={{ color: '#c63131', marginTop: 12, fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}
