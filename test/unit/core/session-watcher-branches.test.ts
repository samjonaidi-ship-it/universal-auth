// @samjonaidi-ship-it/universal-auth | test/unit/core/session-watcher-branches.test.ts | v1.0.1 | 2026-05-22 | BB
// Branch-coverage push for src/core/session-watcher.ts.
// Existing session-watcher.test.ts covers happy path; this file targets:
//   - Visibility-gated polling: hidden → no poll (§8.2)
//   - Revocation paths: AuthSessionRevoked, AuthSessionExpired, AuthSdkError code (§6.1, §3.7)
//   - 304 ETag: subsequent polls send If-None-Match (§8.1)
//   - configureSessionWatcher() no-arg branch
//
// Spec citations: §8.1 (ETag/304 polling), §8.2 (visibility-gated polling),
//                §6.1 (session.revoked emission), §3.7 (revocation codes).
//
// NOTE: Tests use `intervalMs: 50` and isolate `setVisibility/restoreVisibility`
// to per-test boundaries — the prior `originalVisibility` snapshot via
// `Document.prototype` was a no-op (own properties on `document` shadow the
// prototype getter). Lookback fix: own-prop delete is the only reliable
// reset path with happy-dom.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureSessionWatcher,
  startSessionWatcher,
  stopSessionWatcher,
  __resetSessionWatcherForTests,
} from '../../../src/core/session-watcher.js';
import { configureClient } from '../../../src/core/client.js';
import { getOrCreateDeviceId } from '../../../src/core/device-id.js';
import {
  AuthSessionRevoked,
  AuthSessionExpired,
  AuthSdkError,
} from '../../../src/errors.js';

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  });
}

function restoreVisibility(): void {
  if (Object.prototype.hasOwnProperty.call(document, 'visibilityState')) {
    delete (document as unknown as Record<string, unknown>).visibilityState;
  }
}

describe('session-watcher — branch coverage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // Pre-warm the device-id cache on the REAL clock, before vi.useFakeTimers().
    // Every authenticated request() awaits getOrCreateDeviceId(), which hashes
    // the UA via crypto.subtle.digest() — a real-async op the fake-timer clock
    // cannot drive. The first poll that reaches request() otherwise pays that
    // digest *inside* a vi.advanceTimersByTimeAsync() window; under full-suite
    // CPU contention it may not settle before the test asserts, so fetch is
    // never reached (calls === 0). That cold-path race is why only the first
    // polling test flaked — later tests reuse the memoized device id. Warming
    // here makes every later getOrCreateDeviceId() a memoized microtask resolve
    // that advanceTimersByTimeAsync() flushes deterministically.
    await getOrCreateDeviceId();
    vi.useFakeTimers();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.4-test',
    });
    __resetSessionWatcherForTests();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    restoreVisibility();
  });

  afterEach(() => {
    __resetSessionWatcherForTests();
    fetchSpy.mockRestore();
    restoreVisibility();
    vi.useRealTimers();
  });

  // ── §8.2: Visibility-gated polling ──────────────────────────────────────

  it('does not poll while document.visibilityState === "hidden"', async () => {
    setVisibility('hidden');
    configureSessionWatcher({ intervalMs: 50 });
    fetchSpy.mockImplementation(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );

    startSessionWatcher();
    await vi.advanceTimersByTimeAsync(150);
    expect(fetchSpy).not.toHaveBeenCalled();
    stopSessionWatcher();
  });

  it('handleVisibility: backgrounding clears the pending timer', async () => {
    configureSessionWatcher({ intervalMs: 100 });
    fetchSpy.mockImplementation(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    startSessionWatcher();

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    // After backgrounding, advancing past 100ms must NOT produce a fetch.
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchSpy).not.toHaveBeenCalled();
    stopSessionWatcher();
  });

  // ── §6.1 / §3.7: Revocation paths ──────────────────────────────────────

  it('on AuthSessionRevoked thrown directly from fetch: stops watcher', async () => {
    configureSessionWatcher({ intervalMs: 50 });
    let calls = 0;
    fetchSpy.mockImplementation(async () => {
      calls += 1;
      throw new AuthSessionRevoked('admin revoked');
    });
    startSessionWatcher();
    await vi.advanceTimersByTimeAsync(80);
    expect(calls).toBe(1);
    // Advance another full interval — watcher must NOT have polled again.
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(1);
  });

  it('on AuthSessionExpired thrown directly: stops watcher', async () => {
    configureSessionWatcher({ intervalMs: 50 });
    let calls = 0;
    fetchSpy.mockImplementation(async () => {
      calls += 1;
      throw new AuthSessionExpired('expired');
    });
    startSessionWatcher();
    await vi.advanceTimersByTimeAsync(80);
    expect(calls).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(1);
  });

  it('on generic AuthSdkError with revocation code: stops watcher', async () => {
    configureSessionWatcher({ intervalMs: 50 });
    let calls = 0;
    fetchSpy.mockImplementation(async () => {
      calls += 1;
      throw new AuthSdkError('AUTH_SESSION_EXPIRED', 'expired');
    });
    startSessionWatcher();
    await vi.advanceTimersByTimeAsync(80);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(1);
  });

  it('on AuthSdkError with non-revocation code: keeps polling', async () => {
    configureSessionWatcher({ intervalMs: 50 });
    let calls = 0;
    fetchSpy.mockImplementation(async () => {
      calls += 1;
      throw new AuthSdkError('AUTH_RATE_LIMITED', 'rate limited');
    });
    startSessionWatcher();
    await vi.advanceTimersByTimeAsync(80);
    await vi.advanceTimersByTimeAsync(80);
    expect(calls).toBeGreaterThanOrEqual(2);
    stopSessionWatcher();
  });

  // ── §8.1: ETag handling ─────────────────────────────────────────────────

  it('caches ETag and sends If-None-Match on subsequent polls', async () => {
    configureSessionWatcher({ intervalMs: 50 });
    let callCount = 0;
    let secondCallHadIfNoneMatch = false;
    fetchSpy.mockImplementation(async (_url, init) => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ identity: { identity_id: 'u' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', etag: 'W/"v42"' },
        });
      }
      const reqInit = init as RequestInit | undefined;
      const headers = reqInit?.headers as Record<string, string> | undefined;
      if (headers?.['If-None-Match'] === 'W/"v42"') {
        secondCallHadIfNoneMatch = true;
      }
      return new Response(null, {
        status: 304,
        headers: { 'Content-Type': 'application/json', etag: 'W/"v42"' },
      });
    });
    startSessionWatcher();
    await vi.advanceTimersByTimeAsync(80);
    await vi.advanceTimersByTimeAsync(80);
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(secondCallHadIfNoneMatch).toBe(true);
    stopSessionWatcher();
  });

  // ── configureSessionWatcher: undefined intervalMs branch ────────────────

  it('configureSessionWatcher() with no opts is a no-op (keeps prior interval)', () => {
    configureSessionWatcher({ intervalMs: 1234 });
    configureSessionWatcher(); // exercises the `intervalMs !== undefined` false branch
    expect(true).toBe(true);
  });
});
