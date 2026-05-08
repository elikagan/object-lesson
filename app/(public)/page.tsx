import { getAllItems } from '@/lib/queries';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Mosaic } from '@/components/Mosaic';
import { Grid } from '@/components/Grid';
import { EmailBar } from '@/components/EmailBar';
import { SiteBanner } from '@/components/SiteBanner';

// Force runtime so we always show the latest inventory.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const items = await getAllItems();

  return (
    <div id="view-grid">
      <SiteHeader />
      <SiteBanner>We&apos;re adding more of our collection every day.</SiteBanner>
      <Mosaic items={items} />
      <Grid items={items} />
      <SiteFooter />
      <EmailBar />
    </div>
  );
}
