// @bainbridgebuilders/universal-auth | test/unit/flows/recovery.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  signOut,
  signOutEverywhere,
  listSessions,
  revokeSession,
} from '../../../src/flows/recovery.js';
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

describe('flows/recovery', () => {
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
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('signOut posts to /session/revoke + clears local session', async () => {
    await installSession();
    expect(hasLiveAccessToken()).toBe(true);
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await signOut();
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain('/auth/v1/session/revoke');
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('signOut clears local even when server fails', async () => {
    await installSession();
    fetchSpy.mockRejectedValueOnce(new Error('network'));
    await signOut();
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('signOutEverywhere posts to /session/revoke-all', async () => {
    await installSession();
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await signOutEverywhere();
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain('/auth/v1/session/revoke-all');
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('listSessions returns the sessions array', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        sessions: [
          {
            session_id: 's1',
            device_id: 'd1',
            user_agent_summary: 'Chrome',
            created_at: '2026-01-01T00:00:00Z',
            last_seen_at: '2026-01-02T00:00:00Z',
            current: true,
          },
        ],
      })
    );
    const result = await listSessions();
    expect(result).toHaveLength(1);
    expect(result[0]!.current).toBe(true);
  });

  it('revokeSession posts session id', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await revokeSession('s2');
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain('/auth/v1/sessions/revoke');
    const body = JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
    expect(body.session_id).toBe('s2');
  });
});
