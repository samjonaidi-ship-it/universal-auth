// @samjonaidi-ship-it/universal-auth | test/unit/core/client-cookie-mint.test.ts | v1.0.0 | 2026-10-15 | BB
// rc.27 (COOKIE_BEARER_MINT_SPEC §5) — client half of the cookie mint:
//   the mint request (cookie only, no Authorization, app_id = mintAppId ?? appId),
//   the status mapping (401/400/403 → refused; 429/5xx → thrown, transient),
//   and the fallback: a failed mint never blocks a request, which goes out on
//   the cookie alone, as it did before the mint existed.

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { configureClient, get, __resetClientForTests } from '../../../src/core/client.js';
import {
  getAccessToken,
  noteCookieSession,
  onTokenUnavailable,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { clearDeviceIdCache } from '../../../src/core/device-id.js';
import { AuthRateLimited } from '../../../src/errors.js';

const BASE = 'https://ct-bff.test.example.com';
const MINT_URL = `${BASE}/auth/v1/session/mint`;

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mintOk(token = 'at-minted', sessionId = 'sess-cookie-1'): Response {
  return jsonResp(200, {
    access_token: token,
    token_type: 'Bearer',
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    session_id: sessionId,
    protocol_version: 'v1',
  });
}

function callsTo(spy: MockInstance<typeof fetch>, url: string): RequestInit[] {
  return (spy.mock.calls as unknown as [string, RequestInit][])
    .filter(([u]) => u === url)
    .map(([, init]) => init);
}

describe('core/client — rc.27 cookie mint', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    clearDeviceIdCache();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function configure(extra: { mintFromCookie?: boolean; mintAppId?: string } = {}): void {
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.1.0-rc.27', ...extra });
  }

  it('mints on the cookie alone and sends the bearer on the request', async () => {
    configure({ mintFromCookie: true, mintAppId: 'calexp5' });
    noteCookieSession('sess-cookie-1');
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === MINT_URL ? mintOk() : jsonResp(200, { ok: true }));

    await get('/auth/v1/me');

    const mints = callsTo(fetchSpy, MINT_URL);
    expect(mints).toHaveLength(1);
    const init = mints[0]!;
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.redirect).toBe('manual');
    expect(headers.Authorization).toBeUndefined();
    expect(headers.DPoP).toBeUndefined();
    expect(headers['Idempotency-Key']).toBeTruthy();
    expect(JSON.parse(init.body as string)).toEqual({ app_id: 'calexp5' });

    const me = callsTo(fetchSpy, `${BASE}/auth/v1/me`);
    expect((me[0]!.headers as Record<string, string>).Authorization).toBe('Bearer at-minted');
  });

  it('app_id defaults to appId when mintAppId is not set', async () => {
    configure({ mintFromCookie: true });
    noteCookieSession('sess-cookie-1');
    fetchSpy.mockResolvedValueOnce(mintOk());
    expect(await getAccessToken()).toBe('at-minted');
    expect(JSON.parse(callsTo(fetchSpy, MINT_URL)[0]!.body as string)).toEqual({ app_id: 'bb_express' });
  });

  it('flag off (default): no mint request, the call goes out on the cookie', async () => {
    configure();
    noteCookieSession('sess-cookie-1');
    fetchSpy.mockResolvedValue(jsonResp(200, { ok: true }));
    await get('/auth/v1/me');
    expect(callsTo(fetchSpy, MINT_URL)).toHaveLength(0);
    const me = callsTo(fetchSpy, `${BASE}/auth/v1/me`);
    expect((me[0]!.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('re-configuring with the flag off unregisters the mint', async () => {
    configure({ mintFromCookie: true });
    configure({ mintFromCookie: false });
    noteCookieSession('sess-cookie-1');
    fetchSpy.mockResolvedValue(jsonResp(200, { ok: true }));
    expect(await getAccessToken()).toBeNull();
    expect(callsTo(fetchSpy, MINT_URL)).toHaveLength(0);
  });

  it.each([
    [401, 'SESSION_INVALID'],
    [401, 'SESSION_ENDING'],
    [400, 'COOKIE_REQUIRED'],
    [403, 'APP_NOT_ALLOWED'],
    [403, 'ORIGIN_REQUIRED'],
  ])('%i %s is a refusal: null + no_refresh_token, no retry in this generation', async (status, code) => {
    configure({ mintFromCookie: true });
    noteCookieSession('sess-cookie-1');
    const seen = vi.fn();
    onTokenUnavailable(seen);
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === MINT_URL ? jsonResp(status, { code, message: 'x', protocol_version: 'v1' }) : jsonResp(200, {}));

    expect(await getAccessToken()).toBeNull();
    expect(await getAccessToken()).toBeNull();
    expect(callsTo(fetchSpy, MINT_URL)).toHaveLength(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ reason: 'no_refresh_token' });
  });

  it('429 throws AuthRateLimited with retryAfterSeconds, and the request still goes out on the cookie', async () => {
    configure({ mintFromCookie: true });
    noteCookieSession('sess-cookie-1');
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === MINT_URL
        ? jsonResp(429, { code: 'AUTH_RATE_LIMITED', message: 'slow', retry_after_seconds: 120, protocol_version: 'v1' })
        : jsonResp(200, { ok: true }));

    const err = await getAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthRateLimited);
    expect((err as AuthRateLimited).retryAfterSeconds).toBe(120);

    const res = await get<{ ok: boolean }>('/auth/v1/me');
    expect(res.data).toEqual({ ok: true });
    const me = callsTo(fetchSpy, `${BASE}/auth/v1/me`);
    expect((me[0]!.headers as Record<string, string>).Authorization).toBeUndefined();
    // Blocked for 120 s: the request did not mint again.
    expect(callsTo(fetchSpy, MINT_URL)).toHaveLength(1);
  });

  it('a 5xx with no envelope throws HTTP_503, and the request still goes out on the cookie', async () => {
    configure({ mintFromCookie: true });
    noteCookieSession('sess-cookie-1');
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) =>
      String(input) === MINT_URL ? new Response('bad gateway', { status: 503 }) : jsonResp(200, { ok: true }));

    const err = await getAccessToken().catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('HTTP_503');
    const res = await get<{ ok: boolean }>('/auth/v1/me');
    expect(res.data).toEqual({ ok: true });
  });

  it('a network error on the mint does not block the request', async () => {
    configure({ mintFromCookie: true });
    noteCookieSession('sess-cookie-1');
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === MINT_URL) throw new TypeError('Failed to fetch');
      return jsonResp(200, { ok: true });
    });
    const res = await get<{ ok: boolean }>('/auth/v1/me');
    expect(res.data).toEqual({ ok: true });
  });

  it('a 401 on the request re-mints once and retries with the new bearer', async () => {
    configure({ mintFromCookie: true });
    noteCookieSession('sess-cookie-1');
    let mints = 0;
    let meCalls = 0;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === MINT_URL) {
        mints += 1;
        return mintOk(`at-${mints}`);
      }
      meCalls += 1;
      return meCalls === 1
        ? jsonResp(401, { code: 'AUTH_SESSION_EXPIRED', message: 'x' })
        : jsonResp(200, { ok: true });
    });
    const res = await get<{ ok: boolean }>('/auth/v1/me');
    expect(res.data).toEqual({ ok: true });
    expect(mints).toBe(2);
    const me = callsTo(fetchSpy, `${BASE}/auth/v1/me`);
    expect((me[1]!.headers as Record<string, string>).Authorization).toBe('Bearer at-2');
  });

  it('a 401 on the request whose re-mint fails transiently retries on the cookie, not AuthSessionExpired', async () => {
    configure({ mintFromCookie: true });
    noteCookieSession('sess-cookie-1');
    let mints = 0;
    let meCalls = 0;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === MINT_URL) {
        mints += 1;
        return mints === 1 ? mintOk() : new Response('down', { status: 502 });
      }
      meCalls += 1;
      return meCalls === 1
        ? jsonResp(401, { code: 'AUTH_SESSION_EXPIRED', message: 'x' })
        : jsonResp(200, { ok: true });
    });
    const res = await get<{ ok: boolean }>('/auth/v1/me');
    expect(res.data).toEqual({ ok: true });
  });
});
