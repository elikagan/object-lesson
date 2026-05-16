import type { Metadata, Viewport } from 'next';
import './style.css';
import { AdminServiceWorker } from '@/components/admin/AdminServiceWorker';

export const metadata: Metadata = {
  title: 'OL Admin',
  manifest: '/admin-manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OL Admin',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminServiceWorker />
      {children}
    </>
  );
}
