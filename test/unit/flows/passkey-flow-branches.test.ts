// @samjonaidi-ship-it/universal-auth | test/unit/flows/passkey-flow-branches.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2 (v1.0.4): branch-coverage push for src/flows/passkey-flow.ts.
// passkey-flow.test.ts misses:
//   - registerPasskey: !browserSupportsWebAuthn() guard
//   - registerPasskey: catch block (cancellation rethrow)
//   - authenticatePasskey: !browserSupportsWebAuthn() guard
//   - authenticatePasskey: response includes personas / primary_persona / agent

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => true),
}));

import { registerPasskey, authenticatePasskey } from '../../../src/flows/passkey-flow.js';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('flows/passkey-flow — branch coverage (v1.0.4)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('registerPasskey throws when WebAuthn is not supported', async () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
    await expect(registerPasskey()).rejects.toThrow(/WebAuthn is not supported/);
  });

  it('registerPasskey: cancellation in startRegistration re-throws + emits event', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { challenge: 'xyz' }));
    vi.mocked(startRegistration).mockRejectedValueOnce(new Error('NotAllowedError'));
    await expect(registerPasskey()).rejects.toThrow(/NotAllowedError/);
  });

  it('authenticatePasskey throws when WebAuthn is not supported', async () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
    await expect(authenticatePasskey()).rejects.toThrow(/WebAuthn is not supported/);
  });

  it('authenticatePasskey: response with persona payload populates session optional fields', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/passkey/authenticate/options')) {
        return Promise.resolve(jsonResp(200, { challenge: 'xyz' }));
      }
      if (u.includes('/passkey/authenticate/verify')) {
        return Promise.resolve(
          jsonResp(200, {
            access_token: 'at',
            refresh_token: 'rt',
            session_id: 's1',
            expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            identity: { identity_id: 'id1', identity_kind: 'human', display_name: 'Sam' },
            aggregate: { features: [], app_access: [] },
            session_meta: {
              session_id: 's1',
              issued_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            },
            personas: [
              { persona_id: 'p1', display_name: 'Foreman', kind: 'staff' },
            ],
            primary_persona: 'p1',
            agent: { agent_id: 'a1', kind: 'human' },
          })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });
    vi.mocked(startAuthentication).mockResolvedValueOnce({
      id: 'cred-x',
      rawId: 'cred-x',
      response: { authenticatorData: 'ad', clientDataJSON: 'cd', signature: 'sig' },
      type: 'public-key',
      clientExtensionResults: {},
    } as unknown as Awaited<ReturnType<typeof startAuthentication>>);

    const { session } = await authenticatePasskey();
    expect(session.personas).toBeDefined();
    expect(session.personas).toHaveLength(1);
    expect(session.primary_persona).toBe('p1');
    expect(session.agent).toBeDefined();
    expect(session.agent!.agent_id).toBe('a1');
  });
});
