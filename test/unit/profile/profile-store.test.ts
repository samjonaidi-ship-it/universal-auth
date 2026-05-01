// @bainbridgebuilders/universal-auth | test/unit/profile/profile-store.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hydrateProfile,
  saveProfile,
  applyAvatarUpdate,
  getProfileSnapshot,
  onProfileChange,
  __resetProfileStoreForTests,
} from '../../../src/profile/profile-store.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

const BASE = 'https://ct-bff.test';

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

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('profile/profile-store', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetProfileStoreForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('initial snapshot is loading + null', () => {
    const s = getProfileSnapshot();
    expect(s.profile).toBeNull();
    expect(s.state).toBe('loading');
  });

  it('hydrateProfile populates state + transitions to ready', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();
    const s = getProfileSnapshot();
    expect(s.state).toBe('ready');
    expect(s.profile?.display_name).toBe('Sam');
  });

  it('hydrateProfile transitions to error on failure', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(500, { code: 'SERVER_ERROR', message: 'oops' }));
    await hydrateProfile();
    const s = getProfileSnapshot();
    expect(s.state).toBe('error');
    expect(s.errorMessage).not.toBeNull();
  });

  it('saveProfile sends If-Match + updates store', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ...FULL_PROFILE, profile_version: 4, display_name: 'Sammy' }));
    const updated = await saveProfile({ display_name: 'Sammy' });
    expect(updated.display_name).toBe('Sammy');
    expect(updated.profile_version).toBe(4);

    const putCall = fetchSpy.mock.calls.find(
      ([, init]) => (init as RequestInit).method === 'PUT'
    );
    const headers = (putCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers['If-Match']).toBe('3');
  });

  it('saveProfile rejects locally when enforceRequired + missing required field', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ...FULL_PROFILE, phone_e164: '' }));
    await hydrateProfile();
    await expect(
      saveProfile({ display_name: 'Sam' }, { activePersona: 'crew', enforceRequired: true })
    ).rejects.toThrow(/Required field/);
  });

  it('saveProfile rehydrates on 409 conflict', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();

    fetchSpy.mockResolvedValueOnce(jsonResp(409, { code: 'SYNC_CONFLICT', message: 'version mismatch' }));
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ...FULL_PROFILE, profile_version: 9 }));

    await expect(saveProfile({ display_name: 'X' })).rejects.toThrow();
    expect(getProfileSnapshot().state).toBe('error');
  });

  it('onProfileChange listener fires on state changes', async () => {
    const listener = vi.fn();
    const unsubscribe = onProfileChange(listener);
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('applyAvatarUpdate mutates the local profile', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, FULL_PROFILE));
    await hydrateProfile();
    applyAvatarUpdate({ avatar_url: 'https://r2/x.jpg', profile_version: 5 });
    const s = getProfileSnapshot();
    expect(s.profile?.avatar_url).toBe('https://r2/x.jpg');
    expect(s.profile?.profile_version).toBe(5);
  });

  it('saveProfile throws when called before hydrate', async () => {
    await expect(saveProfile({ display_name: 'Sam' })).rejects.toThrow(/before hydrateProfile/);
  });
});
