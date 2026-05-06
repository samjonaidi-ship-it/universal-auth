// @samjonaidi-ship-it/universal-auth | src/react/useAccessBulk.ts | v0.1.1 | 2026-05-06 | BB
// Bulk ABAC hook — one network round-trip for 5–50 (resource, action) pairs.
// Powers DelegationCenter's "effective-access" tab + similar list-views per
// ABAC_DESIGN_v1.0.md §8 follow-up (L3.4).
//
// Same SWR contract as useAccess: cached entries fill instantly; the
// remaining misses go out as a single POST /access/v1/check-bulk.

import { useEffect, useRef, useState } from 'react';
import {
  canAccessBulk,
  onAccessChange,
  type AccessCheck,
} from '../core/abac.js';
import { AuthSdkError } from '../errors.js';

export interface UseAccessBulkReturn {
  allowed: readonly boolean[] | null;
  loading: boolean;
  error: AuthSdkError | null;
}

export function useAccessBulk(checks: readonly AccessCheck[]): UseAccessBulkReturn {
  // Stable key derived from the input list — prop arrays are typically
  // re-allocated on every render, so we have to hash structurally.
  const key = checks
    .map((c) => `${c.resource_type}:${c.resource_id}:${c.action}`)
    .join('|');
  const checksRef = useRef<readonly AccessCheck[]>(checks);
  checksRef.current = checks;

  const [allowed, setAllowed] = useState<readonly boolean[] | null>(null);
  const [loading, setLoading] = useState<boolean>(checks.length > 0);
  const [error, setError] = useState<AuthSdkError | null>(null);

  useEffect(() => {
    if (checksRef.current.length === 0) {
      setAllowed([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void canAccessBulk(checksRef.current)
      .then((next) => {
        if (cancelled) return;
        setAllowed(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof AuthSdkError
            ? err
            : new AuthSdkError('UNKNOWN', String(err))
        );
        setLoading(false);
      });

    const unsubscribe = onAccessChange(() => {
      void canAccessBulk(checksRef.current)
        .then((next) => {
          if (cancelled) return;
          setAllowed(next);
        })
        .catch(() => {
          // Background refresh failure — keep last-known state.
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // key encodes the full bulk-checks shape; checksRef is read via .current.
  }, [key]);

  return { allowed, loading, error };
}
