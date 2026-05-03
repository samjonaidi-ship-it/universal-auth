// @samjonaidi-ship-it/universal-auth | scripts/build.ts | v1.0.1 | 2026-05-01 | BB
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
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// import.meta.dirname is only available Node >=21.2; use fileURLToPath for Node 20 compat.
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
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
      'profile/index':        resolve(ROOT, 'src/profile/index.ts'),
      'extendability/index':  resolve(ROOT, 'src/extendability/index.ts'),
      // v1.0.1 (Phase C6): /internal subpath — low-level surfaces (e.g.,
      // setSession) that are NOT part of the stable public API.
      'internal/index':       resolve(ROOT, 'src/internal/index.ts'),
      // §8.2 Web Worker for crypto — bundled as its own entry so
      // crypto-client.ts can load it via `new Worker(new URL(...))`.
      //
      // CRITICAL: this entry name must produce `dist/esm/crypto-worker.js`
      // (flat, NOT `dist/esm/core/crypto-worker.js`). esbuild bundles
      // `crypto-client.ts` into a chunk at `dist/esm/chunk-XXX.js`, and
      // emits a Worker URL `./crypto-worker.js` relative to THAT chunk's
      // location — which resolves to `dist/esm/crypto-worker.js`.
      // If the worker is under `core/`, downstream Vite/Rollup builds
      // (e.g., the demo) fail with "Could not resolve entry module
      // ../dist/esm/crypto-worker.js" (look-back 2026-04-28 fix).
      'crypto-worker':        resolve(ROOT, 'src/core/crypto-worker.ts'),
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
    // Write metafile for CI size-check + verify-bundle inspection. Lives
    // OUTSIDE dist/ so it doesn't ship in the published tarball — the
    // metafile contains full build-machine paths (e.g.,
    // `node_modules/.pnpm/nanoid@5.1.9/...`) and all internal `src/*.ts`
    // filenames; minor info disclosure if shipped (look-back fix L10
    // 2026-04-28).
    if (result.metafile) {
      const META_DIR = resolve(ROOT, '.build-meta');
      return import('node:fs').then((fs) => {
        fs.mkdirSync(META_DIR, { recursive: true });
        fs.writeFileSync(
          resolve(META_DIR, 'esbuild-meta.json'),
          JSON.stringify(result.metafile, null, 2)
        );
      });
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

  console.log('[build] bundling ESM (8 entry points, splitting: true)');
  await bundleEsm();

  console.log('[build] emitting .d.ts via tsc');
  emitTypes();

  console.log('[build] copying styles.css to dist/');
  mkdirSync(resolve(OUT, 'esm/react/components'), { recursive: true });
  copyFileSync(
    resolve(ROOT, 'src/react/components/styles.css'),
    resolve(OUT, 'esm/react/components/styles.css')
  );

  console.log('[build] done. Run `pnpm size-check` to verify bundle budgets.');
}

await main();
