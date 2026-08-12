// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager.test.ts | v1.2.0 | 2026-08-10 | BB
// A1 gate #4 (mutex-coalesced refresh) + #10 (coverage) for src/core/token-manager.ts.
// v1.1.0 (P1-G): + cnf.jkt round-trip verify after refresh.
// v1.2.0 (P3.1): + refresh-failure classification — terminal (expired/revoked)
//   clears the credential, transient (network/5xx/abort) keeps it and stays
//   silent. The pre-existing revoke test was rewritten to throw the error shape
//   production actually throws; its intent is unchanged.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setSession,
  clearSession,
  getAccessToken,
  hasLiveAccessToken,
  getCurrentSessionId,
  registerRefreshCallback,
  isExpiringSoon,
  onSessionChange,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests, getRefreshToken } from '../../../src/core/storage.js';
import {
  AuthSdkError,
  AuthSessionExpired,
  AuthSessionRevoked,
} from '../../../src/errors.js';

describe('token-manager', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await __resetDbForTests();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  describe('isExpiringSoon', () => {
    it('returns true when expiry is in the past', () => {
      expect(isExpiringSoon(Date.now() - 1000)).toBe(true);
    });
    it('returns true within the 30s refresh margin', () => {
      expect(isExpiringSoon(Date.now() + 10_000)).toBe(true);
    });
    it('returns false well before expiry', () => {
      expect(isExpiringSoon(Date.now() + 10 * 60_000)).toBe(false);
    });
  });

  describe('setSession + getAccessToken happy path', () => {
    it('stores and returns the access token', async () => {
      await setSession({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-1',
      });
      expect(hasLiveAccessToken()).toBe(true);
      expect(await getAccessToken()).toBe('at-1');
      expect(getCurrentSessionId()).toBe('sess-1');
    });

    it('notifies listeners on setSession', async () => {
      const listener = vi.fn();
      onSessionChange(listener);
      await setSession({
        accessToken: 'at-2',
        refreshToken: 'rt-2',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-2',
      });
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('clearSession', () => {
    it('drops memory + IDB state', async () => {
      await setSession({
        accessToken: 'at-3',
        refreshToken: 'rt-3',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-3',
      });
      await clearSession();
      expect(hasLiveAccessToken()).toBe(false);
      expect(getCurrentSessionId()).toBeNull();
    });
  });

  describe('A1 gate #4 — mutex-coalesced refresh', () => {
    it('5 concurrent getAccessToken() calls trigger exactly 1 refresh network call', async () => {
      // Seed an already-expired session so getAccessToken() triggers refresh
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-fresh',
        expiresAt: Date.now() - 1000, // expired
        sessionId: 'sess-stale',
      });

      // Mock refresh callback that counts calls and resolves after a tick
      let callCount = 0;
      const newExpiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
      registerRefreshCallback(async (rt) => {
        callCount++;
        // Force async to give concurrent callers a chance to coalesce
        await new Promise((r) => setTimeout(r, 10));
        expect(rt).toBe('rt-fresh');
        return {
          access_token: 'at-refreshed',
          expires_at: newExpiresAt,
          session_id: 'sess-refreshed',
        };
      });

      // Fire 5 concurrent getters
      const results = await Promise.all([
        getAccessToken(),
        getAccessToken(),
        getAccessToken(),
        getAccessToken(),
        getAccessToken(),
      ]);

      expect(callCount).toBe(1);
      expect(results).toEqual([
        'at-refreshed',
        'at-refreshed',
        'at-refreshed',
        'at-refreshed',
        'at-refreshed',
      ]);
      expect(getCurrentSessionId()).toBe('sess-refreshed');
    });

    it('rotates refresh token when server returns a new one', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-old',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-x',
      });

      registerRefreshCallback(async () => ({
        access_token: 'at-new',
        refresh_token: 'rt-rotated',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'sess-y',
      }));

      const token = await getAccessToken();
      expect(token).toBe('at-new');
      // Rotated refresh persisted to IDB — next refresh uses new value
      let seen = '';
      registerRefreshCallback(async (rt) => {
        seen = rt;
        return {
          access_token: 'at-z',
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          session_id: 'sess-z',
        };
      });
      // Force expiry to trigger another refresh
      await setSession({
        accessToken: 'stale2',
        refreshToken: 'rt-rotated', // matches what was persisted
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-y',
      });
      await getAccessToken();
      expect(seen).toBe('rt-rotated');
    });
  });

  describe('refresh failure', () => {
    // v1.2.0 (P3.1): this test previously threw `new Error('AUTH_SESSION_REVOKED')`
    // — a plain Error carrying the code in its *message*, with `.code`
    // undefined. That was invisible while the catch ignored the error and
    // cleared unconditionally. Now that the catch classifies, the shortcut is
    // actively misleading: production never throws that shape.
    // `refreshTokenRequest` throws `errorFromEnvelope()` → an
    // `AuthSessionRevoked` instance with a real `.code` (client.ts:452,
    // errors.ts:431). Intent is unchanged — a revoked session must clear.
    it('clears session and re-throws when the session was REVOKED', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-doomed',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-bad',
      });

      registerRefreshCallback(async () => {
        throw new AuthSessionRevoked();
      });

      await expect(getAccessToken()).rejects.toThrow(AuthSessionRevoked);
      expect(hasLiveAccessToken()).toBe(false);
      expect(getCurrentSessionId()).toBeNull();
      // The credential itself must be gone from storage, not just from memory.
      expect(await getRefreshToken()).toBeNull();
    });

    it('clears the stored credential when the refresh token has EXPIRED', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-past-ttl',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-old',
      });

      registerRefreshCallback(async () => {
        throw new AuthSessionExpired();
      });

      await expect(getAccessToken()).rejects.toThrow(AuthSessionExpired);
      expect(await getRefreshToken()).toBeNull();
      expect(getCurrentSessionId()).toBeNull();
    });

    // ── P3.1 — the transient half ─────────────────────────────────────────
    //
    // These are the regression tests for A3: a dead zone must not destroy a
    // valid 90-day credential (and, downstream in BB Express, must not trip
    // the purge that takes unsynced offline work with it).

    it('KEEPS the refresh token when the network fails (raw TypeError)', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-still-good',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-live',
      });

      registerRefreshCallback(async () => {
        // What fetch() actually rejects with when offline — not an AuthSdkError.
        throw new TypeError('Failed to fetch');
      });

      await expect(getAccessToken()).rejects.toThrow(TypeError);
      // The credential survives, so the next attempt can recover silently.
      expect(await getRefreshToken()).toBe('rt-still-good');
      // Session identity is retained — the user is not signed out.
      expect(getCurrentSessionId()).toBe('sess-live');
    });

    it('KEEPS the refresh token on a 5xx', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-survives-5xx',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-5xx',
      });

      registerRefreshCallback(async () => {
        // client.ts:450 — non-JSON error body becomes `HTTP_${status}`.
        throw new AuthSdkError('HTTP_503', 'Refresh failed: HTTP 503');
      });

      // Assert on `.code`, not the message — classification reads the code.
      await expect(getAccessToken()).rejects.toMatchObject({ code: 'HTTP_503' });
      expect(await getRefreshToken()).toBe('rt-survives-5xx');
    });

    it('KEEPS the refresh token on an abort/timeout', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-survives-abort',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-abort',
      });

      registerRefreshCallback(async () => {
        // AbortSignal.timeout() rejects with a DOMException named AbortError,
        // whose legacy numeric `.code` (20) must not be mistaken for a
        // terminal auth code.
        throw new DOMException('The operation was aborted.', 'AbortError');
      });

      await expect(getAccessToken()).rejects.toThrow(DOMException);
      expect(await getRefreshToken()).toBe('rt-survives-abort');
    });

    it('does NOT notify listeners on a transient failure', async () => {
      // Load-bearing: AuthProvider's listener gates on hasLiveAccessToken()
      // alone and flips to 'anonymous' whenever it is false — which it is
      // during any refresh. A notify here would sign the user out on a blip.
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-no-notify',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-quiet',
      });

      const listener = vi.fn();
      onSessionChange(listener);

      registerRefreshCallback(async () => {
        throw new TypeError('Failed to fetch');
      });

      await expect(getAccessToken()).rejects.toThrow(TypeError);
      expect(listener).not.toHaveBeenCalled();
    });

    it('DOES notify listeners on a terminal failure', async () => {
      // The control for the test above: proves the assertion there is about
      // classification, not about listeners being broken in this harness.
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-notify',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-loud',
      });

      const listener = vi.fn();
      onSessionChange(listener);

      registerRefreshCallback(async () => {
        throw new AuthSessionRevoked();
      });

      await expect(getAccessToken()).rejects.toThrow(AuthSessionRevoked);
      expect(listener).toHaveBeenCalled();
    });

    it('recovers on retry after a transient failure, with no re-auth', async () => {
      // End-to-end proof of the point of the phase: blip → recovery, and the
      // retry reuses the SAME refresh token (its Idempotency-Key is derived
      // from it, client.ts:470, so the BFF replays rather than reuse-detects).
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-recover',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-recover',
      });

      let attempt = 0;
      let tokenSeenOnRetry: string | null = null;
      registerRefreshCallback(async (rt: string) => {
        attempt += 1;
        if (attempt === 1) throw new TypeError('Failed to fetch');
        tokenSeenOnRetry = rt;
        return {
          access_token: 'at-fresh',
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          refresh_expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
          session_id: 'sess-recover',
        };
      });

      await expect(getAccessToken()).rejects.toThrow(TypeError);
      expect(await getAccessToken()).toBe('at-fresh');
      expect(tokenSeenOnRetry).toBe('rt-recover');
      expect(hasLiveAccessToken()).toBe(true);
    });
  });

  describe('getAccessToken without session', () => {
    it('returns null when no session has been set', async () => {
      registerRefreshCallback(async () => {
        throw new Error('should not be called');
      });
      expect(await getAccessToken()).toBeNull();
    });
  });

  describe('P1-G — cnf.jkt round-trip verify (RFC 9449 §6.1)', () => {
    // Helper: build a JWT-like access token with a `cnf.jkt` claim baked in.
    // Signature is gibberish — verifyAccessTokenJktBinding only inspects the payload.
    function makeAccessTokenWithJkt(jkt: string | null): string {
      const header = { alg: 'ES256', typ: 'JWT' };
      const payload: Record<string, unknown> = { sub: 'test-id', iat: Date.now() / 1000 };
      if (jkt !== null) payload.cnf = { jkt };
      const b64url = (s: string): string =>
        btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}.sig`;
    }

    it('accepts an access token with no cnf.jkt claim (legacy / opaque tokens)', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-legacy',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-legacy',
      });
      registerRefreshCallback(async () => ({
        access_token: makeAccessTokenWithJkt(null),
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'sess-new',
      }));
      const tok = await getAccessToken();
      expect(tok).not.toBeNull();
      expect(hasLiveAccessToken()).toBe(true);
    });

    it('accepts an opaque token (not a JWT) as unbound', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-opaque',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-opaque',
      });
      registerRefreshCallback(async () => ({
        access_token: 'opaque-token-no-dots',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'sess-new',
      }));
      const tok = await getAccessToken();
      expect(tok).toBe('opaque-token-no-dots');
    });

    it('clears session when access token is bound to a different DPoP key', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-mismatch',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-mismatch',
      });
      // Trigger DPoP keypair generation by having one in storage. We seed via
      // getOrCreateKeypair() — its thumbprint will not match our forged jkt.
      const { getOrCreateKeypair } = await import('../../../src/core/dpop/keypair.js');
      const { jwkThumbprint } = await import('../../../src/core/dpop/thumbprint.js');
      const pair = await getOrCreateKeypair();
      const localJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
      const localJkt = await jwkThumbprint(localJwk);

      // Server claims the token is bound to a DIFFERENT key (forged thumbprint)
      const fakeJkt = localJkt.split('').reverse().join(''); // guaranteed different
      registerRefreshCallback(async () => ({
        access_token: makeAccessTokenWithJkt(fakeJkt),
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'sess-mismatch-new',
      }));

      // rc.7 D7-fu(b): error is now a typed CnfJktMismatchError class.
      // Check code property (forward-compat) AND instanceof (consumer pattern).
      const { CnfJktMismatchError } = await import('../../../src/errors.js');
      let caught: unknown = null;
      try {
        await getAccessToken();
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(CnfJktMismatchError);
      expect((caught as { code: string }).code).toBe('CNF_JKT_MISMATCH');
      expect(hasLiveAccessToken()).toBe(false);
      expect(getCurrentSessionId()).toBeNull();
    });

    it('accepts access token bound to the matching local keypair', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-match',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-match',
      });
      const { getOrCreateKeypair } = await import('../../../src/core/dpop/keypair.js');
      const { jwkThumbprint } = await import('../../../src/core/dpop/thumbprint.js');
      const pair = await getOrCreateKeypair();
      const localJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
      const localJkt = await jwkThumbprint(localJwk);

      registerRefreshCallback(async () => ({
        access_token: makeAccessTokenWithJkt(localJkt),
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'sess-match-new',
      }));

      const tok = await getAccessToken();
      expect(tok).not.toBeNull();
      expect(hasLiveAccessToken()).toBe(true);
      expect(getCurrentSessionId()).toBe('sess-match-new');
    });
  });
});
