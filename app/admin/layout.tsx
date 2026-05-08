import type { Metadata, Viewport } from 'next';
import './style.css';

export const metadata: Metadata = {
  title: 'OL Admin',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
