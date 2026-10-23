// @samjonaidi-ship-it/universal-auth | test/unit/core/client-dpop-binding.test.ts | v1.1.1 | 2026-10-22 | BB
// v1.1.1: pins v1.6.3 (Devin on PR #48) — a repeated NESTED challenge on the
// real refresh path surfaces code USE_DPOP_NONCE, not code:undefined.
// v1.1.0: + v1.6.0 nonce-challenge coverage on the REAL refresh path —
// challenge → retry with nonce → success, both wire shapes, the single-retry
// cap, and the stray-DPoP-Nonce-header guard.
//
// P4.6 — DPoP proofs on the calls that actually establish and preserve the
// binding.
//
// Before this, four of the six endpoints in DPOP_PROTECTED_ENDPOINTS could
// never receive a proof:
//
//   /auth/v1/code/verify                  \
//   /auth/v1/passkey/authenticate/verify   > anonymous:true, no access token,
//   /auth/v1/enroll/activate              /  and the gate required a token
//   /auth/v1/session/refresh                 built its own fetch, bypassing
//                                            the gate entirely
//
// Only /session/revoke and /session/revoke-all — which run with a token —
// ever sent one. The BFF stores the proof's thumbprint as `cnf_jkt` at every
// mint site, so with no proof at mint every production session is unbound.
//
// NOTE on the pre-existing test in client-dpop.test.ts named "attaches
// Authorization: DPoP + DPoP header on /auth/v1/session/refresh": it calls
// post('/auth/v1/session/refresh') DIRECTLY with a live access token already
// set. That is not how a refresh happens — the real path is getAccessToken()
// → performRefresh() → refreshTokenRequest(), which builds its own fetch. The
// test proves the path matcher fires; it never covered the refresh. The
// refresh test below drives the real path.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureClient,
  post,
  __resetClientForTests,
} from '../../../src/core/client.js';
import {
  setSession,
  getAccessToken,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests, getRefreshToken } from '../../../src/core/storage.js';
import { clearDeviceIdCache } from '../../../src/core/device-id.js';
import { __resetNonceCacheForTests } from '../../../src/core/dpop/nonce-cache.js';
import { AuthSdkError } from '../../../src/errors.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function b64urlDecodeToString(seg: string): string {
  const pad = seg.length % 4 === 0 ? 0 : 4 - (seg.length % 4);
  const b64 = (seg + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') return atob(b64);
  return Buffer.from(b64, 'base64').toString('binary');
}

function decodeProof(proof: string): Record<string, unknown> {
  const parts = proof.split('.');
  if (parts.length !== 3) throw new Error('not a JWS-compact');
  return JSON.parse(b64urlDecodeToString(parts[1]!)) as Record<string, unknown>;
}

const headersOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  (spy.mock.calls[i]![1] as RequestInit).headers as Record<string, string>;

describe('P4.6 — DPoP on session-minting calls', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    clearDeviceIdCache();
    __resetNonceCacheForTests();
    configureClient({
      apiBaseUrl: BASE,
      appId: 'bb_express',
      sdkVersion: '1.1.0-rc.14',
      useDpop: 'auto',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const mintingEndpoints = [
    '/auth/v1/code/verify',
    '/auth/v1/passkey/authenticate/verify',
    '/auth/v1/enroll/activate',
  ];

  for (const endpoint of mintingEndpoints) {
    it(`attaches a DPoP proof on ${endpoint} even though it is anonymous`, async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await post(endpoint, { some: 'body' }, { anonymous: true });

      const headers = headersOf(fetchSpy);
      expect(headers.DPoP, 'a proof must be sent so the BFF can bind cnf_jkt').toBeTypeOf('string');
      expect(headers.DPoP!.split('.').length).toBe(3); // JWS-compact
    });
  }

  it('the minting proof is ath-LESS and carries no Authorization header', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await post('/auth/v1/code/verify', { code: '000000' }, { anonymous: true });

    const headers = headersOf(fetchSpy);
    // There is no access token at mint time, so there is nothing to bind `ath`
    // to and nothing to put in Authorization. RFC 9449 §4.2 makes ath
    // conditional, and the BFF verifier never reads it.
    expect(decodeProof(headers.DPoP!).ath).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it('the proof binds the right method and URL', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await post('/auth/v1/code/verify', { code: '000000' }, { anonymous: true });

    const payload = decodeProof(headersOf(fetchSpy).DPoP!);
    expect(payload.htm).toBe('POST');
    expect(payload.htu).toBe(`${BASE}/auth/v1/code/verify`);
  });

  it('still sends NO proof on an unprotected anonymous endpoint', async () => {
    // Guards against over-correcting: anonymous is not the trigger, being a
    // DPoP-protected endpoint is.
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await post('/auth/v1/code/request', { destination: 'x@y.z' }, { anonymous: true });
    expect(headersOf(fetchSpy).DPoP).toBeUndefined();
  });

  it('useDpop: "never" opts out of minting proofs too', async () => {
    __resetClientForTests();
    configureClient({
      apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.1.0-rc.14', useDpop: 'never',
    });
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await post('/auth/v1/code/verify', { code: '000000' }, { anonymous: true });
    expect(headersOf(fetchSpy).DPoP).toBeUndefined();
  });

  it('an authenticated protected call still gets Authorization: DPoP + ath', async () => {
    // Regression guard for the endpoints that already worked.
    await setSession({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: Date.now() + 15 * 60_000,
      sessionId: 's1',
    });
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await post('/auth/v1/session/revoke', { session_id: 's1' });

    const headers = headersOf(fetchSpy);
    expect(headers.Authorization).toBe('DPoP at-1');
    expect(decodeProof(headers.DPoP!).ath).toBeTypeOf('string');
  });
});

