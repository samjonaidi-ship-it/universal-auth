// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-wipe-bound.test.ts | v1.1.0 | 2026-10-14 | BB
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
  return { ...real, clearAllSessionState: vi.fn(real.clearAllSessionState) };
});

import {
  setSession,
  clearSession,
  getAccessToken,
  onSessionChange,
  onTokenUnavailable,
  registerRefreshCallback,
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
});
