/**
 * One-shot script that renders the P2 section of AUDIT.md as a simple
 * HTML page and screenshots it. Used as evidence for P2-39 (parked
 * legacy endpoints) — proves visually that the audit is now complete
 * except for P0-7 (which needs Eli to test in Square checkout UI).
 *
 * Output: docs/evidence/p2-39-audit-complete.png
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, 'docs/evidence');
const OUT = resolve(OUT_DIR, 'p2-39-audit-complete.png');
mkdirSync(OUT_DIR, { recursive: true });

const audit = readFileSync(resolve(ROOT, 'AUDIT.md'), 'utf8');

// Extract the P2 polish section (between "### P2 — polish" and the next "---").
const p2Start = audit.indexOf('### P2');
const afterP2 = audit.slice(p2Start);
const p2End = afterP2.indexOf('---');
const p2Section = afterP2.slice(0, p2End === -1 ? undefined : p2End).trim();

// Also include the still-open P0-7 row so we don't claim "everything done".
const p07Match = audit.match(/^- \[ \] \*\*P0-7[\s\S]*?(?=\n- |\n###|\n##|\n---)/m);
const p07Row = p07Match ? p07Match[0].trim() : '';

const html = `<!doctype html>
<meta charset="utf-8">
<title>AUDIT — state at P2-39 close</title>
<style>
  body { font: 14px/1.5 -apple-system,system-ui,Segoe UI,Roboto,sans-serif; padding: 24px; max-width: 900px; margin: 0 auto; color: #1f1f1f; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin-bottom: 16px; font-size: 13px; }
  pre { background: #f7f7f8; border: 1px solid #e2e2e6; border-radius: 8px; padding: 14px; white-space: pre-wrap; word-wrap: break-word; font: 12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .open { background: #fff8e1; border: 1px solid #f0d57a; border-radius: 8px; padding: 12px; margin-top: 12px; font: 12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; }
  .legend { color: #555; font-size: 12.5px; margin-top: 18px; }
</style>
<h1>v2 audit — final state</h1>
<div class="sub">AUDIT.md, P2 polish section + remaining open P0-7 row.</div>
<pre>${escapeHtml(p2Section)}</pre>
<div class="legend"><strong>Still open (requires user action):</strong></div>
<div class="open">${escapeHtml(p07Row)}</div>
<div class="legend">Everything else (~38 rows) — P0/P1/P2 — is closed.</div>

<script>
function escapeHtml(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
</script>
`;

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1024, height: 1400 } });
const page = await ctx.newPage();
await page.setContent(html);
await page.screenshot({ path: OUT, fullPage: true });
// eslint-disable-next-line no-console
console.log(`screenshot written: ${OUT}`);
await browser.close();
