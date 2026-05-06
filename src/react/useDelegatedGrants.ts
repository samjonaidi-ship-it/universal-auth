// @samjonaidi-ship-it/universal-auth | src/react/useDelegatedGrants.ts | v0.1.0 | 2026-05-06 | BB
// Hook for the delegated-grants surface used by <DelegationCenter>.
//
// Per DELEGATION_CENTER_DESIGN_v1.0.md §10 D4: cache-with-revalidate, 60s TTL.
// Cache invalidates after grant() or revoke() success so the UI stays
// consistent without a manual refetch.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listDelegatedGrants,
  createDelegatedGrant,
  revokeDelegatedGrant,
  exportGrantsAsJson,
  type DelegatedGrant,
  type CreateDelegatedGrantInput,
  type ListDelegatedGrantsResult,
} from '../flows/delegation.js';

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  result: ListDelegatedGrantsResult;
  fetchedAt: number;
}

// Module-level cache so multiple components share the same 60s window
// (matches the entitlements/ABAC cache pattern).
let moduleCache: CacheEntry | null = null;
const subscribers = new Set<() => void>();

function notify(): void {
  for (const fn of subscribers) fn();
}

function invalidate(): void {
  moduleCache = null;
  notify();
}

export interface UseDelegatedGrantsReturn {
  grants_from_me: readonly DelegatedGrant[];
  grants_to_me: readonly DelegatedGrant[];
  loading: boolean;
  error: string | null;
  grant: (input: CreateDelegatedGrantInput) => Promise<DelegatedGrant>;
  revoke: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  exportJson: () => Promise<Blob>;
}

export function useDelegatedGrants(): UseDelegatedGrantsReturn {
  const [, forceTick] = useState(0);
  const [loading, setLoading] = useState<boolean>(moduleCache === null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const fetchIfStale = useCallback(async (force: boolean): Promise<void> => {
    const now = Date.now();
    if (
      !force &&
      moduleCache !== null &&
      now - moduleCache.fetchedAt < CACHE_TTL_MS
    ) {
      return;
    }
    if (inFlight.current !== null) return inFlight.current;

    setLoading(true);
    setError(null);
    const promise = (async (): Promise<void> => {
      try {
        const result = await listDelegatedGrants();
        moduleCache = { result, fetchedAt: Date.now() };
        notify();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load grants.');
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = promise;
    return promise;
  }, []);

  // Subscribe to module-level cache changes (notify() bumps a tick).
  useEffect(() => {
    const sub = (): void => forceTick((n) => n + 1);
    subscribers.add(sub);
    void fetchIfStale(false);
    return () => {
      subscribers.delete(sub);
    };
  }, [fetchIfStale]);

  const grant = useCallback(
    async (input: CreateDelegatedGrantInput): Promise<DelegatedGrant> => {
      const created = await createDelegatedGrant(input);
      invalidate();
      await fetchIfStale(true);
      return created;
    },
    [fetchIfStale]
  );

  const revoke = useCallback(
    async (id: string): Promise<void> => {
      await revokeDelegatedGrant(id);
      invalidate();
      await fetchIfStale(true);
    },
    [fetchIfStale]
  );

  const refetch = useCallback(async (): Promise<void> => {
    invalidate();
    await fetchIfStale(true);
  }, [fetchIfStale]);

  const exportJson = useCallback(async (): Promise<Blob> => {
    return exportGrantsAsJson();
  }, []);

  const cached = moduleCache?.result;

  return {
    grants_from_me: cached?.grants_from_me ?? [],
    grants_to_me: cached?.grants_to_me ?? [],
    loading,
    error,
    grant,
    revoke,
    refetch,
    exportJson,
  };
}

// ── Test-only helper ───────────────────────────────────────────────────────

export function __resetDelegatedGrantsCacheForTests(): void {
  moduleCache = null;
  subscribers.clear();
}
