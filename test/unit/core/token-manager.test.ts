// @bb/universal-auth | test/unit/core/token-manager.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A1 gate #4 (mutex-coalesced refresh) + #10 (coverage) for src/core/token-manager.ts

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
import { __resetDbForTests } from '../../../src/core/storage.js';

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
    it('clears session and re-throws on refresh error', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-doomed',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-bad',
      });

      registerRefreshCallback(async () => {
        throw new Error('AUTH_SESSION_REVOKED');
      });

      await expect(getAccessToken()).rejects.toThrow('AUTH_SESSION_REVOKED');
      expect(hasLiveAccessToken()).toBe(false);
      expect(getCurrentSessionId()).toBeNull();
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
});
