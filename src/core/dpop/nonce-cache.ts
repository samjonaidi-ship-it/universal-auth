// @samjonaidi-ship-it/universal-auth | src/core/dpop/nonce-cache.ts | v0.1.0 | 2026-05-06 | BB
// In-memory cache of server-issued DPoP-Nonce values, keyed by endpoint.
//
// Per DPOP_DESIGN_v1.0.md §10.2 (locked): server issues nonce-challenge
// only on /session/refresh in v1.0. The fetch wrapper records the
// `DPoP-Nonce` response header on every response, then consumes the
// matching cached nonce on the next request to the same endpoint.
//
// Single-slot per endpoint — RFC 9449 §8 only requires the most recent
// nonce. No LRU eviction needed for v1; the cache holds at most one entry
// per DPoP-protected endpoint (currently 3).
//
// In-memory only: nonces don't survive a tab reload, which is fine —
// the next request will get its own challenge cycle.

const cache = new Map<string, string>();

/** Record the most-recently-seen nonce for an endpoint. Overwrites prior. */
export function recordNonce(endpoint: string, nonce: string): void {
  cache.set(endpoint, nonce);
}

/**
 * Read + remove the cached nonce for an endpoint. Single-use semantics —
 * RFC 9449 §11.1: a nonce should be used at most once per proof.
 */
export function consumeNonce(endpoint: string): string | null {
  const value = cache.get(endpoint);
  if (value === undefined) return null;
  cache.delete(endpoint);
  return value;
}

/** Test-only: clear all cached nonces between tests. */
export function __resetNonceCacheForTests(): void {
  cache.clear();
}
