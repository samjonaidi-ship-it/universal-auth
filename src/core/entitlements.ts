// @bb/universal-auth | src/core/entitlements.ts | v1.0.0-rc.1 | 2026-04-24 | BB
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

import { get } from './client.js';
import type { Entitlements } from '../types/api.js';

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

// ── Persistence (localStorage) ────────────────────────────────────────────

function loadFromDisk(): CacheShape | null {
  if (memory !== null) return memory;
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function saveToDisk(snap: CacheShape): void {
  memory = snap;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // Quota exceeded or storage disabled — in-memory only
  }
}

function clearDisk(): void {
  memory = null;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
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
 * Concurrent callers coalesce on the in-flight request.
 */
export async function refreshEntitlements(): Promise<CacheShape | null> {
  if (inFlightRefresh !== null) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const { data } = await get<MeResponse>('/auth/v1/me');
      const features = data.aggregate?.features ?? [];
      const app_access = data.aggregate?.app_access ?? [];
      const next: CacheShape = {
        features,
        app_access,
        fetched_at: Date.now(),
        identity_id: data.identity?.identity_id ?? null,
      };
      saveToDisk(next);
      return next;
    } catch {
      // Network or server error — keep the existing cache; consumer sees
      // `offline: true` on the snapshot.
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
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
