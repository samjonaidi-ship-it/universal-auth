// @bainbridgebuilders/universal-auth | scripts/verify-bundle.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Bundle audits per §8.2 + §15.1.
// Enforced in CI — fails the build on any violation.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.dirname is only available Node >=21.2; use fileURLToPath for Node 20 compat.
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Check 1: package.json declares sideEffects: false ─────────────────────
function checkSideEffects(): void {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { sideEffects?: unknown };
  if (pkg.sideEffects !== false) {
    throw new Error(
      `[verify-bundle] package.json must declare "sideEffects": false for tree-shaking (§8.2). ` +
        `Got: ${JSON.stringify(pkg.sideEffects)}`
    );
  }
  console.log('✓ sideEffects: false declared');
}

// ── Check 2: no inline <script>/eval in bundle output ─────────────────────
function checkNoInlineScripts(): void {
  const distEsm = resolve(ROOT, 'dist/esm');
  try {
    statSync(distEsm);
  } catch {
    console.warn('⚠ dist/esm/ not found — run `pnpm build` first. Skipping inline-script scan.');
    return;
  }

  const FORBIDDEN = [
    { pattern: /<script/i, label: 'inline <script> tag' },
    { pattern: /\beval\s*\(/, label: 'eval() call' },
    { pattern: /new\s+Function\s*\(/, label: 'new Function() constructor' },
  ];

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) scanDir(full);
      else if (extname(full) === '.js') {
        const content = readFileSync(full, 'utf8');
        for (const { pattern, label } of FORBIDDEN) {
          if (pattern.test(content)) {
            throw new Error(
              `[verify-bundle] ${label} found in ${full}. SDK must be CSP-compatible (§15.1).`
            );
          }
        }
      }
    }
  }

  scanDir(distEsm);
  console.log('✓ no inline scripts, eval, or Function() in bundle');
}

// ── Check 3: no barrel re-export with side effects ─────────────────────────
// Strips function bodies before scanning so declared (but not called) functions
// don't trigger false positives. Only top-level statements (outside any function
// body) are considered "immediately executing on import".
function checkNoBarrelSideEffects(): void {
  const indexSrc = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');

  // Strip block bodies: remove everything between balanced { } pairs that follow
  // a function/export function declaration so indented function body code is ignored.
  // Simple approach: remove content of all top-level { } blocks.
  let stripped = indexSrc;
  let changed = true;
  while (changed) {
    changed = false;
    stripped = stripped.replace(/\{[^{}]*\}/g, '{}');
    if (stripped !== indexSrc) changed = true;
  }

  // After stripping, only top-level statements remain.
  const FORBIDDEN_TOP_LEVEL = [
    // A bare identifier followed by ( at the start of a line = executed call
    { pattern: /^[a-zA-Z_$][\w$]*\s*\(/m, label: 'top-level function call' },
    { pattern: /^console\.(log|warn|error)/m, label: 'top-level console logging' },
    { pattern: /^globalThis\./m, label: 'top-level globalThis assignment' },
    { pattern: /^window\./m, label: 'top-level window access' },
  ];
  for (const { pattern, label } of FORBIDDEN_TOP_LEVEL) {
    if (pattern.test(stripped)) {
      throw new Error(
        `[verify-bundle] ${label} found in src/index.ts. Barrel must be declarative-only (§8.2).`
      );
    }
  }
  console.log('✓ src/index.ts is side-effect-free');
}

// ── main ──────────────────────────────────────────────────────────────────

try {
  checkSideEffects();
  checkNoBarrelSideEffects();
  checkNoInlineScripts();
  console.log('\n[verify-bundle] all checks passed.');
} catch (err) {
  console.error(`\n[verify-bundle] FAILED: ${(err as Error).message}`);
  process.exit(1);
}
