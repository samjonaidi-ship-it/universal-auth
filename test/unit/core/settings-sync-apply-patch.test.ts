// @samjonaidi-ship-it/universal-auth | test/unit/core/settings-sync-apply-patch.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2b — coverage for v1.0.1 lookback C8 (settings) + Phase D1 (profile):
//   * applySettingsPatch / getPendingSettingsPatch / discardPendingPatch
//   * applyProfilePatch  / getPendingProfilePatch

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hydrateSettings,
  updateSettings,
  flushSettingsNow,
  applySettingsPatch,
  getPendingSettingsPatch,
  discardPendingPatch,
  configureSettingsSync,
  __resetSettingsSyncForTests,
  getSettingsVersion,
} from '../../../src/core/settings-sync.js';
import {
  hydrateProfile,
  saveProfile,
  applyProfilePatch,
  getPendingProfilePatch,
  getProfileSnapshot,
  __resetProfileStoreForTests,
} from '../../../src/profile/profile-store.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const FULL_PROFILE = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  phone_e164: '+12065550000',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  emergency_contact: { name: 'Mom', phone_e164: '+12065550999', relationship: 'parent' },
  avatar_preset: 'crew-01',
  persona_extensions: {},
  completeness_score: 100,
  missing_required_fields: [],
  last_updated_at: '2026-04-25T00:00:00Z',
  profile_version: 3,
};

describe('core/settings-sync — applySettingsPatch / pending patch (v1.0.1 C8)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetSettingsSyncForTests();
    __resetEventReporterForTests();
    void __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    configureSettingsSync({ debounceMs: 5 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('409 conflict during PUT → getPendingSettingsPatch() returns the patch we tried', async () => {
    // Hydrate
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'dark' }, version: 1 })
    );
    await hydrateSettings();

    // PUT → 409, then re-hydrate GET succeeds
    fetchSpy.mockResolvedValueOnce(
      jsonResp(409, { code: 'SYNC_CONFLICT', message: 'version mismatch' })
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'system' }, version: 9 })
    );

    updateSettings({ theme: 'light' });
    await flushSettingsNow();

    const pending = getPendingSettingsPatch();
    expect(pending).toEqual({ theme: 'light' });
    expect(getSettingsVersion()).toBe(9);
  });

  it('applySettingsPatch(merged) clears pending state on next successful PUT + retries', async () => {
    // Hydrate
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'dark' }, version: 1 })
    );
    await hydrateSettings();

    // First PUT 409
    fetchSpy.mockResolvedValueOnce(
      jsonResp(409, { code: 'SYNC_CONFLICT', message: 'version mismatch' })
    );
    // Re-hydrate after conflict
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'system' }, version: 9 })
    );

    updateSettings({ theme: 'light' });
    await flushSettingsNow();
    expect(getPendingSettingsPatch()).toEqual({ theme: 'light' });

    // Consumer rebases → applies the merged patch → triggers a new PUT
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'light' }, version: 10 })
    );

    applySettingsPatch({ theme: 'light' });
    await flushSettingsNow();

    // After successful PUT, pending patch is cleared (settings-sync clears it
    // on successful flush — see flushWrite() success branch).
    expect(getPendingSettingsPatch()).toBeNull();
    expect(getSettingsVersion()).toBe(10);
  });

  it('discardPendingPatch leaves no pending patch', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'dark' }, version: 1 })
    );
    await hydrateSettings();

    fetchSpy.mockResolvedValueOnce(
      jsonResp(409, { code: 'SYNC_CONFLICT', message: 'version mismatch' })
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'system' }, version: 9 })
    );

    updateSettings({ theme: 'light' });
    await flushSettingsNow();
    expect(getPendingSettingsPatch()).not.toBeNull();

    discardPendingPatch();
    expect(getPendingSettingsPatch()).toBeNull();
  });
});

describe('profile/profile-store — applyProfilePatch / pending patch (Phase D1)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetProfileStoreForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('409 conflict during saveProfile → getPendingProfilePatch() returns the patch we tried', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();

    // PUT 409, then re-hydrate GET succeeds with new server profile
    fetchSpy.mockResolvedValueOnce(
      jsonResp(409, { code: 'SYNC_CONFLICT', message: 'version mismatch' })
    );
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { ...FULL_PROFILE, display_name: 'Sam-server', profile_version: 7 })
    );

    await expect(saveProfile({ display_name: 'Sam-local' })).rejects.toBeDefined();

    const pending = getPendingProfilePatch();
    expect(pending).toEqual({ display_name: 'Sam-local' });
  });

  it('applyProfilePatch merges patch into local snapshot without a network call', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();

    const before = fetchSpy.mock.calls.length;
    applyProfilePatch({ display_name: 'Sam-merged' });
    const after = fetchSpy.mock.calls.length;

    // No new fetch fired — applyProfilePatch is local-merge only.
    expect(after).toBe(before);
    const snap = getProfileSnapshot();
    expect(snap.profile?.display_name).toBe('Sam-merged');
  });

  it('successful saveProfile after a 409 clears the pending profile patch', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();

    // 1st save: 409
    fetchSpy.mockResolvedValueOnce(
      jsonResp(409, { code: 'SYNC_CONFLICT', message: 'version mismatch' })
    );
    // re-hydrate after conflict
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { ...FULL_PROFILE, profile_version: 7 })
    );

    await expect(saveProfile({ display_name: 'attempt-1' })).rejects.toBeDefined();
    expect(getPendingProfilePatch()).toEqual({ display_name: 'attempt-1' });

    // 2nd save: success → pending patch must clear.
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { ...FULL_PROFILE, display_name: 'attempt-2', profile_version: 8 })
    );
    await saveProfile({ display_name: 'attempt-2' });

    expect(getPendingProfilePatch()).toBeNull();
  });
});
