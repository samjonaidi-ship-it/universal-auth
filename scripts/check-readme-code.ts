// @samjonaidi-ship-it/universal-auth | scripts/check-readme-code.ts | v1.0.0 | 2026-05-06 | BB
// P0-2 — README quick-start regression gate.
//
// Validates that every `import { ... } from '@samjonaidi-ship-it/universal-auth(/...)'`
// statement in README.md refers to a real subpath whose barrel file actually
// exports each named symbol. Catches the regression where v1.1.0-rc.1 README
// imported `AuthProvider` / `useAuth` from the main barrel — they live at /react.
//
// Why not run `tsc` on the README's code? README snippets are illustrative
// (e.g. `<Routes />` is undefined) so the type-check would either need extensive
// scaffolding or it would flake on real-world omissions. Symbol-level validation
// against the actual barrels gives us 100% of the regression-protection value
// for a fraction of the maintenance cost.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const README = resolve(ROOT, 'README.md');

// Map subpath suffix → source-of-truth barrel file. Mirrors package.json `exports`.
const SUBPATH_MAP: Record<string, string | null> = {
  '': 'src/index.ts',
  '/react': 'src/react/index.ts',
  '/sw': 'src/sw/index.ts',
  '/profile': 'src/profile/index.ts',
  '/extendability': 'src/extendability/index.ts',
  '/internal': 'src/internal/index.ts',
  // Asset paths are valid imports (side-effect CSS); no symbol check.
  '/react/styles.css': null,
};

const PKG = '@samjonaidi-ship-it/universal-auth';

const readme = readFileSync(README, 'utf8');

// Match: import [type] { a, b as c, type d } from '@samjonaidi-ship-it/universal-auth[/sub]'
// or:    import '@samjonaidi-ship-it/universal-auth/foo'  (side-effect)
const importRe = /import\s+(?:type\s+)?(?:\{\s*([^}]+)\s*\}|['"]([^'"]*?)['"])\s+from\s+['"]@samjonaidi-ship-it\/universal-auth([^'"]*)['"]/g;
const sideEffectRe = /import\s+['"]@samjonaidi-ship-it\/universal-auth([^'"]+)['"]/g;

interface ParsedImport {
  symbols: string[]; // empty for side-effect
  subpath: string;
  raw: string;
}

const imports: ParsedImport[] = [];

for (const m of readme.matchAll(importRe)) {
  if (m[1]) {
    const symbols = m[1]
      .split(',')
      .map((s) => s.trim())
      // strip 'type ' prefix and 'as alias' rename — we want the source name
      .map((s) => s.replace(/^type\s+/, '').replace(/\s+as\s+\w+$/, ''))
      .filter((s) => s.length > 0);
    imports.push({ symbols, subpath: m[3] ?? '', raw: m[0] });
  }
}
for (const m of readme.matchAll(sideEffectRe)) {
  imports.push({ symbols: [], subpath: m[1] ?? '', raw: m[0] });
}

if (imports.length === 0) {
  console.log('[check-readme-code] no @samjonaidi-ship-it/universal-auth imports found in README.md — nothing to check.');
  process.exit(0);
}

const errors: string[] = [];

function readSource(absPath: string): string | null {
  // Try .ts first, then .tsx, then index.ts inside dir
  if (existsSync(absPath)) return readFileSync(absPath, 'utf8');
  if (existsSync(absPath + '.ts')) return readFileSync(absPath + '.ts', 'utf8');
  if (existsSync(absPath + '.tsx')) return readFileSync(absPath + '.tsx', 'utf8');
  if (existsSync(resolve(absPath, 'index.ts'))) return readFileSync(resolve(absPath, 'index.ts'), 'utf8');
  return null;
}

function exportsSymbol(barrelSrc: string, barrelDir: string, sym: string, depth = 0): boolean {
  if (depth > 4) return false; // recursion guard for deep re-export chains

  // 1. Direct named export: export function foo / export const foo / export class Foo / export interface Foo / export type Foo / export enum Foo
  const directRe = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var|class|interface|type|enum)\\s+${sym}\\b`);
  if (directRe.test(barrelSrc)) return true;

  // 2. Named re-export: export { foo, foo as bar, type foo } from './x.js'  OR  export { foo };
  const namedExportRe = new RegExp(`export\\s*(?:type\\s+)?\\{([^}]+)\\}`, 'g');
  for (const m of barrelSrc.matchAll(namedExportRe)) {
    const inner = (m[1] ?? '');
    // Each item: optional 'type ', optional 'name as alias' — match the EXPORTED name
    // Patterns we accept: `${sym}`, `${sym} as Y`, `X as ${sym}`, `type ${sym}`
    const items = inner.split(',').map((s) => s.trim());
    for (const item of items) {
      // Strip 'type ' prefix
      const stripped = item.replace(/^type\s+/, '');
      if (stripped === sym) return true;
      // 'X as sym' — exported under sym
      const asMatch = stripped.match(/^\w+\s+as\s+(\w+)$/);
      if (asMatch && asMatch[1] === sym) return true;
      // 'sym as Y' — exported under Y, not sym (don't match)
    }
  }

  // 3. Wildcard re-export: export * from './x.js'  OR  export type * from './x.js'
  const wildcardRe = /export\s+(?:type\s+)?\*\s+from\s+['"]([^'"]+)['"]/g;
  for (const m of barrelSrc.matchAll(wildcardRe)) {
    const target = (m[1] ?? '').replace(/\.js$/, '');
    if (!target.startsWith('.')) continue; // external — can't follow
    const absTarget = resolve(barrelDir, target);
    const sub = readSource(absTarget);
    if (sub === null) continue;
    const subDir = existsSync(absTarget + '.ts') ? dirname(absTarget + '.ts')
                  : existsSync(resolve(absTarget, 'index.ts')) ? absTarget
                  : barrelDir;
    if (exportsSymbol(sub, subDir, sym, depth + 1)) return true;
  }

  return false;
}

let checkedSymbols = 0;

for (const imp of imports) {
  const barrelRel = SUBPATH_MAP[imp.subpath];
  if (barrelRel === undefined) {
    errors.push(`README imports from unknown subpath '${imp.subpath}'. Expected one of: ${Object.keys(SUBPATH_MAP).map((s) => `'${s || '(root)'}'`).join(', ')}`);
    continue;
  }
  if (barrelRel === null) continue; // side-effect import (e.g. styles.css) — no symbol check

  const barrelAbs = resolve(ROOT, barrelRel);
  const barrelSrc = readSource(barrelAbs);
  if (barrelSrc === null) {
    errors.push(`Barrel file does not exist: ${barrelRel} (referenced by README import from '${PKG}${imp.subpath}')`);
    continue;
  }

  for (const sym of imp.symbols) {
    checkedSymbols++;
    if (!exportsSymbol(barrelSrc, dirname(barrelAbs), sym)) {
      errors.push(`Symbol '${sym}' not exported from '${PKG}${imp.subpath}' (barrel ${barrelRel})`);
    }
  }
}

if (errors.length === 0) {
  console.log(`[check-readme-code] verified ${imports.length} import statement${imports.length === 1 ? '' : 's'} (${checkedSymbols} symbol${checkedSymbols === 1 ? '' : 's'}) in README.md ✓`);
  process.exit(0);
}

console.error(`[check-readme-code] README.md has ${errors.length} broken import claim${errors.length === 1 ? '' : 's'}:`);
for (const e of errors) console.error(`  - ${e}`);
process.exit(1);
