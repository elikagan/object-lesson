'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Lock screen — matches v1 admin/index.html lines 18-27 verbatim.
 * Wired to v2's auth API but visually identical to the original.
 */
export function LockScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div id="view-lock" className="view">
      <form className="setup" onSubmit={onSubmit} autoComplete="on">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/OL_logo.svg" alt="Object Lesson" className="setup-logo" />
        <input type="hidden" name="username" value="admin" autoComplete="username" />
        <label className="field-label">PIN</label>
        <input
          type="password"
          id="input-pin"
          className="field"
          name="password"
          placeholder="Enter PIN"
          autoComplete="current-password"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Checking...' : 'Unlock'}
        </button>
        {error && <p style={{ color: '#c63131', marginTop: 12, fontSize: 13, textAlign: 'center' }}>{error}</p>}
      </form>
    </div>
  );
}
