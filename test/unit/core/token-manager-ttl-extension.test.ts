// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-ttl-extension.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2b — coverage for v1.0.1 lookback C5: token-manager honors
// `refresh_expires_at` even when refresh response does NOT include a new
// `refresh_token` (server extends TTL without rotating).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setSession,
  getAccessToken,
  registerRefreshCallback,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import * as storage from '../../../src/core/storage.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

describe('token-manager — refresh TTL extension (v1.0.1 C5)', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await __resetDbForTests();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('TTL extended without rotation: existing refresh token retained, expiry updated', async () => {
    await setSession({
      accessToken: 'stale',
      refreshToken: 'rt-keep',
      expiresAt: Date.now() - 1000,
      sessionId: 'sess-x',
    });

    const newAccessExp = new Date(Date.now() + 15 * 60_000).toISOString();
    const extendedRefreshExp = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(); // 120 days

    registerRefreshCallback(async (rt) => {
      expect(rt).toBe('rt-keep');
      return {
        access_token: 'at-new',
        // No `refresh_token` (no rotation)
        expires_at: newAccessExp,
        refresh_expires_at: extendedRefreshExp,
        session_id: 'sess-y',
      };
    });

    const storeSpy = vi.spyOn(storage, 'storeRefreshToken');

    const tok = await getAccessToken();
    expect(tok).toBe('at-new');

    // storeRefreshToken should have been called to re-encrypt the EXISTING
    // refresh token (rt-keep) under the NEW TTL.
    const reEncryptCalls = storeSpy.mock.calls.filter(([rt]) => rt === 'rt-keep');
    expect(reEncryptCalls.length).toBeGreaterThanOrEqual(1);

    const lastCall = reEncryptCalls[reEncryptCalls.length - 1]!;
    const [persistedToken, persistedExpiry] = lastCall;
    expect(persistedToken).toBe('rt-keep');
    // Persisted expiry should match the server-returned extended expiry.
    expect(persistedExpiry).toBe(new Date(extendedRefreshExp).getTime());

    storeSpy.mockRestore();
  });

  it('rotation path: new refresh_token AND new TTL both adopted', async () => {
    await setSession({
      accessToken: 'stale',
      refreshToken: 'rt-old',
      expiresAt: Date.now() - 1000,
      sessionId: 'sess-x',
    });

    const newAccessExp = new Date(Date.now() + 15 * 60_000).toISOString();
    const newRefreshExp = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    registerRefreshCallback(async () => ({
      access_token: 'at-rot',
      refresh_token: 'rt-rotated',
      expires_at: newAccessExp,
      refresh_expires_at: newRefreshExp,
      session_id: 'sess-rot',
    }));

    const storeSpy = vi.spyOn(storage, 'storeRefreshToken');

    const tok = await getAccessToken();
    expect(tok).toBe('at-rot');

    // The rotation branch persists the NEW refresh token under the NEW TTL.
    const rotationCalls = storeSpy.mock.calls.filter(([rt]) => rt === 'rt-rotated');
    expect(rotationCalls.length).toBeGreaterThanOrEqual(1);
    const [, persistedExpiry] = rotationCalls[rotationCalls.length - 1]!;
    expect(persistedExpiry).toBe(new Date(newRefreshExp).getTime());

    storeSpy.mockRestore();
  });

  it('access-only response: access updated, refresh storage NOT touched', async () => {
    await setSession({
      accessToken: 'stale',
      refreshToken: 'rt-keep2',
      expiresAt: Date.now() - 1000,
      sessionId: 'sess-x',
    });

    const newAccessExp = new Date(Date.now() + 15 * 60_000).toISOString();

    registerRefreshCallback(async () => ({
      access_token: 'at-only',
      // No refresh_token, no refresh_expires_at
      expires_at: newAccessExp,
      session_id: 'sess-keep',
    }));

    const storeSpy = vi.spyOn(storage, 'storeRefreshToken');

    const tok = await getAccessToken();
    expect(tok).toBe('at-only');

    // No new TTL and no rotation → refresh storage left untouched on this branch.
    expect(storeSpy).not.toHaveBeenCalled();

    storeSpy.mockRestore();
  });
});
