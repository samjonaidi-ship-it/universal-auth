// @bb/universal-auth | src/react/useSettingsSync.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Hook around core/settings-sync — keeps consumer state in sync with the SDK store.

import { useEffect, useState, useCallback } from 'react';
import {
  getSettings,
  getSettingsVersion,
  updateSettings as updateSettingsFn,
  onSettingsChange,
  hydrateSettings,
  type SettingsShape,
} from '../core/settings-sync.js';

export interface UseSettingsSyncReturn {
  settings: SettingsShape;
  version: number;
  update: (patch: SettingsShape) => void;
  /** Force a fresh GET — also called automatically on mount. */
  hydrate: () => Promise<void>;
}

export function useSettingsSync(): UseSettingsSyncReturn {
  const [settings, setSettings] = useState<SettingsShape>(() => ({ ...getSettings() }));
  const [version, setVersion] = useState<number>(() => getSettingsVersion());

  useEffect(() => {
    const unsubscribe = onSettingsChange((next) => {
      setSettings({ ...next });
      setVersion(getSettingsVersion());
    });
    void hydrateSettings()
      .then(() => {
        setSettings({ ...getSettings() });
        setVersion(getSettingsVersion());
      })
      .catch(() => {
        // hydration failed — local state stays at last known value
      });
    return unsubscribe;
  }, []);

  const update = useCallback((patch: SettingsShape): void => {
    updateSettingsFn(patch);
  }, []);

  const hydrate = useCallback(async (): Promise<void> => {
    await hydrateSettings();
    setSettings({ ...getSettings() });
    setVersion(getSettingsVersion());
  }, []);

  return { settings, version, update, hydrate };
}
