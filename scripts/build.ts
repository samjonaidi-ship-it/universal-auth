// @bb/universal-auth | scripts/build.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// esbuild build pipeline — 3-chunk split per §12.1: core / passkey / sw.
//
// Outputs:
//   dist/esm/index.js          — core entry (budget 40 KB gzip)
//   dist/esm/react/index.js    — React subpath (bundled with core for now; may split later)
//   dist/esm/flows/passkey-flow.js  — lazy passkey chunk (budget 10 KB gzip)
//   dist/esm/sw/index.js       — lazy SW chunk (budget 5 KB gzip)
//   dist/types/**              — TypeScript declarations via tsc
//
// Bundle targets: modern browsers (Chrome 120+, Safari 17+, Firefox 120+, Edge 120+, Node 20+).

import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const OUT  = resolve(ROOT, 'dist');

function clean(): void {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
}

async function bundleEsm(): Promise<void> {
  // 3 entry points = 3 chunks (split per §12.1)
  await build({
    entryPoints: {
      'index':                resolve(ROOT, 'src/index.ts'),
      'react/index':          resolve(ROOT, 'src/react/index.ts'),
      'flows/passkey-flow':   resolve(ROOT, 'src/flows/passkey-flow.ts'),
      'sw/index':             resolve(ROOT, 'src/sw/index.ts'),
      // §8.2 Web Worker for crypto — bundled as its own entry so
      // crypto-client.ts can load it via `new Worker(new URL(...))`.
      'core/crypto-worker':   resolve(ROOT, 'src/core/crypto-worker.ts'),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022', 'chrome120', 'safari17', 'firefox120', 'edge120'],
    outdir: resolve(OUT, 'esm'),
    splitting: true,
    sourcemap: true,
    minify: true,
    treeShaking: true,
    external: [
      // Peer deps — never bundle React
      'react',
      'react-dom',
      'react/jsx-runtime',
    ],
    // Workers must be inlined separately in future; Day 1 target only
    legalComments: 'inline',
    metafile: true,
  }).then((result) => {
    // Write metafile for CI size-check + verify-bundle inspection
    if (result.metafile) {
      const metaPath = resolve(OUT, 'meta.json');
      return import('node:fs').then((fs) => fs.writeFileSync(metaPath, JSON.stringify(result.metafile, null, 2)));
    }
    return undefined;
  });
}

function emitTypes(): void {
  // tsc emits .d.ts + .d.ts.map
  execSync('tsc --emitDeclarationOnly --outDir dist/types', {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

async function main(): Promise<void> {
  console.log('[build] cleaning dist/');
  clean();

  console.log('[build] bundling ESM (5 entry points, splitting: true)');
  await bundleEsm();

  console.log('[build] emitting .d.ts via tsc');
  emitTypes();

  console.log('[build] done. Run `pnpm size-check` to verify bundle budgets.');
}

await main();
