// @bb/universal-auth | test/integration/06-settings-conflict.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Integration test #6 per spec §11.3 — settings 409 conflict + rehydrate.
//
// Scenario: two clients (or same identity, two tabs) edit settings concurrently.
// Server uses If-Match optimistic locking → second writer gets 409.
// SDK should rehydrate and surface sync.conflict event.

import { describe, it, expect, beforeEach } from 'vitest';
import { bff, signInSeeded } from './helpers.js';
import {
  configureSettingsSync,
  hydrateSettings,
  updateSettings,
  flushSettingsNow,
  getSettings,
  getSettingsVersion,
  __resetSettingsSyncForTests,
} from '../../src/core/settings-sync.js';
import { configureClient, __resetClientForTests } from '../../src/core/client.js';
import { __resetTokenManagerForTests, setSession } from '../../src/core/token-manager.js';
import { __resetDbForTests } from '../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../src/core/event-reporter.js';
import { BFF_BASE_URL } from './setup.js';

describe('Integration #6 — settings 409 conflict + rehydrate (§11.3, §3.3)', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetSettingsSyncForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: BFF_BASE_URL,
      appId: 'bb_integration_test',
      sdkVersion: '1.0.0-rc.1-test',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    configureSettingsSync({ debounceMs: 20 });
  });

  it('concurrent writers — second one gets 409, SDK rehydrates', async () => {
    const session = await signInSeeded('test-crew-1');
    await setSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: Date.now() + 60_000,
      sessionId: session.sessionId,
    });

    // Hydrate from server
    await hydrateSettings();
    const v0 = getSettingsVersion();

    // Simulate "another tab" by making a direct PUT with the SAME version
    // BUT a different value — this advances server version to v0+1
    const sneakyPut = await bff<{ version: number }>('/identity/v1/settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'If-Match': String(v0),
      },
      cookie: session.cookie,
      body: { settings: { from_other_tab: true } },
    });
    expect(sneakyPut.status).toBe(200);
    expect(sneakyPut.body.version).toBe(v0 + 1);

    // Now the SDK tries to save its own change with stale version v0 →
    // server returns 409 → SDK rehydrates + emits sync.conflict
    updateSettings({ from_sdk: true });
    await flushSettingsNow();

    // After conflict + rehydrate, version should reflect server's latest
    expect(getSettingsVersion()).toBeGreaterThanOrEqual(v0 + 1);
    expect(getSettings()).toMatchObject({ from_other_tab: true });
  });
});
