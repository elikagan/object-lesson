import type { Metadata } from 'next';
import Script from 'next/script';
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="X-Frame-Options" content="DENY" />
      </head>
      <body>
        {children}

        {/* Meta Pixel */}
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '938556951941278');
          fbq('track', 'PageView');`}
        </Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=938556951941278&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
      </body>
    </html>
  );
}
