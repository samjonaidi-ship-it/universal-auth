// @samjonaidi-ship-it/universal-auth | test/unit/flows/pin-flow.test.ts | v1.0.0 | 2026-08-10 | BB
// P4.1 — PIN sign-in through the SDK client.
//
// The point of this flow is not tidiness. CalExp5 called /auth/v1/pin/verify
// with a raw fetch(), so it never carried a DPoP proof and the BFF stored
// cnf_jkt = NULL. PIN is how most of the crew sign in, so in practice almost
// no session was bound. The first test below is the one that matters.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  setSession,
  getAccessToken,
  getCurrentSessionId,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests, getRefreshToken, storeRefreshToken } from '../../../src/core/storage.js';

// Wrap storeRefreshToken with the REAL implementation so behaviour is
// unchanged, but the TTL token-manager writes becomes observable. There is no
// public getter for it, and asserting the TTL is the whole point of the
// refresh_expires_at test below.
vi.mock('../../../src/core/storage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/storage.js')>();
  return { ...actual, storeRefreshToken: vi.fn(actual.storeRefreshToken) };
});
import { clearDeviceIdCache } from '../../../src/core/device-id.js';
import { __resetNonceCacheForTests } from '../../../src/core/dpop/nonce-cache.js';
import { verifyPin, setPin, clearPin, getPinStatus } from '../../../src/flows/pin-flow.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SESSION_BODY = {
  access_token: 'at-pin',
  refresh_token: 'rt-pin',
  session_id: 'sess-pin',
  expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  identity: { id: 'id-1', email: 'crew@example.com' },
  aggregate: { features: [], app_access: [] },
  session_meta: {},
};

const headersOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  (spy.mock.calls[i]![1] as RequestInit).headers as Record<string, string>;
const urlOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) => String(spy.mock.calls[i]![0]);
const bodyOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  JSON.parse(String((spy.mock.calls[i]![1] as RequestInit).body));

