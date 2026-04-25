// @bb/universal-auth | src/react/useImpersonation.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Hook for admin impersonation flows.

import { useCallback } from 'react';
import {
  startImpersonation as startFn,
  endImpersonation as endFn,
  recordImpersonationAction,
  type StartImpersonationInput,
} from '../flows/impersonation.js';

export interface UseImpersonationReturn {
  start: (input: StartImpersonationInput) => Promise<void>;
  end: () => Promise<void>;
  recordAction: (action: string, targetId: string) => void;
}

export function useImpersonation(): UseImpersonationReturn {
  const start = useCallback(async (input: StartImpersonationInput): Promise<void> => {
    await startFn(input);
  }, []);

  const end = useCallback(async (): Promise<void> => {
    await endFn();
  }, []);

  return {
    start,
    end,
    recordAction: recordImpersonationAction,
  };
}
