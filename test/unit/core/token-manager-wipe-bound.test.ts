// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-wipe-bound.test.ts | v1.3.0 | 2026-10-14 | BB
// v1.3.0 (token-manager v1.6.3, Devin round 2, PR #35): a refresh hands out
// its token only after its store; a DPoP mismatch or terminal error never
// clears a session another tab signed in meanwhile; a sign-in in this tab
// during the refresh call is not overwritten.
// v1.2.0 (token-manager v1.6.2, Devin PR #35): stores and wipes share one
// origin-wide lock, so a late wipe never deletes another tab's newer refresh
// token, and a retry wipe stands down when a sign-in removed the marker; a
// sign-out during a refresh makes the refresh discard its result.
// v1.1.0 (token-manager v1.6.1): the marker has an owner. A sign-in in another
// tab during a hung wipe is not re-marked by the late timeout; a wipe that
// succeeds after its bound removes its own marker, never a newer one.
// rc.24 (token-manager v1.6.0, issue #33):
//   item 4  a hung IndexedDB wipe no longer hangs clearSession(): it rejects
//           with SessionWipeTimeout after the bound, listeners still hear it;
//   item 2  a failed or timed-out wipe sets a locally-revoked marker; the next
//           refresh never uses the surviving refresh token, retries the wipe
//           and clears the marker only when the retry succeeds; a sign-in
//           clears the marker.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/core/storage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/storage.js')>();
  return {
    ...real,
    clearAllSessionState: vi.fn(real.clearAllSessionState),
    getRefreshToken: vi.fn(real.getRefreshToken),
  };
});

import {
  setSession,
  clearSession,
  getAccessToken,
  onSessionChange,
  onTokenUnavailable,
  registerRefreshCallback,
  getCurrentSessionId,
  __setWipeTimeoutMsForTests,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import * as storage from '../../../src/core/storage.js';
import { SessionWipeTimeout } from '../../../src/errors.js';

const MARKER = 'bb-universal-auth-revoked';

const tokens = (id: string) => ({
  accessToken: `at-${id}`,
  refreshToken: `rt-${id}`,
  expiresAt: Date.now() + 15 * 60_000,
  sessionId: id,
});

/**
 * A FIFO exclusive navigator.locks, shared by every "tab" in this test (one
 * origin). happy-dom has none.
 */
function installFakeLocks(): void {
  const tails = new Map<string, Promise<unknown>>();
  const locks = {
    request<T>(name: string, _opts: unknown, cb: () => Promise<T>): Promise<T> {
      const prev = tails.get(name) ?? Promise.resolve();
      const run = prev.then(() => cb());
      tails.set(name, run.catch(() => {}));
      return run;
    },
  };
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
}

function removeFakeLocks(): void {
  delete (navigator as unknown as { locks?: unknown }).locks;
}

/** Run `work` as another tab would: under the shared store lock. */
function otherTab<T>(work: () => Promise<T>): Promise<T> {
  const locks = (navigator as unknown as {
    locks: { request<R>(n: string, o: unknown, cb: () => Promise<R>): Promise<R> };
  }).locks;
  return locks.request('bb-auth-session-store', { mode: 'exclusive' }, work);
}

/** A JWT-like access token whose payload carries cnf.jkt (unsigned). */
function jwtWithJkt(jkt: string): string {
  const b64url = (v: string): string => btoa(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"ES256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub: 't', cnf: { jkt } }))}.sig`;
}

/** The next wipe hangs until release(); release(true) makes it fail. */
function hangNextWipe(): { release: (fail?: boolean) => void } {
  let release!: (fail?: boolean) => void;
  const held = new Promise<boolean>((r) => {
    release = (fail = false) => r(fail);
  });
  vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
    if (await held) throw new Error('idb blocked');
  });
  return { release };
}

