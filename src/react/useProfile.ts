// @samjonaidi-ship-it/universal-auth | src/react/useProfile.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// useProfile hook (real impl, replaces Block 4 stub) — wraps profile-store
// with reactive subscription + auto-hydrate-on-mount. Per §5.4.2.

import { useCallback, useEffect, useState } from 'react';
import {
  getProfileSnapshot,
  onProfileChange,
  hydrateProfile,
  saveProfile,
  applyAvatarUpdate,
  type ProfileState,
} from '../profile/profile-store.js';
import { uploadAvatar, clearAvatar as clearAvatarFlow } from '../profile/avatar.js';
import { useAuth } from './useAuth.js';
import type { UniversalProfile } from '../types/profile.js';

export type { ProfileState };

export interface UseProfileReturn {
  profile: UniversalProfile | null;
  state: ProfileState;
  errorMessage: string | null;
  completeness: number;
  needsSetup: boolean;
  missingRequired: readonly string[];

  save: (patch: Partial<UniversalProfile>) => Promise<UniversalProfile>;
  uploadAvatar: (file: Blob | File) => Promise<{ avatar_url: string }>;
  selectPreset: (presetKey: string) => Promise<void>;
  clearAvatar: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_AUTO_PROMPT_THRESHOLD = 60;

export function useProfile(): UseProfileReturn {
  const [snap, setSnap] = useState(() => getProfileSnapshot());
  const { activePersona } = useAuth();

  useEffect(() => {
    setSnap(getProfileSnapshot());
    const unsubscribe = onProfileChange(() => setSnap(getProfileSnapshot()));
    // Auto-hydrate on mount when state is still in initial 'loading'
    const initial = getProfileSnapshot();
    if (initial.profile === null && initial.state === 'loading') {
      void hydrateProfile().catch(() => {
        // store captures error state internally
      });
    }
    return unsubscribe;
  }, []);

  const save = useCallback(
    async (patch: Partial<UniversalProfile>): Promise<UniversalProfile> => {
      const opts: { activePersona?: string; enforceRequired?: boolean } = {
        enforceRequired: true,
      };
      if (activePersona?.persona_type !== undefined) {
        opts.activePersona = activePersona.persona_type;
      }
      return saveProfile(patch, opts);
    },
    [activePersona]
  );

  const uploadAvatarCb = useCallback(
    async (file: Blob | File): Promise<{ avatar_url: string }> => {
      const result = await uploadAvatar(file);
      applyAvatarUpdate({
        avatar_url: result.avatar_url,
        profile_version: result.profile_version,
      });
      return { avatar_url: result.avatar_url };
    },
    []
  );

  const selectPreset = useCallback(async (presetKey: string): Promise<void> => {
    const updated = await saveProfile({ avatar_preset: presetKey });
    applyAvatarUpdate({
      avatar_preset: updated.avatar_preset ?? presetKey,
      profile_version: updated.profile_version,
    });
  }, []);

  const clearAvatarCb = useCallback(async (): Promise<void> => {
    await clearAvatarFlow();
    // Re-hydrate to pick up server-side fallback (preset → initials)
    await hydrateProfile();
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await hydrateProfile();
  }, []);

  const profile = snap.profile;
  const completeness = profile?.completeness_score ?? 0;
  const missingRequired = profile?.missing_required_fields ?? [];
  const needsSetup =
    profile !== null &&
    activePersona !== null &&
    activePersona.persona_type !== 'admin' &&
    completeness < DEFAULT_AUTO_PROMPT_THRESHOLD;

  return {
    profile,
    state: snap.state,
    errorMessage: snap.errorMessage,
    completeness,
    needsSetup,
    missingRequired,
    save,
    uploadAvatar: uploadAvatarCb,
    selectPreset,
    clearAvatar: clearAvatarCb,
    refresh,
  };
}
