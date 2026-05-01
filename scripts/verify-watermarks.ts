// @bainbridgebuilders/universal-auth | scripts/verify-watermarks.ts | v1.0.1 | 2026-05-01 | BB
// Enforces BB watermark on every .ts/.tsx source file per global CLAUDE.md §10.
// Canonical format (v1.0.1+):
//   // @bainbridgebuilders/universal-auth | <path> | v<ver> | <YYYY-MM-DD> | BB
// CI fails if any source file is missing a watermark on line 1, OR if any
// file still carries the legacy `@bb/universal-auth` form (Phase E2 hardening
// 2026-05-01 — old form is forbidden so it cannot sneak back in).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');

// Canonical watermark — first line must match exactly. Note the explicit
// scoped-package form `@bainbridgebuilders/universal-auth` (NOT `@bb/...`).
const WATERMARK_RX = /^\/\/ @bainbridgebuilders\/universal-auth \| .+ \| v\d+\.\d+\.\d+(-rc\.\d+)? \| \d{4}-\d{2}-\d{2} \| BB\s*$/;

// Forbidden legacy form — ensures the old `@bb/universal-auth` watermark
// can never sneak back in via copy-paste.
const LEGACY_WATERMARK_RX = /^\/\/ @bb\/universal-auth \|/;

const SCAN_DIRS = ['src', 'scripts'];
const VALID_EXT = new Set(['.ts', '.tsx']);

// Allowlist — generated files / third-party interop that can't have a watermark
const ALLOWLIST = new Set<string>([]);

function scanDir(dir: string, missing: string[], legacy: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      scanDir(full, missing, legacy);
      continue;
    }
    if (!VALID_EXT.has(extname(full))) continue;
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    if (ALLOWLIST.has(rel)) continue;

    const firstLine = readFileSync(full, 'utf8').split('\n')[0] ?? '';
    if (LEGACY_WATERMARK_RX.test(firstLine)) {
      legacy.push(`${rel} — first line: ${firstLine.slice(0, 80)}${firstLine.length > 80 ? '…' : ''}`);
      continue;
    }
    if (!WATERMARK_RX.test(firstLine)) {
      missing.push(`${rel} — first line: ${firstLine.slice(0, 80)}${firstLine.length > 80 ? '…' : ''}`);
    }
  }
}

const missing: string[] = [];
const legacy: string[] = [];
for (const dir of SCAN_DIRS) {
  scanDir(resolve(ROOT, dir), missing, legacy);
}

let failed = false;

if (legacy.length) {
  failed = true;
  console.error(`[verify-watermarks] ${legacy.length} file(s) still carry the LEGACY @bb/universal-auth watermark (forbidden as of v1.0.1):\n`);
  for (const v of legacy) console.error('  ✗ ' + v);
  console.error(
    '\nReplace with the canonical form:\n' +
      '  // @bainbridgebuilders/universal-auth | <path> | v<ver> | <YYYY-MM-DD> | BB\n'
  );
}

if (missing.length) {
  failed = true;
  console.error(`[verify-watermarks] ${missing.length} file(s) missing BB watermark:\n`);
  for (const v of missing) console.error('  ✗ ' + v);
  console.error(
    '\nExpected format:\n' +
      '  // @bainbridgebuilders/universal-auth | <path> | v<ver> | <YYYY-MM-DD> | BB\n'
  );
}

if (failed) {
  process.exit(1);
}

console.log('[verify-watermarks] all source files carry the canonical BB watermark.');
