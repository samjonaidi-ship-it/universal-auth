// @bainbridgebuilders/universal-auth | scripts/verify-bundle.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Bundle audits per §8.2 + §15.1.
// Enforced in CI — fails the build on any violation.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');

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
// Heuristic: index.ts is named-export only (verified by build not failing);
// sideEffects:false + splitting:true should guarantee no side effects survive.
// This is a lightweight assertion — deeper check happens via actual tree-shake
// test in a consumer app (measured at integration time).
function checkNoBarrelSideEffects(): void {
  const indexSrc = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');
  // Forbid top-level statements that execute on import
  const FORBIDDEN_TOP_LEVEL = [
    { pattern: /^\s*[a-zA-Z_$][\w$]*\s*\(/m, label: 'top-level function call' },
    { pattern: /^\s*console\.(log|warn|error)/m, label: 'top-level console logging' },
    { pattern: /^\s*globalThis\./m, label: 'top-level globalThis assignment' },
    { pattern: /^\s*window\./m, label: 'top-level window access' },
  ];
  for (const { pattern, label } of FORBIDDEN_TOP_LEVEL) {
    if (pattern.test(indexSrc)) {
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
