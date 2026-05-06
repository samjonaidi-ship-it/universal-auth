// @samjonaidi-ship-it/universal-auth | scripts/size-check-closure.ts | v1.0.0 | 2026-05-06 | BB
// P0-4 — closure-aware bundle budget enforcement.
//
// `size-limit` (the existing CI gate at `pnpm size-check`) measures the
// gzipped byte size of each entry-point STUB ONLY. esbuild ships our entries
// with `splitting: true`, so most code lives in shared `chunk-*.js` files
// imported by the entry. The size-limit numbers therefore underreport the
// actual deployed byte cost — by 3-5× for the React subpath, where
// libphonenumber-js metadata sits in a shared chunk.
//
// This script reads the esbuild metafile written by `scripts/build.ts`
// (`.build-meta/esbuild-meta.json`), walks the transitive import graph from
// each declared entry, gzips each reachable chunk's source, and asserts the
// closure total against the budget. Run AFTER `pnpm build`.
//
// CI flow: `pnpm size-check` runs `size-limit` (entry-stub fast feedback)
// then this script (closure ground-truth). Fail the build if either gate
// fails.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const METAFILE = resolve(ROOT, '.build-meta/esbuild-meta.json');

interface MetafileImport {
  path: string;
  kind: string;
  external?: boolean;
}
interface MetafileOutput {
  bytes: number;
  imports?: MetafileImport[];
  exports?: string[];
  inputs?: Record<string, unknown>;
  entryPoint?: string;
}
interface Metafile {
  inputs?: Record<string, unknown>;
  outputs: Record<string, MetafileOutput>;
}

interface Budget {
  /** Path of the entry stub (relative to repo root) — must match a key in metafile.outputs. */
  entry: string;
  /** Maximum gzipped closure size in bytes. */
  limit: number;
  /** Friendly label printed in output. */
  label: string;
  /**
   * If true, the closure is measured as MARGINAL cost over the core entry —
   * chunks already in the core closure are subtracted because they are
   * already loaded before this lazy chunk fetches. Used for `passkey-flow`
   * which is dynamic-imported only after sign-in completes (core already in
   * the cache).
   */
  lazyAfterCore?: boolean;
}

// Mirrors `package.json:size-limit` paths but adds closure semantics.
// React budget intentionally raised to absorb libphonenumber until P1-F lazy-loads it.
const BUDGETS: Budget[] = [
  { label: 'core', entry: 'dist/esm/index.js', limit: 40 * 1024 },
  { label: 'react', entry: 'dist/esm/react/index.js', limit: 70 * 1024 },
  { label: 'profile', entry: 'dist/esm/profile/index.js', limit: 50 * 1024 },
  { label: 'passkey-flow (lazy, marginal)', entry: 'dist/esm/flows/passkey-flow.js', limit: 12 * 1024, lazyAfterCore: true },
  { label: 'sw', entry: 'dist/esm/sw/index.js', limit: 5 * 1024 },
];

const CORE_ENTRY = 'dist/esm/index.js';

if (!existsSync(METAFILE)) {
  console.error(`[size-check-closure] metafile missing: ${METAFILE}`);
  console.error('  Run `pnpm build` first — esbuild emits the metafile during bundling.');
  process.exit(1);
}

const meta = JSON.parse(readFileSync(METAFILE, 'utf8')) as Metafile;
const outputs = meta.outputs ?? {};

/**
 * Walk the EAGER import graph from `entry`, returning the set of all
 * statically-imported reachable output files. Excludes:
 *   - `.map` outputs (sourcemaps don't ship to clients)
 *   - External imports (peer deps like `react`)
 *   - Dynamic imports (`await import(...)`) — those are lazy chunks that
 *     load on demand, not part of the entry's initial download. Lazy
 *     chunks should have their own budget entry if we care.
 *
 * P1-F (2026-05-06): switched from including dynamic-import edges to
 * eager-only. Without this fix, lazy-loading libphonenumber-js inside
 * validatePhone() didn't reduce the React closure measurement — the
 * walker still followed the dynamic-import edge into the metadata chunk.
 */
function reachableOutputs(entry: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    if (cur.endsWith('.map')) continue;
    visited.add(cur);

    const out = outputs[cur];
    if (!out) continue; // unresolved (external or filtered)
    for (const imp of out.imports ?? []) {
      if (imp.external) continue;
      // EAGER imports only. dynamic-import edges represent code that loads
      // on demand and shouldn't count against the entry's initial-download
      // budget. (Add a separate budget entry for the lazy chunk if needed.)
      if (imp.kind !== 'import-statement') continue;
      queue.push(imp.path);
    }
  }
  return visited;
}

function gzipFileSize(relPath: string): number {
  const abs = resolve(ROOT, relPath);
  if (!existsSync(abs)) return 0;
  const raw = readFileSync(abs);
  return gzipSync(raw).length;
}

let failures = 0;
const rows: Array<{ label: string; entry: string; gzip: number; limit: number; closure: string[] }> = [];

// Pre-compute core closure for `lazyAfterCore` budgets.
const coreClosure = outputs[CORE_ENTRY] ? reachableOutputs(CORE_ENTRY) : new Set<string>();

for (const b of BUDGETS) {
  if (!outputs[b.entry]) {
    console.error(`[size-check-closure] entry not found in metafile: ${b.entry}`);
    failures++;
    continue;
  }
  const reach = reachableOutputs(b.entry);
  // For lazy-after-core budgets, exclude chunks already in core's closure —
  // they're already cached when this lazy chunk loads.
  const marginal = b.lazyAfterCore
    ? new Set([...reach].filter((p) => !coreClosure.has(p)))
    : reach;
  let total = 0;
  for (const r of marginal) total += gzipFileSize(r);
  rows.push({
    label: b.label,
    entry: b.entry,
    gzip: total,
    limit: b.limit,
    closure: [...marginal].sort(),
  });
  if (total > b.limit) failures++;
}

const fmtKB = (n: number): string => `${(n / 1024).toFixed(2)} KB`;

console.log('');
console.log('Closure-aware bundle sizes (gzipped, transitive):');
console.log('  Status  Label                Closure     Budget      Δ');
console.log('  ------  -------------------  ----------  ----------  ----------');
for (const r of rows) {
  const status = r.gzip <= r.limit ? '  ✓   ' : '  ✗   ';
  const delta = r.gzip - r.limit;
  const deltaStr = delta > 0 ? `+${fmtKB(delta)}` : fmtKB(delta);
  console.log(`  ${status} ${r.label.padEnd(20)} ${fmtKB(r.gzip).padEnd(10)} ${fmtKB(r.limit).padEnd(10)} ${deltaStr}`);
}
console.log('');

if (process.env.SIZE_CHECK_VERBOSE === '1') {
  console.log('Closure detail:');
  for (const r of rows) {
    console.log(`  ${r.label} (${r.closure.length} files):`);
    for (const f of r.closure) console.log(`    ${fmtKB(gzipFileSize(f)).padStart(10)}  ${f}`);
  }
  console.log('');
}

if (failures > 0) {
  console.error(`[size-check-closure] ${failures} budget violation${failures === 1 ? '' : 's'}.`);
  console.error('  Set SIZE_CHECK_VERBOSE=1 to see which chunks contribute the most.');
  process.exit(1);
}
console.log('[size-check-closure] all budgets pass ✓');
process.exit(0);
