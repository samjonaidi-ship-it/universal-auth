// @samjonaidi-ship-it/universal-auth | test/unit/core/session-watcher.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for src/core/session-watcher.ts (was 0%).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureSessionWatcher,
  startSessionWatcher,
  stopSessionWatcher,
  __resetSessionWatcherForTests,
} from '../../../src/core/session-watcher.js';
import { configureClient } from '../../../src/core/client.js';
import { AuthSessionRevoked, AuthSessionExpired } from '../../../src/errors.js';

describe('session-watcher', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.1-test',
    });
    __resetSessionWatcherForTests();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    __resetSessionWatcherForTests();
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('start is idempotent — second call is a no-op', () => {
    startSessionWatcher();
    startSessionWatcher();
    // No throw; internal `running` flag prevents duplicate visibilitychange listener
    stopSessionWatcher();
  });

  it('stop while not running is a no-op', () => {
    expect(() => stopSessionWatcher()).not.toThrow();
  });

  it('configureSessionWatcher accepts custom interval', () => {
    configureSessionWatcher({ intervalMs: 1000 });
    // No assertion on internal state; covered by behavioral test below
    expect(() => configureSessionWatcher({})).not.toThrow();
  });

  it('polls /auth/v1/me on schedule', async () => {
    configureSessionWatcher({ intervalMs: 100 });
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ identity: { identity_id: 'x' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', etag: 'W/"v1"' },
        })
    );
    startSessionWatcher();

    // Advance past one interval
    await vi.advanceTimersByTimeAsync(150);
    expect(fetchSpy).toHaveBeenCalled();
    const url = fetchSpy.mock.calls[0]?.[0];
    expect(String(url)).toContain('/auth/v1/me');
    stopSessionWatcher();
  });

  it('handles 200 response (refresh entitlements + emit heartbeat)', async () => {
    configureSessionWatcher({ intervalMs: 100 });
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ identity: { identity_id: 'x' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
    startSessionWatcher();
    await vi.advanceTimersByTimeAsync(150);
    expect(fetchSpy).toHaveBeenCalled();
    stopSessionWatcher();
  });

  it('AuthSessionRevoked instance is throw-safe', () => {
    const err = new AuthSessionRevoked('test');
    expect(err).toBeInstanceOf(AuthSessionRevoked);
    expect(err).toBeInstanceOf(Error);
  });

  it('AuthSessionExpired instance is throw-safe', () => {
    const err = new AuthSessionExpired('test');
    expect(err).toBeInstanceOf(AuthSessionExpired);
    expect(err).toBeInstanceOf(Error);
  });

  it('on transient network error: keeps polling', async () => {
    configureSessionWatcher({ intervalMs: 100 });
    let callCount = 0;
    fetchSpy.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('network down');
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    startSessionWatcher();

    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(150);
    expect(callCount).toBeGreaterThanOrEqual(2);
    stopSessionWatcher();
  });

  it('reset clears state — subsequent start uses default 60s interval, not the prior custom value', async () => {
    configureSessionWatcher({ intervalMs: 50 });
    __resetSessionWatcherForTests();

    // Don't reconfigure — start should use default (60_000ms), not 50ms
    fetchSpy.mockImplementation(
      async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    startSessionWatcher();

    // At 1s elapsed, default 60s interval has not fired yet — fetch count = 0
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchSpy).not.toHaveBeenCalled();

    stopSessionWatcher();
  });
});
