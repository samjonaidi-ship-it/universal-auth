// @bainbridgebuilders/universal-auth | test/browser/06-memory-soak.spec.ts | v1.0.2 | 2026-05-02 | BB
// Real-browser memory soak per spec §11.7 L1139.
//
// Why: the vitest harness uses fake-indexeddb which retains ~3 KB per IDB
// op (bisect-traced 2026-05-02; see CHANGELOG v1.0.2). That retention is
// the test polyfill, not the SDK. This spec runs the same sign-in/sign-out
// loop against real Chromium IndexedDB and gates on
// performance.memory.usedJSHeapSize.
//
// Stack: Playwright webServer serves the repo root via `pnpm exec http-server`,
// the harness fetch-stubs all SDK network calls, and exercises setSession +
// getAccessToken + signOut which is the same hot path as the vitest soak.
//
// Pass criteria:
//   * Cycles complete without timeout
//   * Heap delta < 4 MB after CYCLES iterations (real-browser GC keeps
//     IDB-backed allocations bounded, unlike fake-indexeddb)
//
// Local run:
//   pnpm build
//   pnpm exec playwright test test/browser/06-memory-soak.spec.ts \
//     --project=desktop-chrome

import { test, expect } from '@playwright/test';

const CYCLES = Number(process.env.BB_BROWSER_SOAK_CYCLES) || 5_000;
const HEAP_BUDGET_BYTES = 1_048_576; // 1 MB baseline; assertion at 4× slop

test.describe('Memory soak — real-browser (§11.7)', () => {
  // Soak takes ~10ms per cycle in headless Chromium; 100k cycles ≈ 17 min.
  // Allocate 5× the expected runtime so heap-warm-up + GC pauses don't flake.
  test.setTimeout(Math.max(120_000, CYCLES * 50));

  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'performance.memory + CDP HeapProfiler are Chromium-only'
  );

  test(
    `holds heap < ${HEAP_BUDGET_BYTES * 4} B over ${CYCLES} sign-in/sign-out cycles`,
    async ({ page, baseURL }) => {
      const harnessUrl = `${baseURL ?? 'http://localhost:5174'}/test/browser/fixtures/memory-soak-harness.html`;
      await page.goto(harnessUrl);

      // Wait for the harness to finish initUniversalAuth + bind window.__bbSoak.
      await expect(page.locator('#status')).toHaveText('ready', { timeout: 30_000 });

      // Force a GC before measurement so baseline is meaningful.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('HeapProfiler.collectGarbage');

      const result = await page.evaluate(async (cycles) => {
        return await window.__bbSoak.run(cycles);
      }, CYCLES);

      // Force another GC so `final` reflects post-collection state.
      await cdp.send('HeapProfiler.collectGarbage');

      console.log(
        `[browser soak] cycles=${result.cycles}, baseline=${result.baseline} B, ` +
          `final=${result.final} B, delta=${result.delta} B (budget=${HEAP_BUDGET_BYTES * 4} B)`
      );

      expect(result.cycles).toBe(CYCLES);
      expect(result.baseline).toBeGreaterThan(0); // performance.memory is exposed
      // Allow 4× slop — V8 hidden classes + inline caches can grow under
      // sustained allocation. Real leaks register at 10×+.
      expect(result.delta).toBeLessThan(HEAP_BUDGET_BYTES * 4);
    }
  );
});

declare global {
  interface Window {
    __bbSoak: {
      run: (cycles: number) => Promise<{
        cycles: number;
        baseline: number;
        final: number;
        delta: number;
      }>;
    };
  }
  interface Performance {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  }
}
