// @samjonaidi-ship-it/universal-auth | test/perf/cold-start.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Cold-start measurement per spec §7.1 L732 — target ≤ 50 ms on mid-range
// mobile (Moto G Power CPU class, ~3× slowdown vs desktop).
//
// Method:
//   1. Read built ESM bundle (dist/esm/index.js) raw bytes
//   2. Spin up a fresh Node worker; measure parse + module-eval time
//   3. Apply a 3× multiplier to approximate Moto G Power throttle
//   4. Print result + comparison vs the 50 ms budget
//
// This is a coarse proxy — the canonical measurement happens in Lighthouse
// CI against the deployed demo (Day 22 CI step). This script gives a
// fast local signal that's reproducible without a browser.

import { performance } from 'node:perf_hooks';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distEntry = resolve(__dirname, '..', '..', 'dist', 'esm', 'index.js');
const distEntryUrl = pathToFileURL(distEntry).href;

const MOTO_G_POWER_THROTTLE = 3.0; // CPU multiplier vs typical dev machine
const BUDGET_MS = 50;
const SAMPLES = 20;

function runOnce(): number {
  // Force a fresh module load by appending a query string. Node's ESM
  // loader memoizes by URL, so this guarantees a real parse on every call.
  const t0 = performance.now();
  // Synchronous read — we want to isolate parse+eval, not I/O.
  // (I/O happens once before timing begins via require.cache priming below.)
  return performance.now() - t0;
}

async function measureColdStart(): Promise<{
  median: number;
  p95: number;
  bytes: number;
  throttled: number;
  passes: boolean;
}> {
  // Pre-read so disk I/O is hot before timing
  const bytes = statSync(distEntry).size;
  const code = readFileSync(distEntry, 'utf8');
  if (code.length === 0) {
    throw new Error('[perf] dist/esm/index.js is empty — run `pnpm build` first');
  }

  const samples: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    // Fresh dynamic import via cache-busting query param
    const t0 = performance.now();
    await import(`${distEntryUrl}?t=${Date.now()}_${i}`);
    samples.push(performance.now() - t0);
  }

  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] ?? 0;
  const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
  const throttled = median * MOTO_G_POWER_THROTTLE;
  return {
    median,
    p95,
    bytes,
    throttled,
    passes: throttled <= BUDGET_MS,
  };
}

async function main(): Promise<void> {
  console.log('[perf cold-start] measuring SDK module-init latency…');
  console.log(`  entry:    ${distEntry}`);
  console.log(`  samples:  ${SAMPLES}`);
  console.log(`  throttle: ${MOTO_G_POWER_THROTTLE}× (Moto G Power class)`);
  console.log(`  budget:   ≤ ${BUDGET_MS} ms (§7.1)`);
  console.log('');

  const result = await measureColdStart();
  const status = result.passes ? '✓ PASS' : '✗ FAIL';
  console.log(`  bundle:    ${result.bytes.toLocaleString()} bytes raw`);
  console.log(`  median:    ${result.median.toFixed(2)} ms (desktop)`);
  console.log(`  p95:       ${result.p95.toFixed(2)} ms (desktop)`);
  console.log(`  throttled: ${result.throttled.toFixed(2)} ms (Moto G Power equiv)`);
  console.log(`  ${status}: throttled median ${result.throttled.toFixed(2)} ms vs ${BUDGET_MS} ms budget`);

  if (!result.passes) {
    console.error('');
    console.error('[perf cold-start] FAILED budget. Investigate via:');
    console.error('  pnpm build && pnpm size-check');
    console.error('  Check for unintended deps via scripts/verify-no-jose.ts pattern');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[perf cold-start] crashed:', err);
  process.exit(2);
});
