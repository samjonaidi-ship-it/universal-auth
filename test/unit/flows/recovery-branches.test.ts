// @samjonaidi-ship-it/universal-auth | test/unit/flows/recovery-branches.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2 (v1.0.4): branch-coverage push for src/flows/recovery.ts.
// Existing recovery.test.ts covers the happy paths + the OUTER server-revoke
// failure on signOut, but leaves three branches uncovered:
//   1. signOut: inner catch — flushSettingsNow() throws (lost-patch path)
//   2. signOutEverywhere: inner catch — flushSettingsNow() throws
//   3. signOutEverywhere: outer catch — server revoke-all rejects
// These tests exercise those exact branches by mocking settings-sync.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/core/settings-sync.js', async (importActual) => {
  const actual = await importActual<typeof import('../../../src/core/settings-sync.js')>();
  return {
    ...actual,
    flushSettingsNow: vi.fn(async () => {
      // Default no-op; individual tests override per-call.
    }),
  };
});

import { signOut, signOutEverywhere } from '../../../src/flows/recovery.js';
import { flushSettingsNow } from '../../../src/core/settings-sync.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  hasLiveAccessToken,
  setSession,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { __resetEntitlementsForTests } from '../../../src/core/entitlements.js';

const BASE = 'https://ct-bff.test';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function installSession(): Promise<void> {
  await setSession({
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 60_000,
    sessionId: 's1',
  });
}

describe('flows/recovery — branch coverage (v1.0.4)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetEntitlementsForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(flushSettingsNow).mockReset();
    vi.mocked(flushSettingsNow).mockResolvedValue(undefined);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('signOut: swallows flushSettingsNow rejection and still revokes', async () => {
    await installSession();
    vi.mocked(flushSettingsNow).mockRejectedValueOnce(new Error('flush blew up'));
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));

    await expect(signOut()).resolves.toBeUndefined();

    // server revoke still attempted
    expect(fetchSpy).toHaveBeenCalled();
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain('/auth/v1/session/revoke');
    // local cleanup happened
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('signOut: flush throws AND server fails — local cleanup still runs', async () => {
    await installSession();
    vi.mocked(flushSettingsNow).mockRejectedValueOnce(new Error('flush failed'));
    fetchSpy.mockRejectedValueOnce(new Error('network down'));

    await expect(signOut()).resolves.toBeUndefined();
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('signOutEverywhere: swallows flushSettingsNow rejection and still revokes-all', async () => {
    await installSession();
    vi.mocked(flushSettingsNow).mockRejectedValueOnce(new Error('flush blew up'));
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));

    await expect(signOutEverywhere()).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalled();
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain('/auth/v1/session/revoke-all');
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('signOutEverywhere: server failure triggers outer catch + local cleanup', async () => {
    await installSession();
    fetchSpy.mockRejectedValueOnce(new Error('network down'));

    await expect(signOutEverywhere()).resolves.toBeUndefined();
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('signOutEverywhere: flush throws AND server fails — local cleanup still runs', async () => {
    await installSession();
    vi.mocked(flushSettingsNow).mockRejectedValueOnce(new Error('flush failed'));
    fetchSpy.mockRejectedValueOnce(new Error('network down'));

    await expect(signOutEverywhere()).resolves.toBeUndefined();
    expect(hasLiveAccessToken()).toBe(false);
  });
});
