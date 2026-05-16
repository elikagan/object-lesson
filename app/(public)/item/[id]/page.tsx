import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getItemById } from '@/lib/queries';
import { absoluteImgUrl } from '@/lib/items';
import { DetailHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { ItemDetail } from '@/components/ItemDetail';
import type { Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://objectlesson.la';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) return { title: 'Not found' };
  const ogImg = absoluteImgUrl(item.hero_image) || undefined;
  const description =
    item.description?.slice(0, 200) || `${item.title} — Object Lesson, Pasadena.`;
  const canonical = `${SITE_URL}/item/${id}`;
  return {
    title: item.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: item.title,
      description,
      url: canonical,
      type: 'website',
      images: ogImg ? [{ url: ogImg, width: 1200, height: 1200 }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: item.title,
      description,
      images: ogImg ? [ogImg] : undefined,
    },
  };
}

/**
 * Build a schema.org Product JSON-LD payload — Google uses this for rich
 * results in search (price + availability under product cards).
 */
function buildProductLd(item: Item) {
  const url = `${SITE_URL}/item/${item.id}`;
  const image = absoluteImgUrl(item.hero_image);
  const availability = item.is_sold
    ? 'https://schema.org/SoldOut'
    : item.is_hold
      ? 'https://schema.org/PreOrder'
      : 'https://schema.org/InStock';
  return {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: item.title,
    description: item.description || undefined,
    image: image || undefined,
    url,
    sku: item.id,
    brand: item.maker
      ? { '@type': 'Brand', name: item.maker }
      : { '@type': 'Brand', name: 'Object Lesson' },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      price: Number(item.price ?? 0),
      availability,
      itemCondition:
        item.condition === 'New'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
      seller: { '@type': 'Organization', name: 'Object Lesson' },
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
  const productLd = buildProductLd(item);

  return (
    <div id="view-detail">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <DetailHeader />
      <ItemDetail item={item} justPurchased={justPurchased} />
      <SiteFooter />
    </div>
  );
}