describe('token-manager — wipe bound and locally-revoked marker (issue #33)', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await storage.__resetDbForTests();
    localStorage.clear();
    vi.mocked(storage.clearAllSessionState).mockClear();
    __setWipeTimeoutMsForTests(30);
  });

  afterEach(() => {
    __resetTokenManagerForTests();
    removeFakeLocks();
  });

  it('item 4: a hung wipe rejects with SessionWipeTimeout, and listeners still hear the clear', async () => {
    await setSession(tokens('A'));
    const heard = vi.fn();
    onSessionChange(heard);
    const { release } = hangNextWipe();

    const started = Date.now();
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(heard).toHaveBeenCalled();
    expect(localStorage.getItem(MARKER)).not.toBeNull();
    release();
  });

  it('item 2: the next refresh does not use the surviving refresh token; it retries the wipe', async () => {
    await setSession(tokens('A'));
    const refresh = vi.fn(async () => {
      throw new Error('must not refresh after a failed sign-out wipe');
    });
    registerRefreshCallback(refresh);
    const unavailable = vi.fn();
    onTokenUnavailable(unavailable);
    const { release } = hangNextWipe();
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);
    // The refresh token survived the hung wipe.
    expect(await storage.getRefreshToken()).not.toBeNull();
    release(true); // the hung wipe fails late

    expect(await getAccessToken()).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(unavailable).toHaveBeenCalledWith(expect.objectContaining({ reason: 'no_refresh_token' }));
    // The retry ran the real wipe: the token is gone and the marker cleared.
    expect(vi.mocked(storage.clearAllSessionState)).toHaveBeenCalledTimes(2);
    expect(await storage.getRefreshToken()).toBeNull();
    expect(localStorage.getItem(MARKER)).toBeNull();
  });

  it('item 2: a retry that fails again keeps the marker, and still never refreshes', async () => {
    await setSession(tokens('A'));
    const refresh = vi.fn(async () => {
      throw new Error('must not refresh');
    });
    registerRefreshCallback(refresh);
    const { release } = hangNextWipe();
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);
    release(true);
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      throw new Error('idb still blocked');
    });

    expect(await getAccessToken()).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
    expect(localStorage.getItem(MARKER)).not.toBeNull();
  });

  it('item 2: a sign-in clears the marker and its token is used', async () => {
    await setSession(tokens('A'));
    const { release } = hangNextWipe();
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);
    expect(localStorage.getItem(MARKER)).not.toBeNull();
    release(true);

    await setSession(tokens('B'));

    expect(localStorage.getItem(MARKER)).toBeNull();
    expect(await getAccessToken()).toBe('at-B');
    expect(await storage.getRefreshToken()).not.toBeNull();
  });

  it('a wipe that settles in time sets no marker', async () => {
    await setSession(tokens('A'));
    await clearSession();
    expect(localStorage.getItem(MARKER)).toBeNull();
  });

  it('another tab signs in during a hung wipe: the late timeout does not re-mark the device', async () => {
    await setSession(tokens('A'));
    const { release } = hangNextWipe();
    const clearing = clearSession();
    // The marker is written when the wipe starts.
    expect(localStorage.getItem(MARKER)).not.toBeNull();
    // Tab B signs in: its setSession removes the shared marker.
    localStorage.removeItem(MARKER);

    await expect(clearing).rejects.toBeInstanceOf(SessionWipeTimeout);
    expect(localStorage.getItem(MARKER)).toBeNull();
    release();
  });

  it('a wipe that succeeds after its bound removes its own marker', async () => {
    await setSession(tokens('A'));
    const { release } = hangNextWipe();
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);
    expect(localStorage.getItem(MARKER)).not.toBeNull();

    release(); // the wipe succeeds, late
    await vi.waitFor(() => expect(localStorage.getItem(MARKER)).toBeNull());
  });

  it('an older wipe that succeeds late keeps a newer sign-out marker', async () => {
    await setSession(tokens('A'));
    const { release } = hangNextWipe();
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);
    // Another tab starts its own sign-out and writes its own marker.
    localStorage.setItem(MARKER, 'other-tab-sign-out');

    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(localStorage.getItem(MARKER)).toBe('other-tab-sign-out');
  });

  it('Devin PR #35: a late wipe does not delete the refresh token another tab stored meanwhile', async () => {
    installFakeLocks();
    await setSession(tokens('A'));
    const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
      '../../../src/core/storage.js'
    );
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let wiped = false;
    // Tab A's wipe is slow to start (IndexedDB blocked), then really wipes.
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      await held;
      await real.clearAllSessionState();
      wiped = true;
    });
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);

    // Tab B signs in after A's bound: its store asks for the lock after A's wipe.
    const tabB = otherTab(() => storage.storeRefreshToken('rt-B', Date.now() + 60_000));
    // Unordered, B's store would finish here, before A's wipe runs.
    await new Promise((r) => setTimeout(r, 30));
    release();
    await tabB;
    await vi.waitFor(() => expect(wiped).toBe(true));

    expect(await storage.getRefreshToken()).toBe('rt-B');
  });

  it('Devin PR #35: a retry wipe stands down when another tab signed in before it got the lock', async () => {
    installFakeLocks();
    await setSession(tokens('A'));
    const { release } = hangNextWipe();
    await expect(clearSession()).rejects.toBeInstanceOf(SessionWipeTimeout);
    release(true); // tab A's wipe fails: the marker stays
    await new Promise((r) => setTimeout(r, 0));
    expect(localStorage.getItem(MARKER)).not.toBeNull();
    registerRefreshCallback(async () => {
      throw new Error('must not refresh');
    });

    // Tab B holds the store lock while A's next refresh queues its retry wipe.
    let letGo!: () => void;
    const gate = new Promise<void>((r) => (letGo = r));
    const tabB = otherTab(async () => {
      await gate;
      await storage.storeRefreshToken('rt-B', Date.now() + 60_000);
      localStorage.removeItem(MARKER); // B's setSession removes the marker
    });
    const refreshing = getAccessToken();
    await new Promise((r) => setTimeout(r, 5));
    letGo();
    await tabB;
    await refreshing;

    expect(await storage.getRefreshToken()).toBe('rt-B');
  });

  it('Devin PR #35: a sign-out during the refresh call does not restore the session', async () => {
    await setSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
    const changes = vi.fn();
    registerRefreshCallback(async () => {
      await clearSession(); // the user signs out while the refresh is on the wire
      changes.mockClear();
      return {
        access_token: 'at-A2',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'A',
        refresh_token: 'rt-A2',
        refresh_expires_at: new Date(Date.now() + 60_000).toISOString(),
      };
    });
    onSessionChange(changes);

    expect(await getAccessToken()).toBeNull();
    expect(getCurrentSessionId()).toBeNull();
    expect(await storage.getRefreshToken()).toBeNull();
    expect(changes).not.toHaveBeenCalled();
  });

  it('Devin PR #35: a sign-out during the refresh-token read does not refresh', async () => {
    await setSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
    const refresh = vi.fn(async () => {
      throw new Error('must not refresh after a sign-out');
    });
    registerRefreshCallback(refresh);
    vi.mocked(storage.getRefreshToken).mockImplementationOnce(async () => {
      // The read returns the token while a sign-out starts in parallel.
      void clearSession().catch(() => {});
      return 'rt-A';
    });

    expect(await getAccessToken()).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('Devin PR #35 r2: a refresh waiting on the store lock does not hand out its token', async () => {
    installFakeLocks();
    await setSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
    registerRefreshCallback(async () => ({
      access_token: 'at-A2',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      session_id: 'A',
      refresh_token: 'rt-A2',
      refresh_expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));
    let letGo!: () => void;
    const gate = new Promise<void>((r) => (letGo = r));
    const tabB = otherTab(() => gate); // another tab holds the store lock

    const first = getAccessToken();
    await new Promise((r) => setTimeout(r, 5)); // the refresh waits for the lock
    const second = getAccessToken(); // a concurrent caller
    const signOut = clearSession().catch(() => {}); // the user signs out
    letGo();
    await tabB;

    expect(await second).toBeNull();
    expect(await first).toBeNull();
    await signOut;
  });

  it('Devin PR #35 r2: a DPoP mismatch does not clear a session another tab signed in meanwhile', async () => {
    installFakeLocks();
    await setSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
    const { getOrCreateKeypair } = await import('../../../src/core/dpop/keypair.js');
    const { jwkThumbprint } = await import('../../../src/core/dpop/thumbprint.js');
    const pair = await getOrCreateKeypair();
    const localJkt = await jwkThumbprint(await crypto.subtle.exportKey('jwk', pair.publicKey));
    registerRefreshCallback(async () => ({
      access_token: jwtWithJkt(localJkt.split('').reverse().join('')),
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      session_id: 'A',
    }));
    const changes = vi.fn();
    onSessionChange(changes);
    let letGo!: () => void;
    const gate = new Promise<void>((r) => (letGo = r));
    // Tab B signs in: it holds the store lock while A's refresh comes back.
    const tabB = otherTab(async () => {
      await gate;
      await storage.storeRefreshToken('rt-B', Date.now() + 60_000);
    });

    const refreshing = getAccessToken();
    await new Promise((r) => setTimeout(r, 20));
    letGo();
    await tabB;

    await expect(refreshing).resolves.toBeNull();
    expect(await storage.getRefreshToken()).toBe('rt-B');
    expect(changes).not.toHaveBeenCalled();
  });

  it('Devin PR #35 r2: a terminal refresh error does not clear a session another tab signed in meanwhile', async () => {
    installFakeLocks();
    await setSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
    let letGo!: () => void;
    const gate = new Promise<void>((r) => (letGo = r));
    let tabB!: Promise<void>;
    registerRefreshCallback(async () => {
      // Tab B signs in while A's refresh is on the wire.
      tabB = otherTab(async () => {
        await gate;
        await storage.storeRefreshToken('rt-B', Date.now() + 60_000);
      });
      throw Object.assign(new Error('revoked'), { code: 'AUTH_SESSION_REVOKED' });
    });
    const changes = vi.fn();
    onSessionChange(changes);

    const refreshing = getAccessToken();
    const settled = refreshing.catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 20));
    letGo();
    await tabB;

    expect(await settled).toMatchObject({ code: 'AUTH_SESSION_REVOKED' });
    expect(await storage.getRefreshToken()).toBe('rt-B');
    expect(changes).not.toHaveBeenCalled();
  });

  it('Devin PR #35 r2: a sign-in during the refresh call is not overwritten by the old refresh', async () => {
    await setSession({ ...tokens('A'), expiresAt: Date.now() - 1 });
    registerRefreshCallback(async () => {
      await setSession(tokens('B')); // the user signs in again meanwhile
      return {
        access_token: 'at-A2',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'A',
        refresh_token: 'rt-A2',
        refresh_expires_at: new Date(Date.now() + 60_000).toISOString(),
      };
    });

    expect(await getAccessToken()).toBe('at-B');
    expect(getCurrentSessionId()).toBe('B');
    expect(await storage.getRefreshToken()).toBe('rt-B');
  });
});
