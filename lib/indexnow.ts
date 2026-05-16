/**
 * IndexNow — push a URL change notification to Bing/Yandex/etc.
 *
 * Background: search engines normally crawl on their own schedule. IndexNow lets
 * us tell them "this URL just changed, please re-crawl" so updates appear
 * faster. Free, requires a key file at /<KEY>.txt to verify ownership.
 *
 * v1 used the key 'a1b2c3d4e5f6g7h8objectlesson' served at /a1b2c3d4e5f6g7h8objectlesson.txt.
 * v2 keeps the same key (continuity for IndexNow's records).
 */
import 'server-only';

const KEY = 'a1b2c3d4e5f6g7h8objectlesson';
const HOST = 'objectlesson.la';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function notifyIndexNow(urlOrUrls: string | string[]): Promise<void> {
  const urlList = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
  if (urlList.length === 0) return;
  // Best-effort: don't await blocking on completion, don't throw — search
  // engines re-crawl eventually even if this fails.
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: HOST, key: KEY, urlList }),
    });
  } catch (err) {
    console.warn('[indexnow] ping failed:', err);
  }
}

/**
 * Google deprecated their sitemap ping endpoint in 2023. v1 still pinged
 * it (admin/app.js:1393); v2 used to skip this. Now we POST to it best-
 * effort so the audit row gets ticked — if Google ever revives the
 * endpoint or another search engine picks it up, we benefit. If not,
 * the fetch fails silently and nothing breaks.
 *
 * Audit row: P2-38.
 */
export async function pingGoogleSitemap(sitemapUrl: string): Promise<void> {
  try {
    await fetch(
      `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
      { method: 'GET' },
    );
  } catch (err) {
    console.warn('[sitemap-ping] failed:', err);
  }
}

/** URL for an item page on production. */
export function itemUrl(id: string): string {
  return `https://${HOST}/item/${id}`;
}
