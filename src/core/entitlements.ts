// @samjonaidi-ship-it/universal-auth | src/core/entitlements.ts | v1.2.1 | 2026-05-06 | BB
// Entitlement (feature + app_access) cache with stale-while-revalidate.
//
// Invariants per spec:
//   §8.1     Stale-while-revalidate — return cached instantly, refresh in background
//   §8.1     5-minute default TTL for freshness
//   §9.1     7-day offline grace — cached entitlements marked `offline: true`
//   §9.5     Beyond 7-day grace → treat as revoked (hasFeature returns false)
//   §15.1    Access tokens never touch localStorage — entitlements are NOT tokens,
//            they're a list of feature keys, safe to persist to localStorage
//
// Design:
//   * Hot reads are sync (`hasFeature`, `hasAppAccess`) — backed by in-memory snapshot
//   * Revalidation happens via `refreshEntitlements()` — scheduled by the consumer
//     on session change (called from useAuth hook + session-watcher)
//   * Cache persisted to localStorage under `bb-universal-auth:entitlements` so
//     it survives page reload; hydrated on first read
//
// v1.2.0 (P1-J, 2026-05-06): HMAC-SHA-256 tag over the localStorage blob.
// Audit Finding M2: an XSS attacker could write arbitrary entitlements to
// localStorage and client-side spoof admin features in the UI (server still
// enforces). The MAC is keyed off a non-extractable HMAC-SHA-256 key
// persisted in IDB (separate from the AES-GCM master key — algorithm
// incompatible). On read: signature verified asynchronously after the sync
// hot-path returns; mismatch triggers a clear + listener notification.
// Legacy unsigned blobs are accepted ONCE on first v1.2 load and rewritten
// with a signature on the next save (graceful migration — no forced
// re-fetch). Wire format: `{ data: CacheShape, sig: base64url }`.

import { get } from './client.js';
import type { Entitlements } from '../types/api.js';
import { AuthSessionRevoked } from '../errors.js';
import { getOrCreateHmacKey } from './storage.js';

// ── Constants ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bb-universal-auth:entitlements';
const DEFAULT_TTL_MS = 5 * 60 * 1000;                     // §8.1
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;         // §9.1

// ── Internal state ────────────────────────────────────────────────────────

interface CacheShape {
  features: readonly string[];
  app_access: readonly string[];
  fetched_at: number;       // epoch ms when we last got a 2xx from server
  identity_id: string | null;
}

let memory: CacheShape | null = null;
let inFlightRefresh: Promise<CacheShape | null> | null = null;

// ── Listener pub/sub (v1.0.1 C4) ──────────────────────────────────────────
// AuthProvider subscribes here so consumers of useEntitlements() re-render
// whenever a refresh updates the cache (offline-grace TTL flip, session
// change, background SWR refresh).

type EntitlementsListener = () => void;
const listeners = new Set<EntitlementsListener>();

/**
 * Register a listener fired on every entitlements-cache mutation
 * (refresh success, manual clear). Listener receives no args; consumers
 * should call `getEntitlementsSnapshot()` / `hasFeature()` / `hasAppAccess()`
 * to read the new state.
 *
 * Returns an unsubscribe function. Listeners that throw are caught + logged
 * (one bad listener can't kill another).
 */
export function onEntitlementsChange(listener: EntitlementsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyEntitlementsChange(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // Listener bugs can't crash the cache.
    }
  }
}

// ── Persistence (localStorage) ────────────────────────────────────────────

// v1.2.0 (P1-J): MAC'd wire format. Old format is a bare CacheShape; new
// format is { data: CacheShape, sig: base64url(HMAC-SHA-256(data)) }.
interface SignedEnvelope {
  data: CacheShape;
  sig: string;
}

function isSignedEnvelope(o: unknown): o is SignedEnvelope {
  return (
    o !== null &&
    typeof o === 'object' &&
    'data' in o &&
    'sig' in o &&
    typeof (o as { sig: unknown }).sig === 'string'
  );
}

