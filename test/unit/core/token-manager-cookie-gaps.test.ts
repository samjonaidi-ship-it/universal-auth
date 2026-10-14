// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-cookie-gaps.test.ts | v1.1.0 | 2026-10-14 | BB
// rc.22 — the SDK gaps CalExp5 #881 had to work around:
//   gap 1  no refresh token → silent null      → onTokenUnavailable + AuthNoRefreshToken
//   gap 4  DEVICE_UNRECOGNIZED terminal?       → no; isTerminalRefreshError exported
//   gap 6  cookie session has no id/generation → noteCookieSession + getSessionScope

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setSession,
  clearSession,
  getAccessToken,
  getAccessTokenOrThrow,
  onTokenUnavailable,
  getSessionScope,
  getSessionGeneration,
  isSessionScopeCurrent,
  isTerminalRefreshError,
  noteCookieSession,
  registerRefreshCallback,
  onSessionChange,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { AuthNoRefreshToken, AuthSdkError } from '../../../src/errors.js';

describe('token-manager — rc.22 cookie-session gaps', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await __resetDbForTests();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  describe('gap 1: no refresh token is reported, not silent', () => {
    it('getAccessToken() still resolves null, and onTokenUnavailable fires once per generation', async () => {
      registerRefreshCallback(async () => {
        throw new Error('must not be called without a refresh token');
      });
      const seen = vi.fn();
      onTokenUnavailable(seen);

      expect(await getAccessToken()).toBeNull();
      expect(await getAccessToken()).toBeNull();

      expect(seen).toHaveBeenCalledTimes(1);
      expect(seen.mock.calls[0]?.[0]).toMatchObject({
        reason: 'no_refresh_token',
        sessionId: null,
        generation: getSessionGeneration(),
      });
    });

    it('fires again after the session generation changes', async () => {
      registerRefreshCallback(async () => {
        throw new Error('unused');
      });
      const seen = vi.fn();
      onTokenUnavailable(seen);
      await getAccessToken();
      noteCookieSession('sess-cookie-1');
      await getAccessToken();
      expect(seen).toHaveBeenCalledTimes(2);
      expect(seen.mock.calls[1]?.[0]).toMatchObject({
        sessionId: 'sess-cookie-1',
        source: 'cookie',
      });
    });

    it('does NOT notify session listeners (a cookie session must not flip to anonymous)', async () => {
      registerRefreshCallback(async () => {
        throw new Error('unused');
      });
      const listener = vi.fn();
      onSessionChange(listener);
      await getAccessToken();
      expect(listener).not.toHaveBeenCalled();
    });

    it('getAccessTokenOrThrow() rejects with a typed AuthNoRefreshToken', async () => {
      registerRefreshCallback(async () => {
        throw new Error('unused');
      });
      const err = await getAccessTokenOrThrow().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AuthNoRefreshToken);
      expect(err).toBeInstanceOf(AuthSdkError);
      expect((err as AuthSdkError).code).toBe('AUTH_NO_REFRESH_TOKEN');
    });

    it('getAccessTokenOrThrow() returns the token when one is live', async () => {
      await setSession({
        accessToken: 'at-live',
        refreshToken: 'rt-live',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-live',
      });
      expect(await getAccessTokenOrThrow()).toBe('at-live');
    });

    it('a throwing listener does not break getAccessToken()', async () => {
      registerRefreshCallback(async () => {
        throw new Error('unused');
      });
      onTokenUnavailable(() => {
        throw new Error('listener bug');
      });
      expect(await getAccessToken()).toBeNull();
    });

    it('unsubscribe stops delivery', async () => {
      registerRefreshCallback(async () => {
        throw new Error('unused');
      });
      const seen = vi.fn();
      const off = onTokenUnavailable(seen);
      off();
      await getAccessToken();
      expect(seen).not.toHaveBeenCalled();
    });
  });

  describe('gap 4: terminal refresh-error classification', () => {
    it('DEVICE_UNRECOGNIZED is NOT terminal', () => {
      expect(isTerminalRefreshError(new AuthSdkError('DEVICE_UNRECOGNIZED', 'verify device'))).toBe(false);
    });
    it('the three terminal codes are terminal', () => {
      for (const code of ['AUTH_SESSION_EXPIRED', 'AUTH_SESSION_REVOKED', 'INVALID_DPOP_BINDING'] as const) {
        expect(isTerminalRefreshError(new AuthSdkError(code, code))).toBe(true);
      }
    });
    it('transient failures are not terminal', () => {
      expect(isTerminalRefreshError(new TypeError('Failed to fetch'))).toBe(false);
      expect(isTerminalRefreshError(new AuthSdkError('HTTP_503', 'down'))).toBe(false);
    });
  });

  describe('gap 6: session scope for cookie and token sessions', () => {
    it('setSession and clearSession each start a new generation', async () => {
      const g0 = getSessionGeneration();
      await setSession({
        accessToken: 'at-a',
        refreshToken: 'rt-a',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-a',
      });
      const scopeA = getSessionScope();
      expect(scopeA).toEqual({ sessionId: 'sess-a', generation: g0 + 1, source: 'token' });
      expect(isSessionScopeCurrent(scopeA)).toBe(true);

      await clearSession();
      expect(getSessionScope()).toEqual({ sessionId: null, generation: g0 + 2, source: null });
      expect(isSessionScopeCurrent(scopeA)).toBe(false);
    });

    it('re-installing the SAME session id is still a new generation', async () => {
      const tokens = {
        accessToken: 'at-same',
        refreshToken: 'rt-same',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-same',
      };
      await setSession(tokens);
      const first = getSessionScope();
      await setSession(tokens);
      expect(isSessionScopeCurrent(first)).toBe(false);
    });

    it('noteCookieSession gives a cookie-only session an id, a generation and source "cookie"', () => {
      const before = getSessionScope();
      noteCookieSession('sess-cookie');
      const after = getSessionScope();
      expect(after).toEqual({ sessionId: 'sess-cookie', generation: before.generation + 1, source: 'cookie' });
      // same id again: no new generation
      noteCookieSession('sess-cookie');
      expect(getSessionScope().generation).toBe(after.generation);
    });

    it('noteCookieSession ignores empty input and the id already held', async () => {
      noteCookieSession(undefined);
      noteCookieSession('');
      expect(getSessionScope().sessionId).toBeNull();

      await setSession({
        accessToken: 'at-t',
        refreshToken: 'rt-t',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-token',
      });
      const g = getSessionGeneration();
      noteCookieSession('sess-token');
      expect(getSessionScope()).toEqual({ sessionId: 'sess-token', generation: g, source: 'token' });
    });

    it('Devin round 1: /me naming a different session moves the scope to it (server wins)', async () => {
      await setSession({
        accessToken: 'at-stale',
        refreshToken: 'rt-stale',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-stale-token',
      });
      const before = getSessionScope();
      noteCookieSession('sess-cookie-now');
      expect(getSessionScope()).toEqual({
        sessionId: 'sess-cookie-now',
        generation: before.generation + 1,
        source: 'cookie',
      });
      expect(isSessionScopeCurrent(before)).toBe(false);
    });

    it('a refresh that returns a different session id moves the generation', async () => {
      await setSession({
        accessToken: 'at-old',
        refreshToken: 'rt-old',
        expiresAt: Date.now() - 1000, // expired → getAccessToken refreshes
        sessionId: 'sess-old',
      });
      const before = getSessionScope();
      registerRefreshCallback(async () => ({
        access_token: 'at-new',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'sess-new',
      }));
      expect(await getAccessToken()).toBe('at-new');
      expect(isSessionScopeCurrent(before)).toBe(false);
      expect(getSessionScope()).toMatchObject({ sessionId: 'sess-new', source: 'token' });
    });
  });
});
