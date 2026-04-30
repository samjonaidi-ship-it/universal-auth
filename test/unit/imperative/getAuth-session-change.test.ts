// @bainbridgebuilders/universal-auth | test/unit/imperative/getAuth-session-change.test.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// Branch coverage for src/imperative/getAuth.ts onSessionChange adapter (lines 135-142).
// Validates §5.3 imperative API spec: subscriber receives a snapshot, throwing
// listeners do not crash the token-manager dispatch loop.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getAuth, __resetGetAuthForTests } from '../../../src/imperative/getAuth.js';
import {
  setSession,
  clearSession,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { configureClient } from '../../../src/core/client.js';

describe('imperative/getAuth — onSessionChange snapshot adapter', () => {
  beforeEach(async () => {
    __resetGetAuthForTests();
    __resetTokenManagerForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: 'rc.4-test',
    });
  });

  afterEach(async () => {
    __resetGetAuthForTests();
    __resetTokenManagerForTests();
  });

  it('listener receives an authenticated snapshot after setSession', async () => {
    const auth = getAuth();
    const seen: Array<{ session_id: string | null; is_authenticated: boolean }> = [];
    const unsubscribe = auth.onSessionChange((snap) => {
      seen.push(snap);
    });

    await setSession({
      accessToken: 'jwt-test',
      refreshToken: 'refresh-test',
      expiresAt: Date.now() + 60_000,
      sessionId: 'sess-imperative',
    });

    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1]!;
    expect(last.session_id).toBe('sess-imperative');
    expect(last.is_authenticated).toBe(true);
    unsubscribe();
  });

  it('listener receives anonymous snapshot after clearSession', async () => {
    const auth = getAuth();
    await setSession({
      accessToken: 'jwt-test-2',
      refreshToken: 'refresh-test-2',
      expiresAt: Date.now() + 60_000,
      sessionId: 'sess-clear',
    });

    const seen: Array<{ session_id: string | null; is_authenticated: boolean }> = [];
    const unsubscribe = auth.onSessionChange((snap) => seen.push(snap));

    await clearSession();
    expect(seen.length).toBeGreaterThan(0);
    const last = seen[seen.length - 1]!;
    expect(last.session_id).toBeNull();
    expect(last.is_authenticated).toBe(false);
    unsubscribe();
  });

  it('a throwing listener does not crash subsequent listeners (try/catch isolation)', async () => {
    const auth = getAuth();
    let goodListenerFired = false;

    auth.onSessionChange(() => {
      throw new Error('listener bug');
    });
    auth.onSessionChange(() => {
      goodListenerFired = true;
    });

    await setSession({
      accessToken: 'jwt-test-3',
      refreshToken: 'refresh-test-3',
      expiresAt: Date.now() + 60_000,
      sessionId: 'sess-isolation',
    });

    // The token-manager's notifyListeners catches per-listener throws, AND
    // the imperative adapter has its own catch. Either layer suffices to
    // keep the dispatch loop alive.
    expect(goodListenerFired).toBe(true);
  });

  it('unsubscribe stops further snapshot deliveries', async () => {
    const auth = getAuth();
    let count = 0;
    const unsubscribe = auth.onSessionChange(() => {
      count += 1;
    });

    await setSession({
      accessToken: 'jwt-a',
      refreshToken: 'r-a',
      expiresAt: Date.now() + 60_000,
      sessionId: 'sess-unsub-1',
    });
    expect(count).toBeGreaterThan(0);
    const firstCount = count;

    unsubscribe();
    await setSession({
      accessToken: 'jwt-b',
      refreshToken: 'r-b',
      expiresAt: Date.now() + 60_000,
      sessionId: 'sess-unsub-2',
    });
    expect(count).toBe(firstCount);
  });

  it('getSession reflects authenticated state after setSession', async () => {
    const auth = getAuth();
    expect(auth.getSession().is_authenticated).toBe(false);
    await setSession({
      accessToken: 'jwt-x',
      refreshToken: 'r-x',
      expiresAt: Date.now() + 60_000,
      sessionId: 'sess-x',
    });
    expect(auth.getSession()).toEqual({
      session_id: 'sess-x',
      is_authenticated: true,
    });
  });

  it('getAccessToken returns the live token after setSession', async () => {
    const auth = getAuth();
    await setSession({
      accessToken: 'jwt-direct',
      refreshToken: 'r-direct',
      expiresAt: Date.now() + 60_000,
      sessionId: 'sess-direct',
    });
    const tok = await auth.getAccessToken();
    expect(tok).toBe('jwt-direct');
  });
});
