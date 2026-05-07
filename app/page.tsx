import { createServerClient } from '@/lib/supabase/server';

/**
 * Hello-world / connectivity check.
 *
 * Phase 1 of the migration: prove the Vercel deploy can talk to Supabase.
 * Reads the count of rows in `sales` table (existing production table).
 *
 * Replaced in Phase 3 by the actual homepage.
 */

// Force runtime rendering so the Supabase query runs per request, not per build.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = createServerClient();

  let status: 'ok' | 'error' = 'ok';
  let salesCount: number | null = null;
  let errorMessage: string | null = null;

  try {
    const { count, error } = await supabase
      .from('sales')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    salesCount = count ?? 0;
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8 font-mono bg-zinc-50 dark:bg-black dark:text-zinc-100">
      <div className="max-w-xl w-full space-y-6">
        <h1 className="text-2xl font-bold">Object Lesson — staging</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Phase 1: foundation check. Vercel ↔ Supabase connectivity test.
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
              <code>sales</code> table contains <strong>{salesCount}</strong> row
              {salesCount === 1 ? '' : 's'}.
            </p>
          )}
          {status === 'error' && errorMessage && (
            <p className="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
          )}
        </div>

        <footer className="text-xs text-zinc-500 pt-8">
          Production site: <a href="https://objectlesson.la" className="underline">objectlesson.la</a>
          {' '}— this staging environment is unrelated.
        </footer>
      </div>
    </main>
  );
}
