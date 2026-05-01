// @bainbridgebuilders/universal-auth | test/unit/core/settings-sync.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A2 — debounced PUT with If-Match + 409 conflict handling.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureSettingsSync,
  updateSettings,
  flushSettingsNow,
  hydrateSettings,
  getSettings,
  getSettingsVersion,
  __resetSettingsSyncForTests,
} from '../../../src/core/settings-sync.js';
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

describe('core/settings-sync', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetSettingsSyncForTests();
    __resetEventReporterForTests();
    void __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    configureSettingsSync({ debounceMs: 20 });  // fast debounce for tests
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('hydrates from GET /identity/v1/settings', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'dark' }, version: 7 })
    );
    await hydrateSettings();
    expect(getSettings()).toEqual({ theme: 'dark' });
    expect(getSettingsVersion()).toBe(7);
  });

  it('debounced PUT carries If-Match header with current version', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'light' }, version: 3 })
    );
    await hydrateSettings();

    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'dark' }, version: 4 })
    );
    updateSettings({ theme: 'dark' });
    await flushSettingsNow();

    const putCall = fetchSpy.mock.calls.find(
      ([, init]) => (init as RequestInit).method === 'PUT'
    );
    expect(putCall).toBeDefined();
    const headers = (putCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers['If-Match']).toBe('3');
  });

  it('applies optimistic update synchronously', () => {
    updateSettings({ locale: 'en' });
    expect(getSettings()).toEqual({ locale: 'en' });
  });

  it('preserves local patch on 409 conflict (v1.0.1 C8 — caller rebases)', async () => {
    // Initial hydrate
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'dark' }, version: 1 })
    );
    await hydrateSettings();

    // PUT returns 409
    fetchSpy.mockResolvedValueOnce(
      jsonResp(409, { code: 'SYNC_CONFLICT', message: 'version mismatch' })
    );
    // Then rehydrate GET succeeds with new server state
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { settings: { theme: 'system' }, version: 9 })
    );

    updateSettings({ theme: 'light' });
    await flushSettingsNow();

    // v1.0.1 C8: do NOT silently drop the user's pending patch. Local state
    // keeps the in-progress edit; the SDK emits sync.conflict with both
    // pendingPatch and serverState so consumers can rebase via
    // applySettingsPatch(). The version pointer DOES advance to the server's
    // value so subsequent saves carry the right If-Match.
    expect(getSettingsVersion()).toBe(9);
    expect(getSettings()).toEqual({ theme: 'light' });
  });
});
