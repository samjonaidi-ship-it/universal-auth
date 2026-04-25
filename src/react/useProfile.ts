// @bb/universal-auth | src/react/useProfile.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Hook around profile module — stub surface for Block 4; implementation lands
// alongside src/profile/* in Block 5 Days 11-12.
//
// The shape is locked here so consumers (CalExp5, BB_Express) can write code
// against the API now. The state-machine values ('loading'|'ready'|'saving'|'error')
// match §5.4.2.

import { useState, useCallback } from 'react';
import type { UniversalProfile } from '../types/profile.js';

export type ProfileState = 'loading' | 'ready' | 'saving' | 'error';

export interface UseProfileReturn {
  profile: UniversalProfile | null;
  state: ProfileState;
  completeness: number;       // 0-100 per §5.4.3
  needsSetup: boolean;        // §5.5.2 — true when below auto-prompt threshold
  missingRequired: readonly string[];
  save: (patch: Partial<UniversalProfile>) => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Block 4 stub: returns a stable empty profile + no-op save until Block 5
 * lands the profile module. The hook signature is the long-term contract.
 */
export function useProfile(): UseProfileReturn {
  const [profile] = useState<UniversalProfile | null>(null);
  const [state] = useState<ProfileState>('ready');

  const save = useCallback(async (_patch: Partial<UniversalProfile>): Promise<void> => {
    // Block 5: wires to PUT /identity/v1/profile
    void _patch;
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    // Block 5: wires to GET /identity/v1/profile
  }, []);

  return {
    profile,
    state,
    completeness: 0,
    needsSetup: false,
    missingRequired: [],
    save,
    refresh,
  };
}
