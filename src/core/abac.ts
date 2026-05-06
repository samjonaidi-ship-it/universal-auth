// @samjonaidi-ship-it/universal-auth | src/core/abac.ts | v1.1.0 | 2026-05-06 | BB
// ABAC client cache + imperative canAccess() / canAccessBulk(). Per
// ABAC_DESIGN_v1.0.md §5.1 + §8.2 (LOCKED 2026-05-05).
//
// Invariants:
//   §5.1   GET  /access/v1/check?resource_type=&resource_id=&action= → AccessDecision
//   §5.1   POST /access/v1/check-bulk { checks: [...] } → AccessDecision[]  (max 50)
//   §8.1   In-memory cache. Key: `${identity_id}::${resource_type}:${resource_id}:${action}`. TTL 60 s.
//   §8.3   Advisory only — UI affordance hint, never replaces server-side enforcement.
//
// Cross-replica freshness via NOTIFY-based invalidation (Sam-locked A1) is
// server-side only this round; the SDK relies on TTL. L3.5 will wire SSE to
// the engine cache so SDK invalidations land within seconds of policy change.
//
// Identity stamp on the key is sourced from getCurrentSessionId() so cached
// decisions don't leak across sign-in / sign-out / session-refresh. The
// AuthProvider also calls invalidateAccessCache() on every session change as a
// defense in depth.

import { get, post } from './client.js';
import { getCurrentSessionId } from './token-manager.js';

// ── Public types ──────────────────────────────────────────────────────────

/**
 * Resource pointer the SDK sends to the engine. The server re-fetches the
 * resource attrs by `(resource_type, id)` from its own data plane.
 */
export interface ResourceDescriptor {
  resource_type: string;
  /** Unique resource id within the type. */
  id: string;
}

export interface AccessCheck {
  resource_type: string;
  resource_id: string;
  action: string;
}

export type AccessDecisionEffect = 'permit' | 'deny' | 'indeterminate';

export interface AccessDecision {
  decision: AccessDecisionEffect;
  allowed: boolean;
  matched_policy_ids: readonly string[];
  reason: string;
  protocol_version: 'v1';
}

// ── Internal cache ────────────────────────────────────────────────────────

interface CacheEntry {
  allowed: boolean;
  expires_at: number; // epoch ms
}

const CACHE_TTL_MS = 60 * 1000; // §8.1
const cache = new Map<string, CacheEntry>();

function cacheKey(
  identityStamp: string,
  resource_type: string,
  resource_id: string,
  action: string
): string {
  return `${identityStamp}::${resource_type}:${resource_id}:${action}`;
}

function currentIdentityStamp(): string {
  // The session id ratchets on every sign-in / refresh / sign-out,
  // so it doubles as a per-identity cache namespace without exposing
  // the identity_id in every cache lookup.
  return getCurrentSessionId() ?? 'anon';
}

function readCache(key: string): boolean | undefined {
  const entry = cache.get(key);
  if (entry === undefined) return undefined;
  if (entry.expires_at <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.allowed;
}

function writeCache(key: string, allowed: boolean): void {
  cache.set(key, { allowed, expires_at: Date.now() + CACHE_TTL_MS });
}

// ── Imperative API ────────────────────────────────────────────────────────

/**
 * One-shot access check. Returns the cached `allowed` instantly when fresh,
 * otherwise hits `GET /access/v1/check?...` and caches the result for 60 s.
 *
 * Errors (network, 401, 5xx) propagate. Server-default-deny means a 200
 * response with `decision: 'indeterminate'` returns `allowed: false`.
 */
export async function canAccess(
  resource: ResourceDescriptor,
  action: string,
  options: { signal?: AbortSignal } = {},
): Promise<boolean> {
  const stamp = currentIdentityStamp();
  const key = cacheKey(stamp, resource.resource_type, resource.id, action);
  const cached = readCache(key);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams({
    resource_type: resource.resource_type,
    resource_id: resource.id,
    action,
  });
  const { data } = await get<AccessDecision>(
    `/access/v1/check?${params.toString()}`,
    options.signal !== undefined ? { signal: options.signal } : {},
  );
  writeCache(key, data.allowed);
  return data.allowed;
}

/**
 * Bulk access check. Server cap: 50 checks per request (per ABAC §5.1).
 * Returns booleans in the SAME order as the input.
 *
 * Cache strategy:
 *   * Each (resource, action) is consulted in the cache first.
 *   * Misses are batched into a single POST.
 *   * Results from the POST are written to cache and merged into the
 *     return array preserving input order.
 */
export async function canAccessBulk(
  checks: readonly AccessCheck[],
  options: { signal?: AbortSignal } = {},
): Promise<boolean[]> {
  if (checks.length === 0) return [];
  if (checks.length > 50) {
    throw new Error(
      '[universal-auth] canAccessBulk supports at most 50 checks per call (per ABAC §5.1).'
    );
  }

  const stamp = currentIdentityStamp();
  const result: boolean[] = new Array<boolean>(checks.length);
  const misses: { idx: number; check: AccessCheck }[] = [];

  for (let i = 0; i < checks.length; i++) {
    const c = checks[i]!;
    const key = cacheKey(stamp, c.resource_type, c.resource_id, c.action);
    const cached = readCache(key);
    if (cached !== undefined) {
      result[i] = cached;
    } else {
      misses.push({ idx: i, check: c });
    }
  }

  if (misses.length === 0) return result;

  const { data } = await post<AccessDecision[]>(
    '/access/v1/check-bulk',
    { checks: misses.map((m) => m.check) },
    options.signal !== undefined ? { signal: options.signal } : {},
  );

  // Server contract: response array has same length + order as request.
  // Defend against length mismatch — fail closed (default deny).
  for (let j = 0; j < misses.length; j++) {
    const miss = misses[j]!;
    const decision = data[j];
    const allowed = decision === undefined ? false : decision.allowed;
    const key = cacheKey(
      stamp,
      miss.check.resource_type,
      miss.check.resource_id,
      miss.check.action
    );
    writeCache(key, allowed);
    result[miss.idx] = allowed;
  }

  return result;
}

// ── Cache control ─────────────────────────────────────────────────────────

/**
 * Clear every cached decision. Called by AuthProvider on session change so
 * stale grants/denies don't carry across sign-in boundaries.
 */
export function invalidateAccessCache(): void {
  cache.clear();
  notifyAccessChange();
}

// ── Listener pub/sub ──────────────────────────────────────────────────────
// React hooks subscribe here so they re-render when invalidation lands.

type AccessListener = () => void;
const listeners = new Set<AccessListener>();

export function onAccessChange(listener: AccessListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyAccessChange(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // Listener bugs can't crash the cache.
    }
  }
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetAbacForTests(): void {
  cache.clear();
  listeners.clear();
}
