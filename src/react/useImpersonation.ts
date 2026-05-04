// @samjonaidi-ship-it/universal-auth | src/react/useImpersonation.ts | v1.0.4 | 2026-05-04 | BB
// Hook for admin impersonation flows + reactive actingAs state.
//
// v1.0.4 (L2.18): expose `lastDriftEvent` so admin UIs can render a banner
// when `endImpersonation` cleared local state but the server end-call failed
// (audit drift). Drift state is auto-cleared on a fresh `start()` so old
// drifts do not haunt new sessions.

import { useCallback, useEffect, useState } from 'react';
import {
  startImpersonation as startFn,
  endImpersonation as endFn,
  recordImpersonationAction,
  getCurrentActingAs,
  onActingAsChange,
  onLocalClearDrift,
  type StartImpersonationInput,
  type ActingAs,
  type ImpersonationDriftEvent,
} from '../flows/impersonation.js';

export interface UseImpersonationReturn {
  /** Current impersonation target, or null when not impersonating. Reactive. */
  actingAs: ActingAs | null;
  start: (input: StartImpersonationInput) => Promise<void>;
  end: () => Promise<void>;
  recordAction: (action: string, targetId: string) => void;
  /**
   * Most recent local-clear drift event for this session, or null.
   *
   * Populated when `endImpersonation` succeeded locally but the server end
   * call failed (audit log may be incomplete). UI consumers should surface
   * this to admins — e.g., a yellow banner reading "Audit drift detected —
   * please report to admin".
   *
   * Auto-clears when a new impersonation `start()` is invoked so a stale
   * drift from a previous session doesn't haunt a fresh one.
   */
  lastDriftEvent: ImpersonationDriftEvent | null;
}

export function useImpersonation(): UseImpersonationReturn {
  const [actingAs, setActingAs] = useState<ActingAs | null>(getCurrentActingAs());
  const [lastDriftEvent, setLastDriftEvent] = useState<ImpersonationDriftEvent | null>(null);

  useEffect(() => {
    // Sync to module-level state on mount in case it changed before subscription
    setActingAs(getCurrentActingAs());
    const offActing = onActingAsChange(() => {
      setActingAs(getCurrentActingAs());
    });
    const offDrift = onLocalClearDrift((event) => {
      setLastDriftEvent(event);
    });
    return () => {
      offActing();
      offDrift();
    };
  }, []);

  const start = useCallback(async (input: StartImpersonationInput): Promise<void> => {
    // v1.0.4 (L2.18): clear any stale drift from a previous session before
    // we kick off a new impersonation, so the UI banner doesn't carry over.
    setLastDriftEvent(null);
    await startFn(input);
  }, []);

  const end = useCallback(async (): Promise<void> => {
    await endFn();
  }, []);

  return {
    actingAs,
    start,
    end,
    recordAction: recordImpersonationAction,
    lastDriftEvent,
  };
}
