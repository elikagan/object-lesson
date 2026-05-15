'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { trackEvent } from '@/lib/analytics';

/**
 * Bottom-of-screen email capture bar offering 10% off code "WELCOME10".
 * Hidden if user has dismissed it OR has already collected the code.
 */
export function EmailBar() {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const justPurchased = params.has('purchased');
    const dismissed = localStorage.getItem('ol_email_dismissed') === '1';
    if (!dismissed && !justPurchased) {
      // Reads localStorage / URL on mount — intentional set-during-effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      setTimeout(() => setShown(true), 50);
    }
  }, []);

  function dismiss() {
    setShown(false);
    setTimeout(() => setVisible(false), 400);
    localStorage.setItem('ol_email_dismissed', '1');
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('email') as HTMLInputElement;
    const email = input.value.trim();
    if (!email) return;

    setSubmitting(true);
    try {
      const supabase = createClient();
      await supabase.from('emails').insert({
        email,
        source: 'newsletter',
        discount_code: 'WELCOME10',
      });
    } catch {
      /* swallow — non-critical */
    }
    trackEvent('email_signup');
    localStorage.setItem('ol_email_collected', '1');
    localStorage.setItem('ol_email_dismissed', '1');
    setSubmitted(true);
    setTimeout(dismiss, 6000);
  }

  if (!visible) return null;

  return (
    <div className={`email-bar${shown ? ' show' : ''}`}>
      <button className="email-bar-close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
      <p className="email-bar-offer">Get 10% off your first purchase</p>
      {!submitted ? (
        <form className="email-bar-form" onSubmit={onSubmit}>
          <input
            type="email"
            name="email"
            className="email-bar-input"
            placeholder="Enter your email"
            required
            disabled={submitting}
          />
          <button type="submit" className="email-bar-btn" disabled={submitting}>
            {submitting ? '...' : 'Get Code'}
          </button>
        </form>
      ) : (
        <div className="email-bar-success" style={{ display: 'block' }}>
          <p>
            Your code: <strong>WELCOME10</strong>
          </p>
          <p className="email-bar-hint">Enter it on any item page for 10% off</p>
        </div>
      )}
    </div>
  );
}
