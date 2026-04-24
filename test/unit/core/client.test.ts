// @bb/universal-auth | test/unit/core/client.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A1 gate #10 coverage for src/core/client.ts

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  configureClient,
  request,
  get,
  post,
  put,
  del,
  __resetClientForTests,
} from '../../../src/core/client.js';
import {
  setSession,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  AuthCodeExpired,
  AuthSdkError,
  AuthSessionExpired,
  ProvisioningIncomplete,
  ConsentRequired,
} from '../../../src/errors.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('core/client', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    void __resetDbForTests();
    configureClient({
      apiBaseUrl: BASE,
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('headers', () => {
    it('stamps X-Auth-Protocol-Version + X-App-Id + X-SDK-Version on every request', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await get('/some/path', { anonymous: true });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['X-Auth-Protocol-Version']).toBe('v1');
      expect(headers['X-App-Id']).toBe('bb_express');
      expect(headers['X-SDK-Version']).toBe('1.0.0-rc.1');
    });

    it('adds Idempotency-Key on mutations (POST/PUT/PATCH/DELETE)', async () => {
      // Factory: fresh Response per call so body isn't re-read
      fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
      await post('/a', { x: 1 }, { anonymous: true });
      await put('/b', { y: 2 }, { anonymous: true });
      await del('/c', { anonymous: true });

      for (const call of fetchSpy.mock.calls) {
        const init = call[1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(typeof headers['Idempotency-Key']).toBe('string');
        expect(headers['Idempotency-Key']).not.toBe('');
      }
    });

    it('omits Idempotency-Key on GET', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await get('/some', { anonymous: true });
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBeUndefined();
    });

    it('reuses explicit Idempotency-Key when provided (offline-queue replay path)', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await post('/a', { x: 1 }, { anonymous: true, idempotencyKey: 'fixed-key-abc' });
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Idempotency-Key']).toBe('fixed-key-abc');
    });

    it('attaches Authorization: Bearer when a session exists', async () => {
      await setSession({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await get('/me');
      const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBe('Bearer at-1');
    });

    it('omits Authorization when anonymous:true', async () => {
      await setSession({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await get('/public', { anonymous: true });
      const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBeUndefined();
    });
  });

  describe('URL building', () => {
    it('joins base + path with exactly one slash', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await get('/auth/v1/me', { anonymous: true });
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toBe(`${BASE}/auth/v1/me`);
    });

    it('handles trailing slash on base + missing slash on path', async () => {
      __resetClientForTests();
      configureClient({ apiBaseUrl: `${BASE}/`, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await get('auth/v1/me', { anonymous: true });
      expect(fetchSpy.mock.calls[0]![0]).toBe(`${BASE}/auth/v1/me`);
    });
  });

  describe('response handling', () => {
    it('returns parsed JSON for 2xx', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { user: 'sam' }));
      const result = await get<{ user: string }>('/me', { anonymous: true });
      expect(result.status).toBe(200);
      expect(result.data.user).toBe('sam');
    });

    it('returns ETag for 200 responses when present', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { v: 1 }, { etag: 'W/"abc"' }));
      const result = await get('/me', { anonymous: true });
      expect(result.etag).toBe('W/"abc"');
    });

    it('handles 304 Not Modified without body parsing', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 304 }));
      const result = await get('/me', { anonymous: true, ifNoneMatch: 'W/"abc"' });
      expect(result.status).toBe(304);
      expect(result.etag).toBe('W/"abc"');
    });
  });

  describe('error mapping (§3.6 + §3.7)', () => {
    it('maps AUTH_CODE_EXPIRED envelope to AuthCodeExpired', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResp(400, {
          error: 'code_expired',
          code: 'AUTH_CODE_EXPIRED',
          hint: 'Request a new one.',
          trace_id: '01HZ...',
        })
      );
      await expect(post('/auth/v1/code/verify', { code: '123456' }, { anonymous: true })).rejects.toThrow(
        AuthCodeExpired
      );
    });

    it('maps PROVISIONING_INCOMPLETE with blocker', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResp(409, {
          code: 'PROVISIONING_INCOMPLETE',
          blocker: 'no_app_registration',
          trace_id: 'tr-1',
        })
      );
      try {
        await get('/auth/v1/me');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ProvisioningIncomplete);
        expect((err as ProvisioningIncomplete).blocker).toBe('no_app_registration');
      }
    });

    it('maps CONSENT_REQUIRED with missing_consents array', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResp(403, {
          code: 'CONSENT_REQUIRED',
          missing_consents: ['agent_buddy_crew', 'device_camera'],
        })
      );
      try {
        await get('/profile', { anonymous: true });
      } catch (err) {
        expect(err).toBeInstanceOf(ConsentRequired);
        expect((err as ConsentRequired).missingConsents).toEqual([
          'agent_buddy_crew',
          'device_camera',
        ]);
      }
    });

    it('wraps non-JSON error responses in base AuthSdkError', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
      try {
        await get('/x', { anonymous: true });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthSdkError);
        expect((err as AuthSdkError).code).toBe('HTTP_500');
      }
    });
  });

  describe('401 refresh-retry path', () => {
    it('does not recurse on /session/refresh itself', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResp(401, { code: 'AUTH_SESSION_REVOKED' })
      );
      await expect(
        post('/auth/v1/session/refresh', { refresh_token: 'rt' }, { anonymous: true })
      ).rejects.toThrow();
      // Only 1 call — no retry loop on refresh path
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('surfaces AuthSessionExpired when refresh cannot recover', async () => {
      // First call: 401 on the user endpoint triggers refresh path
      // Second call (the refresh attempt): also fails → AuthSessionExpired thrown
      fetchSpy.mockResolvedValueOnce(jsonResp(401, { code: 'AUTH_SESSION_EXPIRED' }));
      fetchSpy.mockResolvedValueOnce(jsonResp(401, { code: 'AUTH_SESSION_REVOKED' }));
      // Seed an expired session so getAccessToken triggers refresh (not null-short-circuit)
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt',
        expiresAt: Date.now() - 1000,
        sessionId: 's',
      });
      await expect(get('/auth/v1/me')).rejects.toBeInstanceOf(AuthSessionExpired);
    });
  });

  describe('configureClient guard', () => {
    it('throws when request is called before configureClient', async () => {
      __resetClientForTests();
      await expect(request('/test', { anonymous: true })).rejects.toThrow(
        /called before configureClient/
      );
    });
  });
});
