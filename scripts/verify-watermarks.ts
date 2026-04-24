// @bb/universal-auth | scripts/verify-watermarks.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Enforces BB watermark on every .ts/.tsx source file per global CLAUDE.md §10.
// Format: `// @bb/universal-auth | <path> | v<ver> | <YYYY-MM-DD> | BB`
// CI fails if any source file is missing a watermark on line 1.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');

// Watermark pattern — first line must match
const WATERMARK_RX = /^\/\/ @bb\/universal-auth \| .+ \| v\d+\.\d+\.\d+(-rc\.\d+)? \| \d{4}-\d{2}-\d{2} \| BB\s*$/;

const SCAN_DIRS = ['src', 'scripts'];
const VALID_EXT = new Set(['.ts', '.tsx']);

// Allowlist — generated files / third-party interop that can't have a watermark
const ALLOWLIST = new Set<string>([]);

function scanDir(dir: string, violations: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      scanDir(full, violations);
      continue;
    }
    if (!VALID_EXT.has(extname(full))) continue;
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    if (ALLOWLIST.has(rel)) continue;

    const firstLine = readFileSync(full, 'utf8').split('\n')[0] ?? '';
    if (!WATERMARK_RX.test(firstLine)) {
      violations.push(`${rel} — first line: ${firstLine.slice(0, 80)}${firstLine.length > 80 ? '…' : ''}`);
    }
  }
}

const violations: string[] = [];
for (const dir of SCAN_DIRS) {
  scanDir(resolve(ROOT, dir), violations);
}

if (violations.length) {
  console.error(`[verify-watermarks] ${violations.length} file(s) missing BB watermark:\n`);
  for (const v of violations) console.error('  ✗ ' + v);
  console.error(
    '\nExpected format:\n' +
      '  // @bb/universal-auth | <path> | v<ver> | <YYYY-MM-DD> | BB\n'
  );
  process.exit(1);
}

console.log('[verify-watermarks] all source files carry the BB watermark.');
