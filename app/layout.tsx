import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://objectlesson.la'),
  title: {
    default: 'Object Lesson',
    template: '%s — Object Lesson',
  },
  description: 'Uncommon Objects, Art and Design — Pasadena.',
  icons: { icon: '/OL_logo.svg' },
  openGraph: {
    title: 'Object Lesson',
    description: 'Uncommon Objects, Art and Design — Pasadena.',
    url: 'https://objectlesson.la/',
    type: 'website',
    images: [{ url: '/Asset%201.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Object Lesson',
    description: 'Uncommon Objects, Art and Design — Pasadena.',
    images: ['/Asset%201.png'],
  },
};

/**
 * Root layout — html + body shell only. Section-specific styles are loaded by:
 *   - app/(public)/layout.tsx  → site.css + Meta Pixel
 *   - app/admin/layout.tsx     → admin/style.css
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="X-Frame-Options" content="DENY" />
      </head>
      <body>{children}</body>
    </html>
  );
}
