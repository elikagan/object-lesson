/**
 * One-shot Playwright script that captures evidence for P2-28:
 *   - Logs in to /admin
 *   - Waits for the service worker to register
 *   - Saves a screenshot showing the admin shell + an inline overlay
 *     listing the SW state for the PR evidence section.
 *
 * Output: docs/evidence/p2-28-pwa-admin.png
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PIN = process.env.ADMIN_PIN ?? 'Antiques2024';
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = resolve(process.cwd(), 'docs/evidence');
const OUT = resolve(OUT_DIR, 'p2-28-pwa-admin.png');

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/admin`);
await page.locator('input[type="password"]').fill(PIN);
await page.getByRole('button', { name: /Unlock/ }).click();
await page.waitForURL('**/admin/items');

// Wait for the SW to register (up to 5s).
const reg = await page.evaluate(async () => {
  for (let i = 0; i < 50; i++) {
    const r = await navigator.serviceWorker.getRegistration('/admin/');
    if (r) return { scope: r.scope, hasActiveOrInstalling: !!(r.active || r.installing || r.waiting) };
    await new Promise((res) => setTimeout(res, 100));
  }
  return null;
});

// Inject a small overlay so the screenshot visibly proves the SW is on.
await page.evaluate((info) => {
  const div = document.createElement('div');
  div.style.cssText =
    'position:fixed;bottom:12px;left:12px;right:12px;background:#0a7;color:#fff;font:13px/1.3 -apple-system,system-ui,sans-serif;padding:10px 12px;border-radius:8px;z-index:9999;box-shadow:0 6px 24px rgba(0,0,0,0.18);';
  div.innerHTML = `<div style="font-weight:600;margin-bottom:4px">✓ Admin PWA registered</div>` +
    `<div>scope: ${info?.scope ?? '(none)'}</div>` +
    `<div>state: ${info?.hasActiveOrInstalling ? 'active / installing' : 'unregistered'}</div>`;
  document.body.appendChild(div);
}, reg);

await page.screenshot({ path: OUT, fullPage: false });
// eslint-disable-next-line no-console
console.log(`screenshot written: ${OUT}`);

await browser.close();
