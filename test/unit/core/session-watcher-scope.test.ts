// @samjonaidi-ship-it/universal-auth | test/unit/core/session-watcher-scope.test.ts | v1.2.0 | 2026-10-14 | BB
// v1.2.0 (session-watcher v1.3.1, pre-push review): a failed IndexedDB wipe
// is reported as wipe_failed: true.
// v1.1.0 (rc.23, issue #32): session.revoked is emitted after the clear, and
// says stale: true when a sign-in during the wipe superseded the clear.
// rc.22 (session-watcher v1.2.0): a revoked /me poll is scoped to the session
// it started under. A 401 that comes back after a NEW session was installed
// must not clear the new one, and the session.revoked event names the session
// it is about (CalExp5 #881's isReplacedSessionExpiry, now in the SDK).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let rejectMe: ((e: unknown) => void) | null = null;

vi.mock('../../../src/core/client.js', () => ({
  get: vi.fn(
    () =>
      new Promise((_res, rej) => {
        rejectMe = rej;
      })
  ),
}));
vi.mock('../../../src/core/event-reporter.js', () => ({ emit: vi.fn(async () => {}) }));
vi.mock('../../../src/core/entitlements.js', () => ({ refreshEntitlements: vi.fn(async () => {}) }));
vi.mock('../../../src/config.js', () => ({ getUseSSE: () => 'never' }));
vi.mock('../../../src/core/storage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/storage.js')>();
  return { ...real, clearAllSessionState: vi.fn(real.clearAllSessionState) };
});

import {
  configureSessionWatcher,
  startSessionWatcher,
  __resetSessionWatcherForTests,
} from '../../../src/core/session-watcher.js';
import {
  setSession,
  getCurrentSessionId,
  hasLiveAccessToken,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import * as storage from '../../../src/core/storage.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { emit } from '../../../src/core/event-reporter.js';
import { get } from '../../../src/core/client.js';
import { AuthSessionRevoked } from '../../../src/errors.js';

const tokens = (id: string) => ({
  accessToken: `at-${id}`,
  refreshToken: `rt-${id}`,
  expiresAt: Date.now() + 15 * 60_000,
  sessionId: id,
});

describe('session-watcher — revoke is scoped to the polling session', () => {
  beforeEach(async () => {
    __resetSessionWatcherForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    vi.mocked(emit).mockClear();
    vi.mocked(get).mockClear();
    rejectMe = null;
    configureSessionWatcher({ intervalMs: 5 });
  });

  afterEach(() => {
    __resetSessionWatcherForTests();
  });

  it('a 401 for a session that was replaced mid-poll does NOT clear the new session', async () => {
    await setSession(tokens('sess-A'));
    startSessionWatcher();
    await vi.waitFor(() => expect(rejectMe).not.toBeNull());

    // Sign-in as B while A's poll is in flight, then A's poll comes back 401.
    await setSession(tokens('sess-B'));
    rejectMe?.(new AuthSessionRevoked('revoked'));

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith(
        'session.revoked',
        expect.objectContaining({ reason: 'server', session_id: 'sess-A', stale: true })
      )
    );
    expect(getCurrentSessionId()).toBe('sess-B');
    expect(hasLiveAccessToken()).toBe(true);
  });

  it('a 401 for the CURRENT session still clears it, and names it', async () => {
    await setSession(tokens('sess-C'));
    startSessionWatcher();
    await vi.waitFor(() => expect(rejectMe).not.toBeNull());

    rejectMe?.(new AuthSessionRevoked('revoked'));

    await vi.waitFor(() => expect(getCurrentSessionId()).toBeNull());
    expect(emit).toHaveBeenCalledWith(
      'session.revoked',
      expect.objectContaining({ reason: 'server', session_id: 'sess-C' })
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('issue #32: a clear superseded by a sign-in is reported stale, and only after the clear', async () => {
    await setSession(tokens('sess-D'));
    startSessionWatcher();
    await vi.waitFor(() => expect(rejectMe).not.toBeNull());

    let releaseWipe!: () => void;
    const held = new Promise<void>((r) => {
      releaseWipe = r;
    });
    const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
      '../../../src/core/storage.js'
    );
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      await held;
      await real.clearAllSessionState();
    });

    rejectMe?.(new AuthSessionRevoked('revoked'));
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    // The wipe is held: nothing may announce the revoke yet.
    expect(vi.mocked(emit).mock.calls.some((c) => c[0] === 'session.revoked')).toBe(false);

    const installing = setSession(tokens('sess-E'));
    releaseWipe();
    await installing;

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith(
        'session.revoked',
        expect.objectContaining({ session_id: 'sess-D', stale: true })
      )
    );
    expect(getCurrentSessionId()).toBe('sess-E');
    expect(hasLiveAccessToken()).toBe(true);
  });

  it('review: a failed IndexedDB wipe is reported as wipe_failed', async () => {
    await setSession(tokens('sess-E'));
    startSessionWatcher();
    await vi.waitFor(() => expect(rejectMe).not.toBeNull());
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      throw new Error('idb blocked');
    });

    rejectMe?.(new AuthSessionRevoked('revoked'));

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith(
        'session.revoked',
        expect.objectContaining({ session_id: 'sess-E', wipe_failed: true })
      )
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(getCurrentSessionId()).toBeNull();
  });
});