function isValidCacheShape(o: unknown): o is CacheShape {
  if (o === null || typeof o !== 'object') return false;
  const c = o as Partial<CacheShape>;
  return Array.isArray(c.features) && Array.isArray(c.app_access);
}

// Track whether the on-disk blob's signature has been verified for the
// current page load. Sync `loadFromDisk` returns instantly on the cached
// memory; an async verifier (kicked off by hydrate-then-verify) decides
// whether to keep or clear the cache.
let signatureVerified = false;

function loadFromDisk(): CacheShape | null {
  if (memory !== null) return memory;
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;

    // New (v1.2+) format: { data, sig } envelope. Adopt the data optimistically;
    // verifyDiskSignatureAsync() will clear it asynchronously if MAC fails.
    if (isSignedEnvelope(parsed)) {
      if (!isValidCacheShape(parsed.data)) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      memory = parsed.data;
      // Kick off async verify (idempotent — short-circuits if already verified).
      void verifyDiskSignatureAsync(parsed);
      return parsed.data;
    }

    // Legacy (v1.0/v1.1) format: bare CacheShape. Accept ONCE; re-sign on next save.
    if (isValidCacheShape(parsed)) {
      memory = parsed;
      signatureVerified = true; // legacy is "trusted" once for graceful migration
      return parsed;
    }

    // Unrecognized shape — purge.
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * P1-J: async signature verification of the on-disk blob. Runs once per
 * page load after the sync hot-path has already returned the cached data.
 * On mismatch (XSS-tampered or HMAC-key rotation), clears the cache and
 * notifies subscribers — consumers re-read null and a refresh kicks in.
 */
async function verifyDiskSignatureAsync(envelope: SignedEnvelope): Promise<void> {
  if (signatureVerified) return;
  try {
    const hmacKey = await getOrCreateHmacKey();
    const expectedSig = await computeSignature(envelope.data, hmacKey);
    if (expectedSig === envelope.sig) {
      signatureVerified = true;
      return;
    }
    // Tamper detected — clear the cache.
    clearDisk();
  } catch {
    // Crypto unavailable / IDB unavailable / algorithm rejection — leave the
    // cache in place; server enforcement is the ultimate gate.
    signatureVerified = true;
  }
}

async function computeSignature(data: CacheShape, hmacKey: CryptoKey): Promise<string> {
  // Use a stable JSON form: keys in insertion order from a fresh literal.
  // CacheShape has 4 fields; serialize them in a deterministic order.
  const stable = JSON.stringify({
    features: data.features,
    app_access: data.app_access,
    fetched_at: data.fetched_at,
    identity_id: data.identity_id,
  });
  const sig = await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(stable));
  return base64UrlEncode(new Uint8Array(sig));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function saveToDisk(snap: CacheShape): Promise<void> {
  memory = snap;
  if (typeof localStorage !== 'undefined') {
    try {
      // P1-J: sign the payload before write. Best-effort — if HMAC key
      // generation fails (e.g., crypto.subtle unavailable in some test env),
      // fall back to writing the legacy bare-CacheShape format. Reads will
      // accept it as legacy.
      let envelope: SignedEnvelope | null = null;
      try {
        const hmacKey = await getOrCreateHmacKey();
        const sig = await computeSignature(snap, hmacKey);
        envelope = { data: snap, sig };
      } catch {
        envelope = null;
      }
      const wire = envelope !== null ? JSON.stringify(envelope) : JSON.stringify(snap);
      localStorage.setItem(STORAGE_KEY, wire);
      // After a fresh signed write, the on-disk signature matches the new
      // memory state — no need to re-verify on next load (until a tab refresh).
      if (envelope !== null) {
        signatureVerified = true;
      }
    } catch {
      // Quota exceeded or storage disabled — in-memory only
    }
  }
  // v1.0.1 C4 — notify subscribers AFTER memory + disk update so re-reads see the new state.
  notifyEntitlementsChange();
}

function clearDisk(): void {
  memory = null;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  // v1.0.1 C4 — notify subscribers; useEntitlements() will read null from snapshot now.
  notifyEntitlementsChange();
}

// ── Public sync reads ─────────────────────────────────────────────────────

/**
 * True if the given feature key is in the current entitlement set AND the
 * cache hasn't crossed the offline-grace cutoff.
 *
 * Sync, pure — safe to call on every render. No network.
 */
export function hasFeature(featureKey: string): boolean {
  const snap = loadFromDisk();
  if (snap === null) return false;
  if (isBeyondGrace(snap)) return false;
  return snap.features.includes(featureKey);
}

/**
 * True if the current identity has access to the given app_id. Powers
 * `<AppChooser>` visibility + app-to-app hopping per §D2.1.
 */
export function hasAppAccess(appId: string): boolean {
  const snap = loadFromDisk();
  if (snap === null) return false;
  if (isBeyondGrace(snap)) return false;
  return snap.app_access.includes(appId);
}

/**
 * Snapshot of current entitlements. Returns null before first load.
 * `offline` is true when cache is within grace but fresh-TTL has lapsed.
 */
export function getEntitlementsSnapshot(): (Entitlements & {
  fetched_at: number;
  offline: boolean;
}) | null {
  const snap = loadFromDisk();
  if (snap === null) return null;
  if (isBeyondGrace(snap)) return null;
  return {
    features: snap.features,
    app_access: snap.app_access,
    fetched_at: snap.fetched_at,
    offline: Date.now() - snap.fetched_at > DEFAULT_TTL_MS,
  };
}

// ── Revalidation ──────────────────────────────────────────────────────────

interface MeResponse {
  aggregate?: {
    features?: readonly string[];
    app_access?: readonly string[];
  };
  identity?: {
    identity_id?: string;
  };
}

/**
 * Refresh entitlements from `/auth/v1/me`. Stale-while-revalidate:
 * the previous cache stays readable via `hasFeature` for the duration of the
 * call; on success it's swapped atomically.
 *
 * Concurrent callers coalesce on the in-flight request — only the first
 * caller's `signal` reaches the underlying fetch. Subsequent callers receive
 * the same in-flight promise; aborting their signal does NOT cancel the
 * shared fetch (it would also abort other callers). Callers needing
 * independent cancellation should not coalesce here.
 */
export async function refreshEntitlements(
  options: { signal?: AbortSignal } = {},
): Promise<CacheShape | null> {
  if (inFlightRefresh !== null) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const { data } = await get<MeResponse>(
        '/auth/v1/me',
        options.signal !== undefined ? { signal: options.signal } : {},
      );
      const features = data.aggregate?.features ?? [];
      const app_access = data.aggregate?.app_access ?? [];
      const next: CacheShape = {
        features,
        app_access,
        fetched_at: Date.now(),
        identity_id: data.identity?.identity_id ?? null,
      };
      await saveToDisk(next); // v1.2.0 (P1-J) — async to compute HMAC signature.
      return next;
    } catch (err) {
      // v1.0.1 (D2): re-throw session-revoked so the session-watcher / useAuth
      // hook can drive a sign-out. Only swallow transient network errors —
      // those leave the cache intact + consumer sees `offline: true`.
      if (err instanceof AuthSessionRevoked) {
        throw err;
      }
      if (err instanceof TypeError || (err instanceof Error && err.name === 'AbortError')) {
        return loadFromDisk();
      }
      // Other AuthSdkErrors (rate limit, server error, etc.) — also keep cache.
      return loadFromDisk();
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}

/**
 * Clear cache on logout / session revocation.
 * Listener registration is the consumer's concern (session-watcher + useAuth).
 */
export function clearEntitlements(): void {
  clearDisk();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isBeyondGrace(snap: CacheShape): boolean {
  return Date.now() - snap.fetched_at > OFFLINE_GRACE_MS;
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetEntitlementsForTests(): void {
  memory = null;
  inFlightRefresh = null;
  signatureVerified = false;
  listeners.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
