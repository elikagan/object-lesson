import type { Metadata } from 'next';
import { DetailHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'About',
  description: 'Object Lesson — Eli Kagan & Megan Gage, Pasadena.',
};

export default function AboutPage() {
  return (
    <div id="view-about">
      <DetailHeader />
      <div className="about-body">
        <p className="about-tagline">Uncommon Objects, Art and Design</p>
        <p className="about-founders">Eli Kagan &amp; Megan Gage</p>
        <div className="about-details">
          <p className="about-location">
            <a
              href="https://maps.google.com/?q=480+S+Fair+Oaks+Ave,+Pasadena,+CA+91105"
              target="_blank"
              rel="noopener noreferrer"
            >
              480 S. Fair Oaks Ave
              <br />
              Pasadena, CA 91105
            </a>
          </p>
          <p className="about-context">In the Pasadena Antique Center</p>
          <div className="about-links">
            <a href="mailto:eli@objectlesson.la">eli@objectlesson.la</a>
            <a
              href="https://instagram.com/objectlesson_la"
              target="_blank"
              rel="noopener noreferrer"
            >
              @objectlesson_la
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
