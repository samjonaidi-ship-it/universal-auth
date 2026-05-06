// @samjonaidi-ship-it/universal-auth | src/core/device-id.ts | v1.1.0 | 2026-05-06 | BB
// Device identifier derived from User-Agent per §15.2 — TELEMETRY ONLY.
//
// Current: SHA-256(navigator.userAgent).hex.slice(0, 32)
//   → 32-char hex. Not cryptographic binding — observable to server via UA anyway.
//   → Used for event correlation in CT BFF (`device_id` field on every event).
//
// v1.1.0 (P1-K, 2026-05-06): localStorage cache REMOVED. Path A from the
// 2026-05-06 security audit (Finding M3): an XSS attacker could overwrite the
// localStorage value to pin the device-id and evade server-side anomaly
// detection. The SHA-256 of <1KB UA string is sub-millisecond — recomputing
// every page load is cheaper than maintaining a tamper-resistant cache.
// In-memory cache (cachedDeviceId / cachedFromUserAgent) is preserved so
// repeated calls within the same tab don't re-hash.
//
// v1.0.1 (B2): the previous "device-bound" PBKDF2 input path that fed this
// value into at-rest encryption is RETIRED. UA-derivation is brittle (Chrome
// UA-Reduction silently invalidated stored ciphertext) and offers no real
// device binding. The SDK now generates a fresh AES-256-GCM key via
// crypto.subtle.generateKey() and persists its CryptoKey handle in IDB.
// Device ID remains exclusively for server-side event correlation.
//
// Phase 2 (§16.2): replace with DPoP (RFC 9449) cryptographic device binding.
// Today's API is intentionally compatible with a future `deriveKeyedDeviceId()` upgrade.

let cachedDeviceId: string | null = null;
let cachedFromUserAgent: string | null = null;

/**
 * Return the device id. Computed from navigator.userAgent on first call per
 * page load, memoized in-memory for the lifetime of the tab. Recomputed on
 * each page load — no on-disk cache. SHA-256 of the UA string is fast enough
 * (<1ms on commodity hardware) that the security tradeoff favors recompute
 * over a tamper-vulnerable localStorage cache.
 *
 * NOT persisted via encrypted IDB because: (a) not a token (§15.1 rule
 * applies to tokens), (b) recomputable from UA on miss.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const ua = getUserAgent();

  // In-memory fast path — same tab, same UA → skip the SHA-256 round-trip.
  if (cachedDeviceId !== null && cachedFromUserAgent === ua) {
    return cachedDeviceId;
  }

  const id = await computeDeviceIdFromUA(ua);
  cachedDeviceId = id;
  cachedFromUserAgent = ua;
  return id;
}

/**
 * Pure SHA-256 derivation. Exported for unit testability.
 */
export async function computeDeviceIdFromUA(userAgent: string): Promise<string> {
  const bytes = new TextEncoder().encode(userAgent);
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const hashArr = Array.from(new Uint8Array(hashBuf));
  const hex = hashArr.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 32);
}

/**
 * Reset in-memory cache. Exported for tests.
 *
 * v1.1.0 (P1-K): localStorage cache removed; this is now an in-memory-only reset.
 */
export function clearDeviceIdCache(): void {
  cachedDeviceId = null;
  cachedFromUserAgent = null;
}

function getUserAgent(): string {
  if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
    return navigator.userAgent;
  }
  // Node / SSR — deterministic fallback so server-side rendering doesn't break
  return 'bb-universal-auth-ssr-fallback';
}
