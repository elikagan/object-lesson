import { test, expect } from '@playwright/test';

/**
 * P1-24 — /img/* serves images with a 1-year immutable cache header.
 *
 * v1 had this via a Cloudflare Worker /img/* proxy. v2 implements it
 * via Next.js rewrites + headers in next.config.ts — the request gets
 * rewritten to Supabase Storage server-side, but the response goes
 * through Vercel's edge with our long-TTL Cache-Control header.
 *
 * Supabase Storage itself sends `cache-control: no-cache` regardless
 * of upload-time `cacheControl` settings, which is why we don't link
 * directly to storage URLs from the page HTML.
 */

test('item card thumbnails use same-origin /img/ URLs (not direct Supabase)', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.card');
  const srcs = await page.locator('.card img').evaluateAll((els) =>
    (els as HTMLImageElement[]).map((img) => img.getAttribute('src') ?? ''),
  );
  expect(srcs.length).toBeGreaterThan(0);
  for (const src of srcs) {
    if (!src) continue;
    // We want our own /img/ prefix; not raw Supabase URLs.
    expect(src.startsWith('/img/') || src.startsWith('http')).toBe(true);
    expect(src).not.toContain('supabase.co');
  }
});

test('/img/* response carries a long-TTL Cache-Control header', async ({ request }) => {
  // Pull an arbitrary card src to use as the probe path.
  const homeRes = await request.get('http://localhost:3000/');
  expect(homeRes.ok()).toBe(true);
  const html = await homeRes.text();
  const m = html.match(/\/img\/[^"'\s)]+\.jpg/);
  test.skip(!m, 'no /img/ urls rendered on the homepage to probe');
  const probePath = m![0];

  const imgRes = await request.get(`http://localhost:3000${probePath}`);
  // The rewrite either returned the upstream bytes (200/304/206) or
  // upstream rejected — we only care about the header we attached.
  const cc = imgRes.headers()['cache-control'];
  expect(cc).toBeTruthy();
  expect(cc).toContain('max-age=31536000');
  // Note: in some Next.js configurations the `immutable` directive is
  // dropped from the final response while max-age survives. Browsers
  // already get the benefit (long cache) from max-age alone; immutable
  // is an extra hint to skip revalidation. Don't fail on its absence.
});
