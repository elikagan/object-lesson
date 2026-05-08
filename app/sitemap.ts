import type { MetadataRoute } from 'next';
import { createServerClient } from '@/lib/supabase/server';

/**
 * /sitemap.xml — generated server-side at request time from the items table.
 * Includes the homepage, about, gift cert, and one URL per non-sold item.
 */
const SITE_URL = 'https://objectlesson.la';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('items')
    .select('id, updated_at')
    .eq('is_sold', false);

  const items = (data ?? []).map((row: { id: string; updated_at: string }) => ({
    url: `${SITE_URL}/item/${row.id}`,
    lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/gift`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    ...items,
  ];
}
