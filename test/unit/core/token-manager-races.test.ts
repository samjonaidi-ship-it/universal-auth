// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-races.test.ts | v1.1.0 | 2026-10-14 | BB
// rc.22 Devin round 1 (PR #31) — two awaits inside token-manager that a
// sign-in can land in the middle of:
//   1. clearSession() awaits the IndexedDB wipe. A setSession(B) during it
//      must keep B's refresh token and keypair, and must not be told "cleared".
//   2. performRefresh() awaits getRefreshToken(). A null that answers for the
//      old session must not fire onTokenUnavailable or hide B's token.
// The storage and keypair modules are wrapped so a test can hold an await.
// v1.1.0 (pre-push review, PR #31): only a setSession() install makes a clear
// stand down; clearSessionIfCurrent() reports a superseded clear; wipes chain;
// a cookie-session note during the lookup still reports the missing token.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/core/storage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/storage.js')>();
  return {
    ...real,
    getRefreshToken: vi.fn(real.getRefreshToken),
    clearAllSessionState: vi.fn(real.clearAllSessionState),
  };
});
vi.mock('../../../src/core/dpop/keypair.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/dpop/keypair.js')>();
  return { ...real, deleteKeypair: vi.fn(real.deleteKeypair) };
});

import {
  setSession,
  clearSession,
  clearSessionIfCurrent,
  getAccessToken,
  getSessionScope,
  noteCookieSession,
  getCurrentSessionId,
  onSessionChange,
  onTokenUnavailable,
  registerRefreshCallback,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import * as storage from '../../../src/core/storage.js';
import { deleteKeypair } from '../../../src/core/dpop/keypair.js';

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

/** Holds the next clearAllSessionState() until the returned gate resolves. */
async function holdNextWipe(): Promise<{ resolve: (v: void) => void }> {
  const gate = deferred<void>();
  const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
    '../../../src/core/storage.js'
  );
  vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
    await gate.promise;
    await real.clearAllSessionState();
  });
  return gate;
}

describe('token-manager — sign-in racing an in-flight await (Devin round 1)', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await storage.__resetDbForTests();
    vi.mocked(deleteKeypair).mockClear();
    vi.mocked(storage.getRefreshToken).mockClear();
    vi.mocked(storage.clearAllSessionState).mockClear();
  });

  it('a sign-in during clearSession() keeps its refresh token and keypair, and is not reported cleared', async () => {
    await setSession(tokens('sess-A'));
    const listener = vi.fn();
    onSessionChange(listener);

    const gate = deferred<void>();
    const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
      '../../../src/core/storage.js'
    );
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      await gate.promise;
      await real.clearAllSessionState();
    });

    const clearing = clearSession();
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    const installing = setSession(tokens('sess-B'));
    // Give an install that does NOT wait time to write B's refresh token
    // before the held wipe runs (that ordering is the bug).
    await new Promise((r) => setTimeout(r, 50));
    gate.resolve();
    await Promise.all([clearing, installing]);

    expect(getCurrentSessionId()).toBe('sess-B');
    expect(await storage.getRefreshToken()).toBe('rt-sess-B');
    expect(deleteKeypair).not.toHaveBeenCalled();
    // One notification: B's install. The superseded clear stays silent.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('a no-refresh-token answer that races a sign-in returns the new token and fires no event', async () => {
    registerRefreshCallback(async () => {
      throw new Error('must not refresh: B already has a live token');
    });
    const unavailable = vi.fn();
    onTokenUnavailable(unavailable);

    const lookup = deferred<string | null>();
    vi.mocked(storage.getRefreshToken).mockImplementationOnce(() => lookup.promise);

    const pending = getAccessToken();
    await vi.waitFor(() => expect(storage.getRefreshToken).toHaveBeenCalled());
    await setSession(tokens('sess-B'));
    lookup.resolve(null); // the answer about the old (empty) session

    expect(await pending).toBe('at-sess-B');
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('a late /me naming the old cookie session during the wipe does not cancel the sign-out', async () => {
    await setSession(tokens('sess-A'));
    const listener = vi.fn();
    onSessionChange(listener);
    const gate = await holdNextWipe();

    const clearing = clearSession();
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    noteCookieSession('sess-A'); // moves the generation, installs nothing
    gate.resolve();
    await clearing;

    expect(deleteKeypair).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clearSessionIfCurrent() returns false when a sign-in superseded its clear', async () => {
    await setSession(tokens('sess-A'));
    const scope = getSessionScope();
    const gate = await holdNextWipe();

    const clearing = clearSessionIfCurrent(scope);
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    const installing = setSession(tokens('sess-B'));
    gate.resolve();

    expect(await clearing).toBe(false);
    await installing;
    expect(getCurrentSessionId()).toBe('sess-B');
  });

  it('two overlapping clears: a sign-in waits for both wipes and keeps its refresh token', async () => {
    await setSession(tokens('sess-A'));
    const gate = await holdNextWipe();

    const first = clearSession();
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    const second = clearSession();
    await new Promise((r) => setTimeout(r, 20));
    const installing = setSession(tokens('sess-B'));
    // Give an install that waits only for the second wipe time to write B's
    // refresh token before the held first wipe runs (that ordering is the bug).
    await new Promise((r) => setTimeout(r, 50));
    gate.resolve();
    await Promise.all([first, second, installing]);

    expect(await storage.getRefreshToken()).toBe('rt-sess-B');
  });

  it('a cookie-session note during the lookup still reports the missing refresh token', async () => {
    registerRefreshCallback(async () => {
      throw new Error('must not refresh: there is no refresh token');
    });
    const unavailable = vi.fn();
    onTokenUnavailable(unavailable);

    const lookup = deferred<string | null>();
    vi.mocked(storage.getRefreshToken).mockImplementationOnce(() => lookup.promise);

    const pending = getAccessToken();
    await vi.waitFor(() => expect(storage.getRefreshToken).toHaveBeenCalled());
    noteCookieSession('sess-cookie-1'); // a /me reply: new generation, no install
    lookup.resolve(null);

    expect(await pending).toBeNull();
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
});
