import { createServerClient } from '@/lib/supabase/server';

/**
 * Phase 2 staging check: confirms data layer works end-to-end.
 *
 * Reads from the new `items` table + renders a sample item with its image
 * served from Supabase Storage. If you see an item with a photo, the entire
 * data layer (schema + items migration + image upload + public storage URL)
 * is wired correctly.
 *
 * Replaced in Phase 3 by the actual homepage with the full grid.
 */

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function imageUrl(path: string | null) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

export default async function Home() {
  const supabase = createServerClient();

  let status: 'ok' | 'error' = 'ok';
  let itemCount: number | null = null;
  let sampleItem: { id: string; title: string; price: number; hero_image: string | null } | null = null;
  let errorMessage: string | null = null;

  try {
    const { count, error: countError } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true });
    if (countError) throw countError;
    itemCount = count ?? 0;

    const { data, error: itemError } = await supabase
      .from('items')
      .select('id, title, price, hero_image')
      .eq('is_sold', false)
      .order('display_order', { ascending: true })
      .limit(1);
    if (itemError) throw itemError;
    sampleItem = data?.[0] ?? null;
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="min-h-screen p-8 font-mono bg-zinc-50 dark:bg-black dark:text-zinc-100">
      <div className="max-w-xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Object Lesson — staging</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Phase 2: data layer wired. Items + images served from Supabase.
        </p>

        <div className="border border-zinc-300 dark:border-zinc-700 rounded p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full ${status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}
              aria-hidden
            />
            <span className="font-semibold">
              Supabase connection: {status === 'ok' ? 'OK' : 'ERROR'}
            </span>
          </div>
          {status === 'ok' && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              <code>items</code> table contains <strong>{itemCount}</strong> row
              {itemCount === 1 ? '' : 's'}.
            </p>
          )}
          {status === 'error' && errorMessage && (
            <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
          )}
        </div>

        {sampleItem && (
          <div className="border border-zinc-300 dark:border-zinc-700 rounded p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Sample item from items table</p>
            <p className="font-semibold">{sampleItem.title} — ${Number(sampleItem.price).toLocaleString()}</p>
            <p className="text-xs text-zinc-500">id: {sampleItem.id}</p>
            {sampleItem.hero_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl(sampleItem.hero_image) ?? ''}
                alt={sampleItem.title}
                className="w-full max-w-sm rounded"
              />
            )}
          </div>
        )}

        <footer className="text-xs text-zinc-500 pt-8">
          Production site: <a href="https://objectlesson.la" className="underline">objectlesson.la</a>
          {' '}— this staging environment is unrelated.
        </footer>
      </div>
    </main>
  );
}
