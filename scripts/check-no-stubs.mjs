#!/usr/bin/env node
/**
 * scripts/check-no-stubs.mjs
 *
 * Fails the build if forbidden "stub" / "coming soon" patterns appear in
 * shipped code. Wired into .husky/pre-commit and the CI workflow.
 *
 * Why: during the v1 → v2 migration, an `onClick={() => alert('AI processing
 * — coming in next update.')}` shipped to production. The user clicked it.
 * That cannot happen again. This script catches that class of bug at commit
 * time.
 *
 * Scopes: app/, components/, lib/. Does NOT scan tests, scripts, docs, or
 * config — those legitimately mention these strings (this file does too).
 *
 * To bypass for a legitimate reason: don't. Build the feature. If you must
 * remove the script (e.g., a one-time test), revert immediately after.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Each entry: [regex, human-readable description]. */
const FORBIDDEN = [
  [/alert\(\s*['"`][^'"`]*coming\s+(in\s+)?(the\s+)?(next|future|soon)/i, "alert(\"...coming soon/in next update...\")"],
  [/alert\(\s*['"`][^'"`]*not\s+(yet\s+)?(built|implemented|available)/i, "alert(\"...not built/implemented...\")"],
  [/alert\(\s*['"`][^'"`]*placeholder/i, "alert(\"...placeholder...\")"],
  [/['"`]coming\s+soon['"`]/i, '"coming soon" string literal'],
  [/['"`]not\s+yet\s+built['"`]/i, '"not yet built" string literal'],
  [/['"`]coming\s+in\s+(the\s+)?next\s+update['"`]/i, '"coming in next update" string literal'],
  [/\/\/\s*TODO[^\n]*\b(later|follow.?up|port|future\s+session)\b/i, "// TODO ... later/follow-up/port/future session"],
  [/\/\*[\s\S]*?TODO[^*]*\b(later|follow.?up|port)\b[\s\S]*?\*\//i, "/* TODO ... later/follow-up/port */"],
];

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name === 'dist' || e.name.startsWith('.')) continue;
      yield* walk(full);
    } else if (e.isFile() && EXTS.has(extname(e.name))) {
      yield full;
    }
  }
}

const violations = [];

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  for (const file of walk(abs)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [re, desc] of FORBIDDEN) {
        if (re.test(line)) {
          violations.push({
            file: file.replace(ROOT + '/', ''),
            lineNo: i + 1,
            line: line.trim().slice(0, 140),
            desc,
          });
        }
      }
    }
  }
}

if (violations.length === 0) {
  // Quiet on success — pre-commit hooks should be silent when green.
  process.exit(0);
}

console.error('');
console.error('  ✗ check-no-stubs FAILED — stub/placeholder patterns in shipped code');
console.error('');
for (const v of violations) {
  console.error(`    ${v.file}:${v.lineNo}`);
  console.error(`      pattern: ${v.desc}`);
  console.error(`      > ${v.line}`);
  console.error('');
}
console.error(`  Total violations: ${violations.length}`);
console.error('');
console.error('  Either build the feature or remove the stub UI.');
console.error('  Do not ship "coming soon" buttons.');
console.error('');
process.exit(1);
