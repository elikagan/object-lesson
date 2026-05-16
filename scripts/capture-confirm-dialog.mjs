/**
 * One-shot Playwright script that opens the admin list, swipes a row,
 * triggers the custom confirm dialog, and saves a screenshot to
 * docs/evidence/p2-33-confirm-dialog.png so it can be used as PR evidence.
 *
 * Usage:
 *   npm run dev   # in another terminal, or have dev server already on :3000
 *   node scripts/capture-confirm-dialog.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PIN = process.env.ADMIN_PIN ?? 'Antiques2024';
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = resolve(process.cwd(), 'docs/evidence');
const OUT = resolve(OUT_DIR, 'p2-33-confirm-dialog.png');

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 414, height: 896 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/admin`);
await page.locator('input[type="password"]').fill(PIN);
await page.getByRole('button', { name: /Unlock/ }).click();
await page.waitForURL('**/admin/items');

const cookies = await ctx.cookies();
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

// Create a throwaway item.
const id = `_evidence_${Date.now()}`;
const apiCtx = await page.request;
await apiCtx.post(`${BASE}/api/admin/items`, {
  headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
  data: {
    id,
    title: 'Evidence probe',
    description: '',
    price: 1,
    size: '',
    category: 'misc',
    maker: '',
    condition: '',
    dealer_code: '',
    posted_by: 'evidence',
    is_new: false,
    is_hold: false,
    is_sold: false,
    hero_image: null,
    images: [],
    display_order: 99999,
  },
});

await page.goto(`${BASE}/admin/items`);
await page.waitForSelector(`.swipe-wrap[data-id="${id}"]`);

const row = page.locator(`.swipe-wrap[data-id="${id}"]`);
await row.locator('.swipe-delete').dispatchEvent('click');
await page.locator('.overlay').waitFor({ state: 'visible', timeout: 5000 });

await page.screenshot({ path: OUT, fullPage: false });
// eslint-disable-next-line no-console
console.log(`screenshot written: ${OUT}`);

// Cancel + clean up
await page.locator('.dialog-cancel').click();
await apiCtx.delete(`${BASE}/api/admin/items/${id}`, { headers: { Cookie: cookieHeader } });

await browser.close();
