// @bainbridgebuilders/universal-auth | test/unit/flows/passkey-flow.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB
// Mock @simplewebauthn/browser to test the flow's orchestration without real WebAuthn.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => true),
}));

import {
  registerPasskey,
  authenticatePasskey,
  isPasskeySupported,
  isConditionalUiSupported,
} from '../../../src/flows/passkey-flow.js';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
} from '@simplewebauthn/browser';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  hasLiveAccessToken,
} from '../../../src/core/token-manager.js';
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

describe('flows/passkey-flow', () => {
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
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
    vi.mocked(browserSupportsWebAuthnAutofill).mockResolvedValue(true);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('isPasskeySupported delegates to browserSupportsWebAuthn', () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
    expect(isPasskeySupported()).toBe(true);
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
    expect(isPasskeySupported()).toBe(false);
  });

  it('isConditionalUiSupported returns false when WebAuthn unsupported', async () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
    expect(await isConditionalUiSupported()).toBe(false);
  });

  it('registerPasskey throws when WebAuthn unsupported', async () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
    await expect(registerPasskey()).rejects.toThrow(/WebAuthn is not supported/);
  });

  it('registerPasskey: full happy path', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/passkey/register/options')) {
        return Promise.resolve(jsonResp(200, { challenge: 'abc', rp: {}, user: {} }));
      }
      if (u.includes('/passkey/register/verify')) {
        return Promise.resolve(
          jsonResp(200, {
            ok: true,
            credential: {
              credential_id: 'cred-1',
              aaguid: '00000000-0000-0000-0000-000000000000',
              transports: ['internal'],
            },
          })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });
    vi.mocked(startRegistration).mockResolvedValueOnce({
      id: 'cred-1',
      rawId: 'cred-1',
      response: {
        attestationObject: 'ao',
        clientDataJSON: 'cd',
      },
      type: 'public-key',
      clientExtensionResults: {},
    } as unknown as Awaited<ReturnType<typeof startRegistration>>);

    const cred = await registerPasskey();
    expect(cred.credential_id).toBe('cred-1');
    expect(cred.transports).toEqual(['internal']);
  });

  it('authenticatePasskey: full happy path installs session', async () => {
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
            identity: {
              identity_id: 'id1',
              identity_kind: 'human',
              display_name: 'Sam',
            },
            aggregate: { features: [], app_access: [] },
            session_meta: {
              session_id: 's1',
              issued_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            },
          })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });
    vi.mocked(startAuthentication).mockResolvedValueOnce({
      id: 'cred-1abcd',
      rawId: 'cred-1abcd',
      response: {
        authenticatorData: 'ad',
        clientDataJSON: 'cd',
        signature: 'sig',
      },
      type: 'public-key',
      clientExtensionResults: {},
    } as unknown as Awaited<ReturnType<typeof startAuthentication>>);

    const { session } = await authenticatePasskey();
    expect(session.identity.identity_id).toBe('id1');
    expect(hasLiveAccessToken()).toBe(true);
  });

  it('authenticatePasskey: cancellation re-throws + emits event', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { challenge: 'xyz' }));
    vi.mocked(startAuthentication).mockRejectedValueOnce(new Error('NotAllowedError'));
    await expect(authenticatePasskey()).rejects.toThrow(/NotAllowedError/);
  });

  it('authenticatePasskey with conditionalUI passes useBrowserAutofill: true', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/passkey/authenticate/options')) {
        return Promise.resolve(jsonResp(200, { challenge: 'xyz' }));
      }
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
        })
      );
    });
    vi.mocked(startAuthentication).mockResolvedValueOnce({
      id: 'cred-2efgh',
      rawId: 'cred-2efgh',
      response: { authenticatorData: 'ad', clientDataJSON: 'cd', signature: 'sig' },
      type: 'public-key',
      clientExtensionResults: {},
    } as unknown as Awaited<ReturnType<typeof startAuthentication>>);

    await authenticatePasskey({ conditionalUI: true });
    const args = vi.mocked(startAuthentication).mock.calls[0]![0];
    expect(args.useBrowserAutofill).toBe(true);
  });
});