describe('P4.1 — pin flow', () => {
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
      sdkVersion: '1.1.0-rc.15',
      useDpop: 'auto',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('verifyPin', () => {
    it('sends a DPoP proof — the whole reason this flow exists', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, SESSION_BODY));
      await verifyPin({ email: 'crew@example.com', pin: '1234' });

      const headers = headersOf(fetchSpy);
      expect(
        headers.DPoP,
        'without a proof the BFF stores cnf_jkt = NULL and the session is unbound',
      ).toBeTypeOf('string');
      expect(headers.DPoP!.split('.').length).toBe(3);
    });

    it('installs the session so useAuth() consumers see it', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, SESSION_BODY));
      const { session } = await verifyPin({ email: 'crew@example.com', pin: '1234' });

      expect(await getAccessToken()).toBe('at-pin');
      expect(await getRefreshToken()).toBe('rt-pin');
      expect(getCurrentSessionId()).toBe('sess-pin');
      expect(session.identity.id).toBe('id-1');
    });

    it('posts email + pin + device_id + app_id, anonymously', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, SESSION_BODY));
      await verifyPin({ email: 'crew@example.com', pin: '1234' });

      expect(urlOf(fetchSpy)).toBe(`${BASE}/auth/v1/pin/verify`);
      const body = bodyOf(fetchSpy);
      expect(body.email).toBe('crew@example.com');
      expect(body.pin).toBe('1234');
      expect(body.app_id).toBe('bb_express');
      expect(body.device_id).toBeTypeOf('string');
      // Pre-identity: no bearer to attach.
      expect(headersOf(fetchSpy).Authorization).toBeUndefined();
    });

    it('carries the standard SDK headers the raw fetch never sent', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, SESSION_BODY));
      await verifyPin({ email: 'crew@example.com', pin: '1234' });

      const headers = headersOf(fetchSpy);
      expect(headers['X-Auth-Protocol-Version']).toBe('v1');
      expect(headers['X-App-Id']).toBe('bb_express');
      expect(headers['X-SDK-Version']).toBe('1.1.0-rc.15');
      expect(headers['Idempotency-Key']).toBeTypeOf('string');
    });

    it('passes refresh_expires_at through — not the +90d default', async () => {
      // The raw fetch this flow replaces handled this explicitly. Dropping it
      // would record a TTL the server never agreed to and trip the
      // legacy-response warning — a quiet regression, not a refactor.
      const realTtl = new Date(Date.now() + 30 * 86_400_000).toISOString();
      fetchSpy.mockResolvedValueOnce(
        jsonResp(200, { ...SESSION_BODY, refresh_expires_at: realTtl }),
      );
      await verifyPin({ email: 'crew@example.com', pin: '1234' });

      // storeRefreshToken is the sink token-manager writes the TTL to.
      expect(storeRefreshToken).toHaveBeenCalled();
      const [, storedExpiry] = vi.mocked(storeRefreshToken).mock.calls.at(-1)!;
      expect(Math.abs(storedExpiry - new Date(realTtl).getTime())).toBeLessThan(1000);
      // …and emphatically not the 90-day fallback.
      const ninetyDays = Date.now() + 90 * 86_400_000;
      expect(Math.abs(storedExpiry - ninetyDays)).toBeGreaterThan(86_400_000);
    });

    it('falls back to the default TTL when the server omits refresh_expires_at', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, SESSION_BODY));
      await verifyPin({ email: 'crew@example.com', pin: '1234' });

      const [, storedExpiry] = vi.mocked(storeRefreshToken).mock.calls.at(-1)!;
      const ninetyDays = Date.now() + 90 * 86_400_000;
      expect(Math.abs(storedExpiry - ninetyDays)).toBeLessThan(86_400_000);
    });

    it('surfaces a typed error instead of a bare status code', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(401, {
        code: 'INVALID_CREDENTIALS', message: 'wrong pin', protocol_version: 'v1',
      }));
      await expect(
        verifyPin({ email: 'crew@example.com', pin: '9999' }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      // A failed PIN must not install anything.
      expect(await getRefreshToken()).toBeNull();
    });
  });

  describe('setPin / clearPin', () => {
    beforeEach(async () => {
      await setSession({
        accessToken: 'at-live',
        refreshToken: 'rt-live',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });
    });

    it('setPin attaches the bearer automatically — no hand-rolled header', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await setPin({ pin: '4321' });

      expect(urlOf(fetchSpy)).toBe(`${BASE}/auth/v1/pin/set`);
      expect(headersOf(fetchSpy).Authorization).toBe('Bearer at-live');
      expect(bodyOf(fetchSpy).pin).toBe('4321');
    });

    it('clearPin attaches the bearer automatically', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await clearPin();

      expect(urlOf(fetchSpy)).toBe(`${BASE}/auth/v1/pin/clear`);
      expect(headersOf(fetchSpy).Authorization).toBe('Bearer at-live');
    });

    it('neither is DPoP-protected — they mint no session', async () => {
      // Guards against over-applying P4.6: a proof only belongs where a
      // session is created or a credential is presented.
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await setPin({ pin: '4321' });
      expect(headersOf(fetchSpy).DPoP).toBeUndefined();
    });

    it('a failed setPin rejects rather than silently succeeding', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(400, {
        code: 'BAD_REQUEST', message: 'pin must be 4-8 digits', protocol_version: 'v1',
      }));
      await expect(setPin({ pin: '1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });

  describe('getPinStatus', () => {
    it('probes anonymously when given an email, and encodes it', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { has_pin: true }));
      const status = await getPinStatus({ email: 'crew+tag@example.com' });

      expect(status.has_pin).toBe(true);
      expect(urlOf(fetchSpy)).toContain('email=crew%2Btag%40example.com');
      expect(headersOf(fetchSpy).Authorization).toBeUndefined();
    });

    it('uses the current session when given no email', async () => {
      await setSession({
        accessToken: 'at-live',
        refreshToken: 'rt-live',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { has_pin: false }));
      const status = await getPinStatus();

      expect(status.has_pin).toBe(false);
      expect(urlOf(fetchSpy)).toBe(`${BASE}/auth/v1/pin/status`);
      expect(headersOf(fetchSpy).Authorization).toBe('Bearer at-live');
    });

    it('coerces a missing has_pin to false rather than undefined', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, {}));
      expect((await getPinStatus({ email: 'a@b.c' })).has_pin).toBe(false);
    });
  });
});
