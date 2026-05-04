// @samjonaidi-ship-it/universal-auth | test/unit/profile/profile-store-seed.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2a coverage push: exercise the test-only seed helper + adjacent
// branches in profile-store.ts that the un-skipped component tests don't
// directly cover (applyProfilePatch null-guard, applyAvatarUpdate null-guard,
// getPendingProfilePatch when nothing pending, saveProfile pre-hydrate guard).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyProfilePatch,
  applyAvatarUpdate,
  getProfileSnapshot,
  getPendingProfilePatch,
  onProfileChange,
  saveProfile,
  __resetProfileStoreForTests,
  __seedProfileForTests,
} from '../../../src/profile/profile-store.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import type { UniversalProfile } from '../../../src/types/profile.js';

const BASE: UniversalProfile = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 50,
  missing_required_fields: [],
  last_updated_at: '2026-05-04T00:00:00Z',
  profile_version: 1,
};

describe('profile-store seed + edge branches', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetProfileStoreForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.4',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('__seedProfileForTests sets profile to ready and notifies listeners', () => {
    let notified = 0;
    const unsub = onProfileChange(() => {
      notified += 1;
    });
    __seedProfileForTests(BASE);
    const snap = getProfileSnapshot();
    expect(snap.profile?.identity_id).toBe('sam');
    expect(snap.state).toBe('ready');
    expect(snap.errorMessage).toBeNull();
    expect(notified).toBeGreaterThan(0);
    unsub();
  });

  it('applyProfilePatch is a no-op when no profile is loaded', () => {
    // No seed → profile is null. applyProfilePatch should NOT crash.
    applyProfilePatch({ display_name: 'Other' });
    const snap = getProfileSnapshot();
    expect(snap.profile).toBeNull();
  });

  it('applyProfilePatch merges into the existing profile after seed', () => {
    __seedProfileForTests(BASE);
    applyProfilePatch({ display_name: 'Renamed' });
    const snap = getProfileSnapshot();
    expect(snap.profile?.display_name).toBe('Renamed');
    // profile_version preserved (caller-side merge does not touch it)
    expect(snap.profile?.profile_version).toBe(1);
  });

  it('getPendingProfilePatch returns null when no conflict has occurred', () => {
    __seedProfileForTests(BASE);
    expect(getPendingProfilePatch()).toBeNull();
  });

  it('applyAvatarUpdate is a no-op when no profile is loaded', () => {
    applyAvatarUpdate({ avatar_url: 'https://x', profile_version: 2 });
    expect(getProfileSnapshot().profile).toBeNull();
  });

  it('applyAvatarUpdate updates avatar_url + profile_version when profile is loaded', () => {
    __seedProfileForTests(BASE);
    applyAvatarUpdate({ avatar_url: 'https://example/a.jpg', profile_version: 9 });
    const snap = getProfileSnapshot();
    expect(snap.profile?.avatar_url).toBe('https://example/a.jpg');
    expect(snap.profile?.profile_version).toBe(9);
  });

  it('applyAvatarUpdate updates avatar_preset when only preset is provided', () => {
    __seedProfileForTests(BASE);
    applyAvatarUpdate({ avatar_preset: 'compass', profile_version: 5 });
    const snap = getProfileSnapshot();
    expect(snap.profile?.avatar_preset).toBe('compass');
    expect(snap.profile?.profile_version).toBe(5);
  });

  it('saveProfile throws when called before hydrateProfile completes', async () => {
    // No seed → profile is null → guard at the top of saveProfile fires.
    await expect(saveProfile({ display_name: 'X' })).rejects.toThrow(
      /saveProfile called before hydrateProfile/
    );
  });

  it('saveProfile rethrows network error and sets state=error', async () => {
    __seedProfileForTests(BASE);
    fetchSpy.mockImplementation(() =>
      Promise.reject(new Error('network down'))
    );
    await expect(saveProfile({ display_name: 'X' })).rejects.toThrow();
    const snap = getProfileSnapshot();
    expect(snap.state).toBe('error');
    expect(snap.errorMessage).toMatch(/network down/);
  });

  it('saveProfile early-rejects with enforceRequired when patch leaves a required field empty', async () => {
    // Active persona = crew → display_name + email + phone_e164 + emergency_contact + avatar required.
    // Seed a profile that has them, then patch display_name to ''.
    __seedProfileForTests({
      ...BASE,
      phone_e164: '+12065550000',
      emergency_contact: { name: 'M', phone_e164: '+12065550999', relationship: 'parent' },
      avatar_preset: 'compass',
    });
    await expect(
      saveProfile(
        { display_name: '' },
        { activePersona: 'crew', enforceRequired: true }
      )
    ).rejects.toThrow(/Required field/);
    // Did NOT touch network
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
