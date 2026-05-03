// @samjonaidi-ship-it/universal-auth | src/core/device-id.ts | v1.0.1 | 2026-05-01 | BB
// Device identifier derived from User-Agent per §15.2 — TELEMETRY ONLY.
//
// Current: SHA-256(navigator.userAgent).hex.slice(0, 32)
//   → 32-char hex. Not cryptographic binding — observable to server via UA anyway.
//   → Used for event correlation in CT BFF (`device_id` field on every event).
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

const LS_CACHE_KEY = 'bb-ua-device-id';

/**
 * Return the device id. Computed once per session from navigator.userAgent,
 * memoized in-memory for performance. Optionally cached in localStorage to
 * avoid recomputing SHA-256 on every boot (device id is not a secret —
 * it derives from publicly observable UA).
 *
 * NOT persisted via encrypted IDB because: (a) not a token (§15.1 rule
 * applies to tokens), (b) recomputable from UA on miss, (c) stable across
 * browser restarts.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  // In-memory fast path — one derivation per tab
  if (cachedDeviceId !== null && cachedFromUserAgent === getUserAgent()) {
    return cachedDeviceId;
  }

  const ua = getUserAgent();

  // localStorage cache — same UA across reloads, skip SHA-256
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(LS_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { ua?: string; id?: string };
        if (parsed.ua === ua && typeof parsed.id === 'string' && /^[0-9a-f]{32}$/.test(parsed.id)) {
          cachedDeviceId = parsed.id;
          cachedFromUserAgent = ua;
          return parsed.id;
        }
      }
    } catch {
      // localStorage unavailable (incognito, SSR, etc.) — fall through to compute
    }
  }

  const id = await computeDeviceIdFromUA(ua);
  cachedDeviceId = id;
  cachedFromUserAgent = ua;

  // Best-effort persist — non-fatal if it fails
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(LS_CACHE_KEY, JSON.stringify({ ua, id }));
    } catch {
      // quota / incognito — recompute on next call is fine
    }
  }

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
 * Reset in-memory + localStorage cache. Exported for tests and for rare
 * UA-refresh scenarios (Chrome's UA-Reduction rollouts).
 */
export function clearDeviceIdCache(): void {
  cachedDeviceId = null;
  cachedFromUserAgent = null;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LS_CACHE_KEY);
    } catch {
      // non-fatal
    }
  }
}

function getUserAgent(): string {
  if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string') {
    return navigator.userAgent;
  }
  // Node / SSR — deterministic fallback so server-side rendering doesn't break
  return 'bb-universal-auth-ssr-fallback';
}
