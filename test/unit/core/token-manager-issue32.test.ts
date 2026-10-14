// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-issue32.test.ts | v1.2.0 | 2026-10-14 | BB
// v1.2.0 (token-manager v1.5.2, Devin PR #34): a server-wins cookie note that
//   drops the install's token during its store makes the install stand down:
//   no notify (it would read as a sign-out), no broadcast of the dropped token.
// v1.1.0 (token-manager v1.5.1, pre-push review): a /me naming a cookie
//   session during the install store does not silence the install's notify.
// rc.23 (token-manager v1.5.0) — issue #32, follow-ups from PR #31's review:
//   - a server-wins noteCookieSession() drops the old session's access token;
//   - a clearSession() that starts while setSession() stores its refresh token
//     waits for that store, so the sign-out leaves no refresh token behind,
//     and the overtaken install tells no listener;
//   - a rejected IndexedDB wipe still notifies listeners, then rejects.
// The storage module is wrapped so a test can hold an await.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/core/storage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/storage.js')>();
  return {
    ...real,
    storeRefreshToken: vi.fn(real.storeRefreshToken),
    clearAllSessionState: vi.fn(real.clearAllSessionState),
  };
});

import {
  setSession,
  clearSession,
  getCurrentSessionId,
  getSessionScope,
  hasLiveAccessToken,
  noteCookieSession,
  onSessionChange,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import * as storage from '../../../src/core/storage.js';

const tokens = (id: string) => ({
  accessToken: `at-${id}`,
  refreshToken: `rt-${id}`,
  expiresAt: Date.now() + 15 * 60_000,
  sessionId: id,
});

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('token-manager — issue #32 follow-ups (rc.23)', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await storage.__resetDbForTests();
    vi.mocked(storage.storeRefreshToken).mockClear();
    vi.mocked(storage.clearAllSessionState).mockClear();
  });

  it('a server-wins cookie note drops the old session access token', async () => {
    await setSession(tokens('sess-A'));
    expect(hasLiveAccessToken()).toBe(true);

    noteCookieSession('sess-Z'); // /me names a different session

    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-Z', source: 'cookie' });
    expect(hasLiveAccessToken()).toBe(false);
    // The refresh token stays: a later refresh re-adopts its own session.
    expect(await storage.getRefreshToken()).toBe('rt-sess-A');
  });

  it('a clear that starts during the install store leaves no refresh token and wins', async () => {
    const listener = vi.fn();
    onSessionChange(listener);

    const gate = deferred<void>();
    const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
      '../../../src/core/storage.js'
    );
    vi.mocked(storage.storeRefreshToken).mockImplementationOnce(async (rt, exp) => {
      await gate.promise;
      await real.storeRefreshToken(rt, exp);
    });

    const installing = setSession(tokens('sess-A'));
    await vi.waitFor(() => expect(storage.storeRefreshToken).toHaveBeenCalled());
    const clearing = clearSession();
    // Give a wipe that does NOT wait for the store time to run first (that
    // ordering is the bug: the store then lands after the sign-out).
    await new Promise((r) => setTimeout(r, 50));
    gate.resolve();
    await Promise.all([installing, clearing]);

    expect(getCurrentSessionId()).toBeNull();
    expect(hasLiveAccessToken()).toBe(false);
    expect(await storage.getRefreshToken()).toBeNull();
    // One notification: the sign-out. The overtaken install stays silent.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a rejected wipe still tells listeners, then rejects', async () => {
    await setSession(tokens('sess-A'));
    const listener = vi.fn();
    onSessionChange(listener);
    vi.mocked(storage.clearAllSessionState).mockRejectedValueOnce(new Error('idb down'));

    await expect(clearSession()).rejects.toThrow('idb down');

    expect(getCurrentSessionId()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('Devin PR #34: a cookie note that drops the install token during the store silences the install', async () => {
    const listener = vi.fn();
    onSessionChange(listener);
    const posted = vi.spyOn(BroadcastChannel.prototype, 'postMessage');

    const gate = deferred<void>();
    const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
      '../../../src/core/storage.js'
    );
    vi.mocked(storage.storeRefreshToken).mockImplementationOnce(async (rt, exp) => {
      await gate.promise;
      await real.storeRefreshToken(rt, exp);
    });

    const installing = setSession(tokens('sess-A'));
    await vi.waitFor(() => expect(storage.storeRefreshToken).toHaveBeenCalled());
    noteCookieSession('sess-Z'); // /me names cookie session Z; A's token is dropped
    gate.resolve();
    await installing;

    // A notify here would read as a sign-out (no live token) in AuthProvider.
    expect(listener).not.toHaveBeenCalled();
    expect(posted).not.toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'at-sess-A' }));
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-Z', source: 'cookie' });
    posted.mockRestore();
  });
});
