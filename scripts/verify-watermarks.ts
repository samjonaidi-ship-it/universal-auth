// @bainbridgebuilders/universal-auth | scripts/verify-watermarks.ts | v1.0.2 | 2026-05-01 | BB
// Enforces BB watermark on every .ts/.tsx source file per global CLAUDE.md §10.
// Canonical format (v1.0.1+):
//   // @bainbridgebuilders/universal-auth | <path> | v<ver> | <YYYY-MM-DD> | BB
// CI fails if any source file is missing a watermark on line 1 (or line 2
// when line 1 is a Vitest pragma like `@vitest-environment happy-dom`), OR
// if any file still carries the legacy `@bb/universal-auth` form (Phase E2
// hardening 2026-05-01 — old form is forbidden so it cannot sneak back in).
//
// v1.0.2 (lookback fix C2): SCAN_DIRS widened from [src, scripts] to also
// include test/, demo/, and root vitest/playwright configs, closing the
// 30-file scope hole the original v1.0.1 sweep left open.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');

// Canonical watermark — first line must match exactly. Note the explicit
// scoped-package form `@bainbridgebuilders/universal-auth` (NOT `@bb/...`).
const WATERMARK_RX = /^\/\/ @bainbridgebuilders\/universal-auth \| .+ \| v\d+\.\d+\.\d+(-rc\.\d+)? \| \d{4}-\d{2}-\d{2} \| BB\s*$/;

// Forbidden legacy form — ensures the old `@bb/universal-auth` watermark
// can never sneak back in via copy-paste.
const LEGACY_WATERMARK_RX = /^\/\/ @bb\/universal-auth \|/;

const SCAN_DIRS = ['src', 'scripts', 'test', 'demo'];
// Root config files — flat list, not a dir scan, since each directory of the
// repo also contains node_modules etc.
const SCAN_ROOT_FILES = [
  'vitest.config.ts',
  'vitest.chaos.config.ts',
  'vitest.contract.config.ts',
  'vitest.integration.config.ts',
  'vitest.memory.config.ts',
  'vitest.security.config.ts',
  'playwright.config.ts',
];
const VALID_EXT = new Set(['.ts', '.tsx']);

// First-line pragmas that some test files require (Vitest env override).
// When present, the watermark is allowed on line 2.
const PRAGMA_RX = /^\/\/\s*@(vitest-environment|jest-environment|jsxRuntime)\b/;

// Allowlist — generated files / third-party interop that can't have a watermark
const ALLOWLIST = new Set<string>([]);

// Skip these directory names everywhere (they show up under demo/, test/, etc.)
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

function scanDir(dir: string, missing: string[], legacy: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      scanDir(full, missing, legacy);
      continue;
    }
    if (!VALID_EXT.has(extname(full))) continue;
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    if (ALLOWLIST.has(rel)) continue;

    checkFile(full, rel, missing, legacy);
  }
}

function checkFile(full: string, rel: string, missing: string[], legacy: string[]): void {
  const lines = readFileSync(full, 'utf8').split('\n');
  const firstLine = lines[0] ?? '';
  // v1.0.2 — allow watermark on line 2 when line 1 is a Vitest/Jest pragma.
  const targetLine = PRAGMA_RX.test(firstLine) ? (lines[1] ?? '') : firstLine;
  if (LEGACY_WATERMARK_RX.test(firstLine) || LEGACY_WATERMARK_RX.test(targetLine)) {
    legacy.push(`${rel} — line: ${targetLine.slice(0, 80)}${targetLine.length > 80 ? '…' : ''}`);
    return;
  }
  if (!WATERMARK_RX.test(targetLine)) {
    missing.push(`${rel} — line: ${targetLine.slice(0, 80)}${targetLine.length > 80 ? '…' : ''}`);
  }
}

const missing: string[] = [];
const legacy: string[] = [];
for (const dir of SCAN_DIRS) {
  scanDir(resolve(ROOT, dir), missing, legacy);
}
// Root-file targets (no recursion — repo root contains node_modules etc.)
for (const f of SCAN_ROOT_FILES) {
  const full = resolve(ROOT, f);
  try {
    if (!statSync(full).isFile()) continue;
  } catch {
    continue; // file not present in this checkout — skip
  }
  checkFile(full, f, missing, legacy);
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
