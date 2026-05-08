import Link from 'next/link';
import { DetailHeader } from '@/components/SiteHeader';

export default function NotFound() {
  return (
    <div id="view-notfound">
      <DetailHeader />
      <div className="notfound-body">
        <p className="notfound-msg">This item is no longer available.</p>
        <Link href="/" className="notfound-link">
          Browse all items
        </Link>
      </div>
    </div>
  );
}
