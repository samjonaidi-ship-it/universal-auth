// @samjonaidi-ship-it/universal-auth | test/unit/flows/passkey-flow.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB
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

  // P1-H helper: build a valid authenticatorData base64url with UV flag set/unset.
  function authDataB64Url(uvBit: boolean): string {
    // 32 bytes rpIdHash (zeros) + 1 byte flags + 4 bytes signCount = 37 bytes
    const bytes = new Uint8Array(37);
    // UP=0x01 always set on a real authenticator response; OR UV=0x04 if requested.
    bytes[32] = 0x01 | (uvBit ? 0x04 : 0x00);
    // base64url encode
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

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
        authenticatorData: authDataB64Url(true),  // P1-H: UV bit set
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
      response: { authenticatorData: authDataB64Url(true), clientDataJSON: 'cd', signature: 'sig' },
      type: 'public-key',
      clientExtensionResults: {},
    } as unknown as Awaited<ReturnType<typeof startAuthentication>>);

    await authenticatePasskey({ conditionalUI: true });
    const args = vi.mocked(startAuthentication).mock.calls[0]![0];
    expect(args.useBrowserAutofill).toBe(true);
  });

  // ── P1-H: UV (User Verification) enforcement ─────────────────────────────

  it('authenticatePasskey rejects server options with userVerification:"discouraged"', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { challenge: 'xyz', userVerification: 'discouraged' }),
    );
    await expect(authenticatePasskey()).rejects.toThrow(/discouraged/i);
    // startAuthentication MUST NOT be invoked when policy is discouraged
    expect(vi.mocked(startAuthentication)).not.toHaveBeenCalled();
  });

  it('authenticatePasskey rejects assertion with UV bit unset when policy demands UV', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/passkey/authenticate/options')) {
        // userVerification omitted → defaults to "preferred" → UV demanded
        return Promise.resolve(jsonResp(200, { challenge: 'xyz' }));
      }
      // /verify should NEVER be hit — the SDK must reject before submit
      return Promise.resolve(jsonResp(500, { error: 'should-not-be-called' }));
    });
    vi.mocked(startAuthentication).mockResolvedValueOnce({
      id: 'cred-no-uv',
      rawId: 'cred-no-uv',
      response: {
        authenticatorData: authDataB64Url(false), // UV bit UNSET
        clientDataJSON: 'cd',
        signature: 'sig',
      },
      type: 'public-key',
      clientExtensionResults: {},
    } as unknown as Awaited<ReturnType<typeof startAuthentication>>);

    await expect(authenticatePasskey()).rejects.toThrow(
      /did not perform user verification/i,
    );

    // Confirm the verify endpoint was never called
    const verifyCalls = fetchSpy.mock.calls.filter(([u]) =>
      String(u).includes('/passkey/authenticate/verify'),
    );
    expect(verifyCalls.length).toBe(0);
  });

  it('registerPasskey rejects server options with userVerification:"discouraged"', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        challenge: 'abc',
        rp: {},
        user: {},
        authenticatorSelection: { userVerification: 'discouraged' },
      }),
    );
    await expect(registerPasskey()).rejects.toThrow(/discouraged/i);
    expect(vi.mocked(startRegistration)).not.toHaveBeenCalled();
  });
});