describe('P4.6 — DPoP on the REAL refresh path', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    clearDeviceIdCache();
    __resetNonceCacheForTests();
    configureClient({
      apiBaseUrl: BASE,
      appId: 'bb_express',
      sdkVersion: '1.1.0-rc.14',
      useDpop: 'auto',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // Drive refreshTokenRequest() the way production does — an expired access
  // token forces getAccessToken() through performRefresh().
  async function triggerRealRefresh() {
    await setSession({
      accessToken: 'at-stale',
      refreshToken: 'rt-1',
      expiresAt: Date.now() - 1000,
      sessionId: 's1',
    });
    fetchSpy.mockResolvedValueOnce(jsonResp(200, {
      access_token: 'at-2',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      refresh_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      session_id: 's1',
    }));
    return getAccessToken();
  }

  it('sends a DPoP proof on the refresh fetch', async () => {
    // Without this, binding sessions at mint would 401 every refresh — the
    // BFF takes its `if (boundJkt)` branch and requires a valid proof.
    expect(await triggerRealRefresh()).toBe('at-2');

    const call = fetchSpy.mock.calls.find(
      (c) => String(c[0]).endsWith('/auth/v1/session/refresh'),
    );
    expect(call, 'the refresh must have gone out').toBeTruthy();
    const headers = (call![1] as RequestInit).headers as Record<string, string>;
    expect(headers.DPoP).toBeTypeOf('string');
    expect(headers.DPoP!.split('.').length).toBe(3);
  });

  it('the refresh proof is ath-LESS — a refresh token is not an access token', async () => {
    await triggerRealRefresh();
    const call = fetchSpy.mock.calls.find(
      (c) => String(c[0]).endsWith('/auth/v1/session/refresh'),
    );
    const headers = (call![1] as RequestInit).headers as Record<string, string>;
    const payload = decodeProof(headers.DPoP!);
    expect(payload.ath).toBeUndefined();
    expect(payload.htm).toBe('POST');
    expect(payload.htu).toBe(`${BASE}/auth/v1/session/refresh`);
  });

  it('keeps the Idempotency-Key derived from the refresh token', async () => {
    // P3.1 leans on the BFF replaying the SAME key; adding DPoP must not
    // disturb it.
    await triggerRealRefresh();
    const call = fetchSpy.mock.calls.find(
      (c) => String(c[0]).endsWith('/auth/v1/session/refresh'),
    );
    const headers = (call![1] as RequestInit).headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeTypeOf('string');
    expect(headers['Idempotency-Key']!.length).toBeGreaterThan(0);
  });
});

describe('v1.6.0 — USE_DPOP_NONCE challenge on the REAL refresh path', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    clearDeviceIdCache();
    __resetNonceCacheForTests();
    configureClient({
      apiBaseUrl: BASE,
      appId: 'bb_express',
      sdkVersion: '1.1.0-rc.14',
      useDpop: 'auto',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const REFRESH = '/auth/v1/session/refresh';

  const refreshCalls = () =>
    fetchSpy.mock.calls.filter((c) => String(c[0]).endsWith(REFRESH));

  const refreshHeaders = (call: (typeof fetchSpy.mock.calls)[number]) =>
    (call[1] as RequestInit).headers as Record<string, string>;

  function nonceChallenge(body: unknown, nonce: string): Response {
    return new Response(JSON.stringify(body), {
      status: 401,
      headers: { 'content-type': 'application/json', 'DPoP-Nonce': nonce },
    });
  }

  const FLAT_CHALLENGE = {
    code: 'USE_DPOP_NONCE',
    message: 'DPoP nonce required — retry with nonce',
    protocol_version: 'v1',
  };

  function okRefreshBody() {
    return {
      access_token: 'at-2',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      refresh_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      session_id: 's1',
    };
  }

  // Drive refreshTokenRequest() the way production does — an expired access
  // token forces getAccessToken() through performRefresh(), queueing each
  // response in order for the fetches it makes.
  async function triggerRealRefresh(...responses: Response[]) {
    await setSession({
      accessToken: 'at-stale',
      refreshToken: 'rt-1',
      expiresAt: Date.now() - 1000,
      sessionId: 's1',
    });
    for (const r of responses) fetchSpy.mockResolvedValueOnce(r);
    return getAccessToken();
  }

  it('answers a FLAT {code: USE_DPOP_NONCE} challenge — retries once with the nonce in the proof', async () => {
    // The wire shape the BFF actually sends for a DpopError
    // (routes/auth-v1.js: reply.code(401).send({ code, message, protocol_version })).
    expect(await triggerRealRefresh(
      nonceChallenge(FLAT_CHALLENGE, 'server-nonce-1'),
      jsonResp(200, okRefreshBody()),
    )).toBe('at-2');

    const calls = refreshCalls();
    expect(calls.length).toBe(2);
    expect(decodeProof(refreshHeaders(calls[0]!).DPoP!).nonce).toBeUndefined();
    expect(decodeProof(refreshHeaders(calls[1]!).DPoP!).nonce).toBe('server-nonce-1');
  });

  it('answers the NESTED {error:{code}} challenge shape too', async () => {
    expect(await triggerRealRefresh(
      nonceChallenge(
        { error: { code: 'USE_DPOP_NONCE', message: 'use this nonce' } },
        'server-nonce-2',
      ),
      jsonResp(200, okRefreshBody()),
    )).toBe('at-2');

    const calls = refreshCalls();
    expect(calls.length).toBe(2);
    expect(decodeProof(refreshHeaders(calls[1]!).DPoP!).nonce).toBe('server-nonce-2');
  });

  it('keeps the same refresh-token-derived Idempotency-Key on the retry', async () => {
    // The retry is the same logical refresh; the server must see the SAME
    // dedupe key or a raced cross-tab refresh loses P3.1's dedupe window.
    await triggerRealRefresh(
      nonceChallenge(FLAT_CHALLENGE, 'server-nonce-3'),
      jsonResp(200, okRefreshBody()),
    );
    const calls = refreshCalls();
    expect(refreshHeaders(calls[0]!)['Idempotency-Key'])
      .toBe(refreshHeaders(calls[1]!)['Idempotency-Key']);
  });

  it('caps the nonce retry at ONE — a second challenge surfaces the error and keeps the token', async () => {
    await expect(triggerRealRefresh(
      nonceChallenge(FLAT_CHALLENGE, 'nonce-a'),
      nonceChallenge(FLAT_CHALLENGE, 'nonce-b'),
    )).rejects.toMatchObject({ code: 'USE_DPOP_NONCE' });

    expect(refreshCalls().length).toBe(2); // never a third try
    // USE_DPOP_NONCE is transient (isTerminalRefreshError), not a dead
    // credential — the refresh token must survive for the next attempt.
    expect(await getRefreshToken()).toBe('rt-1');
  });

  it('a repeated NESTED challenge on the refresh path surfaces code USE_DPOP_NONCE too', async () => {
    // v1.6.3 (Devin on PR #48): refreshTokenRequest's own error tail must
    // normalise the wrapped shape the same way finalizeFailedResponse does.
    const nested = () =>
      nonceChallenge({ error: { code: 'USE_DPOP_NONCE', message: 'again' } }, 'nn');
    await expect(triggerRealRefresh(nested(), nested())).rejects.toMatchObject({
      code: 'USE_DPOP_NONCE',
    });
    expect(refreshCalls().length).toBe(2);
  });

  it('does NOT retry a 401 whose DPoP-Nonce header rides on a non-challenge body', async () => {
    // A stray DPoP-Nonce on a session-expired 401 is informational; only a
    // USE_DPOP_NONCE body triggers the retry.
    await expect(triggerRealRefresh(
      nonceChallenge(
        { code: 'AUTH_SESSION_EXPIRED', message: 'expired', protocol_version: 'v1' },
        'stray-nonce',
      ),
    )).rejects.toMatchObject({ code: 'AUTH_SESSION_EXPIRED' });

    expect(refreshCalls().length).toBe(1);
  });
});

describe('P4.6 — DPoP failures are classified correctly on refresh', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await __resetDbForTests();
  });

  async function refreshFailingWith(code: string) {
    await setSession({
      accessToken: 'at-stale',
      refreshToken: 'rt-live',
      expiresAt: Date.now() - 1000,
      sessionId: 's1',
    });
    const { registerRefreshCallback } = await import('../../../src/core/token-manager.js');
    registerRefreshCallback(async () => {
      throw new AuthSdkError(code as never, `simulated ${code}`);
    });
    await expect(getAccessToken()).rejects.toMatchObject({ code });
  }

  it('INVALID_DPOP_BINDING is TERMINAL — the keypair is gone, retrying is futile', async () => {
    await refreshFailingWith('INVALID_DPOP_BINDING');
    expect(await getRefreshToken()).toBeNull();
  });

  it('INVALID_DPOP_HEADER is transient — a malformed proof is our bug, not a dead token', async () => {
    await refreshFailingWith('INVALID_DPOP_HEADER');
    expect(await getRefreshToken()).toBe('rt-live');
  });

  it('DPOP_REPLAY is transient — the next proof mints a fresh jti', async () => {
    await refreshFailingWith('DPOP_REPLAY');
    expect(await getRefreshToken()).toBe('rt-live');
  });
});
