// @samjonaidi-ship-it/universal-auth | src/react/useAccess.ts | v0.1.0 | 2026-05-06 | BB
// React hook for ABAC checks. Per ABAC_DESIGN_v1.0.md §5.1 + §8.1.
//
// Stale-while-revalidate:
//   * If a cache hit is available at first render, `allowed` is non-null
//     immediately and `loading` is false.
//   * Otherwise `allowed` starts null + `loading` true while the GET fires.
//   * On every render with a fresh resource/action pair we kick off a
//     background refresh (subject to the 60 s TTL inside core/abac.ts).
//
// Stability:
//   * The resource descriptor is a fresh object on most renders; we
//     stringify once into a stable key and use refs for the descriptor body
//     so the effect doesn't infinite-loop. Effect deps are STRINGS.

import { useEffect, useRef, useState } from 'react';
import { canAccess, onAccessChange, type ResourceDescriptor } from '../core/abac.js';
import { AuthSdkError } from '../errors.js';

export interface UseAccessReturn {
  allowed: boolean | null;
  loading: boolean;
  error: AuthSdkError | null;
}

export function useAccess(
  resource: ResourceDescriptor,
  action: string
): UseAccessReturn {
  // Stable string key — drives effect dep array, prevents infinite re-renders
  // on resource-prop identity changes.
  const key = `${resource.resource_type}:${resource.id}:${action}`;
  const resourceRef = useRef<ResourceDescriptor>(resource);
  resourceRef.current = resource;

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<AuthSdkError | null>(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    void canAccess(resourceRef.current, action)
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

    // Subscribe to cache invalidation events (session change, manual flush)
    // so consumers re-evaluate without a full unmount.
    const unsubscribe = onAccessChange(() => {
      void canAccess(resourceRef.current, action)
        .then((next) => {
          if (cancelled) return;
          setAllowed(next);
        })
        .catch(() => {
          // Background refresh failure: keep last-known value, surface no
          // new error (the originating mutation will surface its own).
        });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // key is the canonical input; action + resource fields participate in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, action]);

  return { allowed, loading, error };
}
