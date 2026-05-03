// @samjonaidi-ship-it/universal-auth | src/react/usePermissionGrants.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Hook around flows/permission-grants — wires CalExp5 FirstLaunchScreen pattern
// per §13.5.2.

import { useCallback } from 'react';
import {
  recordPermissionGrant,
  requestAndRecord,
  type PermissionKey,
  type PermissionState,
  type RecordGrantInput,
} from '../flows/permission-grants.js';

export interface UsePermissionGrantsReturn {
  record: (input: RecordGrantInput) => Promise<void>;
  requestAndRecord: (key: PermissionKey) => Promise<PermissionState>;
}

export function usePermissionGrants(): UsePermissionGrantsReturn {
  const record = useCallback(
    async (input: RecordGrantInput): Promise<void> => {
      await recordPermissionGrant(input);
    },
    []
  );

  const reqAndRec = useCallback(
    async (key: PermissionKey): Promise<PermissionState> =>
      requestAndRecord(key),
    []
  );

  return { record, requestAndRecord: reqAndRec };
}
