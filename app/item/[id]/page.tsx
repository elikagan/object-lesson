import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getItemById } from '@/lib/queries';
import { imgUrl } from '@/lib/items';
import { DetailHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ItemDetail } from '@/components/ItemDetail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) return { title: 'Not found' };
  const ogImg = imgUrl(item.hero_image) || undefined;
  return {
    title: item.title,
    description: item.description?.slice(0, 200) || `${item.title} — Object Lesson, Pasadena.`,
    openGraph: {
      title: item.title,
      description: item.description?.slice(0, 200) || '',
      images: ogImg ? [{ url: ogImg }] : undefined,
    },
  };
}

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ purchased?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const item = await getItemById(id);
  if (!item) notFound();

  const justPurchased = sp.purchased === '1';

  return (
    <div id="view-detail">
      <DetailHeader />
      <ItemDetail item={item} justPurchased={justPurchased} />
      <SiteFooter />
    </div>
  );
}
