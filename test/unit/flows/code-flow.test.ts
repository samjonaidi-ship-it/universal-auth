// @bb/universal-auth | test/unit/flows/code-flow.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A2 — code-first sign-in happy path + session install.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestCode, verifyCode } from '../../../src/flows/code-flow.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  hasLiveAccessToken,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('flows/code-flow', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    void __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResp(200, { ok: true }))
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('requestCode POSTs to /auth/v1/code/request with appId', async () => {
    await requestCode({ destination: '+15555550100', channel: 'sms' });
    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/v1/code/request')
    );
    expect(call).toBeDefined();
    const body = JSON.parse(String((call![1] as RequestInit).body));
    expect(body.app_id).toBe('bb_express');
    expect(body.destination).toBe('+15555550100');
    expect(body.channel).toBe('sms');
  });

  it('verifyCode installs the session on 2xx', async () => {
    fetchSpy.mockReset();
    fetchSpy.mockImplementation((url) => {
      if (String(url).endsWith('/auth/v1/code/verify')) {
        return Promise.resolve(
          jsonResp(200, {
            access_token: 'at-new',
            refresh_token: 'rt-new',
            session_id: 's-new',
            expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            identity: { identity_id: 'id1', identity_kind: 'human', display_name: 'Sam' },
            aggregate: { features: [], app_access: ['bb_express'] },
            session_meta: {
              session_id: 's-new',
              issued_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            },
          })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    const { session } = await verifyCode({ destination: '+15555550100', code: '123456' });
    expect(session.identity.identity_id).toBe('id1');
    expect(hasLiveAccessToken()).toBe(true);
  });
});
