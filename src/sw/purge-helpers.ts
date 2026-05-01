// @bainbridgebuilders/universal-auth | src/sw/purge-helpers.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Pure algorithm bits extracted from sw/index.ts so they can be unit-tested
// without an SW global scope. The SW entry imports these and wires them
// to the actual `caches` API.
//
// Look-back fix L6 — sw/index.ts was excluded from coverage because it runs
// in SW global scope (not happy-dom); extracting pure functions lets us
// unit-test the algorithm even when we can't unit-test the entry point.

/** Default cache-name patterns purged on logout — mirrors CalExp5 today. */
export const DEFAULT_PURGE_PATTERNS: readonly RegExp[] = Object.freeze([
  /runtime/i,
  /api/i,
  /auth-session-features/i,
]);

/**
 * Parse a list of pattern strings into RegExp objects with the `i` flag.
 * Invalid patterns are skipped (no throw — silent SW fallback).
 *
 * Used when the SW receives a `set_purge_patterns` message from the page.
 */
export function parsePurgePatterns(input: readonly unknown[]): RegExp[] {
  const out: RegExp[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    try {
      out.push(new RegExp(raw, 'i'));
    } catch {
      // Skip malformed patterns rather than crashing the SW
    }
  }
  return out;
}

/**
 * Filter the full list of cache names down to those that match ANY of the
 * given patterns. Returns the slice that should be deleted on logout.
 *
 * Pure function — no side effects, no `caches` API access.
 */
export function selectCachesToPurge(
  allCacheNames: readonly string[],
  patterns: readonly RegExp[]
): string[] {
  return allCacheNames.filter((name) =>
    patterns.some((pat) => pat.test(name))
  );
}
