import type { Metadata } from 'next';
import Link from 'next/link';
import { DetailHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for Object Lesson — how we collect, use, and protect your information.',
  alternates: { canonical: 'https://objectlesson.la/privacy' },
};

/**
 * Privacy policy — ported from v1 privacy/index.html (96 lines).
 * Required for Meta Pixel disclosure / GDPR compliance.
 */
export default function PrivacyPage() {
  return (
    <div id="view-privacy">
      <DetailHeader />
      <main className="privacy-body">
        <h1 className="privacy-h1">Privacy Policy</h1>
        <p className="privacy-updated">Last updated: March 10, 2026</p>

        <p>
          Object Lesson (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the
          website objectlesson.la. This policy describes how we collect, use, and protect your
          information when you visit our site or make a purchase.
        </p>

        <h2 className="privacy-h2">Information We Collect</h2>
        <p>We may collect the following information:</p>
        <ul>
          <li>
            <strong>Email address</strong> — when you sign up for updates or proceed to checkout
          </li>
          <li>
            <strong>Payment information</strong> — processed securely by Square; we do not store
            credit card details
          </li>
          <li>
            <strong>Usage data</strong> — pages visited, time on site, device type, and referral
            source
          </li>
        </ul>

        <h2 className="privacy-h2">How We Use Your Information</h2>
        <ul>
          <li>To process and fulfill purchases</li>
          <li>To send occasional updates about new items (if you opted in)</li>
          <li>To improve our website and understand how visitors use it</li>
          <li>To run advertising campaigns on platforms like Instagram and Facebook</li>
        </ul>

        <h2 className="privacy-h2">Third-Party Services</h2>
        <p>We use the following third-party services that may collect data:</p>
        <ul>
          <li>
            <strong>Square</strong> — payment processing
          </li>
          <li>
            <strong>Meta (Facebook/Instagram)</strong> — advertising pixel for ad performance
            tracking
          </li>
          <li>
            <strong>Supabase</strong> — analytics, image storage, and email storage
          </li>
          <li>
            <strong>Vercel</strong> — website hosting
          </li>
        </ul>
        <p>Each service has its own privacy policy governing how it handles your data.</p>

        <h2 className="privacy-h2">Cookies &amp; Tracking</h2>
        <p>
          We use the Meta Pixel to measure advertising effectiveness. We also use local browser
          storage to remember your preferences (such as dismissing banners). We do not use
          third-party cookie-based trackers beyond the Meta Pixel.
        </p>

        <h2 className="privacy-h2">Data Retention</h2>
        <p>
          We retain email addresses and analytics data indefinitely to improve our services. You
          may request deletion of your data at any time by contacting us.
        </p>

        <h2 className="privacy-h2">Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Request access to the personal data we hold about you</li>
          <li>Request correction or deletion of your data</li>
          <li>Opt out of marketing emails at any time</li>
        </ul>

        <h2 className="privacy-h2">Children&rsquo;s Privacy</h2>
        <p>
          Our site is not directed at children under 13 and we do not knowingly collect
          information from children.
        </p>

        <h2 className="privacy-h2">Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. Changes will be posted on this page with an
          updated date.
        </p>

        <h2 className="privacy-h2">Contact</h2>
        <p>
          If you have questions about this policy, contact us at{' '}
          <a href="mailto:eli@objectlesson.la">eli@objectlesson.la</a>.
        </p>

        <Link className="privacy-back" href="/">
          ← Back to Object Lesson
        </Link>
      </main>
    </div>
  );
}
