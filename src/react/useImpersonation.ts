// @samjonaidi-ship-it/universal-auth | src/react/useImpersonation.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Hook for admin impersonation flows + reactive actingAs state.

import { useCallback, useEffect, useState } from 'react';
import {
  startImpersonation as startFn,
  endImpersonation as endFn,
  recordImpersonationAction,
  getCurrentActingAs,
  onActingAsChange,
  type StartImpersonationInput,
  type ActingAs,
} from '../flows/impersonation.js';

export interface UseImpersonationReturn {
  /** Current impersonation target, or null when not impersonating. Reactive. */
  actingAs: ActingAs | null;
  start: (input: StartImpersonationInput) => Promise<void>;
  end: () => Promise<void>;
  recordAction: (action: string, targetId: string) => void;
}

export function useImpersonation(): UseImpersonationReturn {
  const [actingAs, setActingAs] = useState<ActingAs | null>(getCurrentActingAs());

  useEffect(() => {
    // Sync to module-level state on mount in case it changed before subscription
    setActingAs(getCurrentActingAs());
    return onActingAsChange(() => {
      setActingAs(getCurrentActingAs());
    });
  }, []);

  const start = useCallback(async (input: StartImpersonationInput): Promise<void> => {
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
  };
}
