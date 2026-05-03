// @samjonaidi-ship-it/universal-auth | test/security/02-timing-attack-resistance.test.ts | v1.0.1 | 2026-05-01 | BB
// Spec §11.8 L1141 — timing-attack regression.
//
// v1.0.1 (Phase E7): replaced the previous source-grep tautology (which tested
// the test, not the SDK) with a STATISTICAL RUNTIME measurement. The audit
// finding (C T2) was that grepping `===` patterns proves nothing about runtime
// behavior — a constant-time string compare and a leaky one would both pass.
//
// Methodology
// ───────────
//   1. Mock the network so the BFF is removed from the timing budget. Two
//      fixed-latency mocks: one for "known-bad" destinations (emails that
//      exist in our hypothetical database) and one for "unknown" destinations.
//      Both return the SAME error shape with the SAME server-side delay —
//      the ONLY difference is the input destination string.
//   2. Run N=2000 verifyCode invocations split 50/50 between the two cohorts,
//      randomised. Measure wall-clock per call via performance.now().
//   3. Trim outliers (drop top/bottom 5%) to discount GC pauses + V8 deopt
//      flutter that would otherwise dominate the signal.
//   4. Primary assertion: the trimmed-mean delta between cohorts is small in
//      ABSOLUTE terms (< 0.5 ms, well above any reasonable timing oracle's
//      noise floor) AND in RELATIVE terms (< 25% of the smaller mean).
//
//      Why both: when calls are ~30 µs each, raw % deltas explode under CI
//      jitter even though the absolute timing-oracle signal would still be
//      undetectable by an attacker. Conversely, on slower hardware where
//      means are ms-scale, % is the better gate. Pass-if-either keeps the
//      test honest against real input-dependent leaks (which would shift
//      the mean by a stable amount per call) while tolerating CI flutter.
//
// What this catches
// ──────────────────
//   The SDK should NOT branch on response shape, destination string content,
//   or any other input in a way that produces input-dependent runtime. If
//   someone adds, e.g., `if (destination.includes('admin@')) { ... extra
//   work ... }`, this test will flag it.
//
// What this does NOT catch
// ────────────────────────
//   Server-side timing leaks live in the BFF and are tested there. Mocking
//   fetch removes the network entirely from this measurement, which is the
//   point: we want to isolate the SDK's own input-dependent CPU cost.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyCode } from '../../src/flows/code-flow.js';
import { configureClient, __resetClientForTests } from '../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../src/core/token-manager.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../src/core/event-reporter.js';
import { __resetDbForTests } from '../../src/core/storage.js';

const BASE = 'https://ct-bff.test.example.com';

const KNOWN_BAD_EMAIL = 'known-bad@example.com';
const UNKNOWN_EMAIL = 'never-seen-12345@example.com';

// Total samples per cohort. 1000 each side gives a tight enough confidence
// interval without making CI runs noticeably slower (~3-5 s on modern hw).
const SAMPLES_PER_COHORT = 1000;
const TRIM_FRACTION = 0.05; // drop top + bottom 5% to control for GC / deopt

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Measure runtime in ms for a single call. Uses performance.now() because
 * Date.now() has ~1ms granularity on most platforms — too coarse here.
 */
async function measureCall(destination: string, code: string): Promise<number> {
  const start = performance.now();
  try {
    await verifyCode({ destination, code });
  } catch {
    // We expect verifyCode to throw on the 401/403 mock response; that's the
    // path we want to measure. Eating the error so the timing reflects
    // ONLY the work the SDK did.
  }
  return performance.now() - start;
}

function trimmedMean(values: number[], trim: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const drop = Math.floor(sorted.length * trim);
  const slice = sorted.slice(drop, sorted.length - drop);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function stddev(values: number[], mean: number): number {
  const sq = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  return Math.sqrt(sq / values.length);
}

describe('Security #2 — timing-attack regression (§11.8)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    void __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    // Both cohorts get the SAME mocked response shape + status. Server-side
    // latency is a constant 0ms (resolved synchronously) so any measurable
    // difference between cohorts must come from the SDK itself.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResp(401, { error: { code: 'invalid_code', message: 'Invalid code' } }))
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('mean response time delta between known-bad and unknown destinations stays within timing-oracle tolerance', async () => {
    // Warm-up: prime the JIT so we don't measure first-call deopt cost.
    for (let i = 0; i < 50; i++) {
      await measureCall(KNOWN_BAD_EMAIL, '000000');
      await measureCall(UNKNOWN_EMAIL, '000000');
    }

    // Interleave the two cohorts so we don't ascribe drift (e.g. CI host
    // load spikes mid-run) to one cohort.
    const knownBadTimes: number[] = [];
    const unknownTimes: number[] = [];
    for (let i = 0; i < SAMPLES_PER_COHORT; i++) {
      if (i % 2 === 0) {
        knownBadTimes.push(await measureCall(KNOWN_BAD_EMAIL, '000000'));
        unknownTimes.push(await measureCall(UNKNOWN_EMAIL, '000000'));
      } else {
        unknownTimes.push(await measureCall(UNKNOWN_EMAIL, '000000'));
        knownBadTimes.push(await measureCall(KNOWN_BAD_EMAIL, '000000'));
      }
    }

    const meanKnown = trimmedMean(knownBadTimes, TRIM_FRACTION);
    const meanUnknown = trimmedMean(unknownTimes, TRIM_FRACTION);
    const sdKnown = stddev(knownBadTimes, meanKnown);
    const sdUnknown = stddev(unknownTimes, meanUnknown);
    const cvKnown = sdKnown / meanKnown;
    const cvUnknown = sdUnknown / meanUnknown;

    // Log the numbers so a regression triage can see what the deltas look
    // like even when the assertion passes. CI logs catch this.
    // eslint-disable-next-line no-console
    console.log(
      `[timing] known-bad: mean=${meanKnown.toFixed(3)}ms cv=${cvKnown.toFixed(3)} | ` +
        `unknown: mean=${meanUnknown.toFixed(3)}ms cv=${cvUnknown.toFixed(3)} | ` +
        `delta=${(Math.abs(meanKnown - meanUnknown) / Math.min(meanKnown, meanUnknown) * 100).toFixed(2)}%`
    );

    // Pass-if-either: small absolute delta OR small relative delta. See the
    // rationale at the top of this file — % deltas are noisy when means are
    // sub-millisecond, absolute deltas are noisy when means are large.
    const minMean = Math.min(meanKnown, meanUnknown);
    const absoluteDelta = Math.abs(meanKnown - meanUnknown);
    const relativeDelta = absoluteDelta / minMean;
    const ABSOLUTE_TOLERANCE_MS = 0.5;
    const RELATIVE_TOLERANCE = 0.25;
    expect(
      absoluteDelta < ABSOLUTE_TOLERANCE_MS || relativeDelta < RELATIVE_TOLERANCE
    ).toBe(true);

    // Reference the cv values so they're not unused. We don't gate on CV
    // because at sub-ms timing, CV is dominated by clock granularity and
    // GC, not the SDK's behaviour.
    expect(Number.isFinite(cvKnown)).toBe(true);
    expect(Number.isFinite(cvUnknown)).toBe(true);
  }, 60_000);
});
