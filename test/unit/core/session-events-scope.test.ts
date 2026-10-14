// @samjonaidi-ship-it/universal-auth | test/unit/core/session-events-scope.test.ts | v1.0.0 | 2026-10-14 | BB
// rc.23 (session-events v0.2.0, issue #32): an SSE `session.revoked` clears
// only the session current when it arrived, and is emitted after the clear,
// with stale: true when a sign-in during the wipe superseded the clear.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/core/event-reporter.js', () => ({ emit: vi.fn(async () => {}) }));
vi.mock('../../../src/core/entitlements.js', () => ({ refreshEntitlements: vi.fn(async () => {}) }));
vi.mock('../../../src/core/storage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/storage.js')>();
  return { ...real, clearAllSessionState: vi.fn(real.clearAllSessionState) };
});

import { startSessionEvents, __resetSessionEventsForTests } from '../../../src/core/session-events.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  setSession,
  getCurrentSessionId,
  hasLiveAccessToken,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import * as storage from '../../../src/core/storage.js';
import { emit } from '../../../src/core/event-reporter.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  readyState = 1;
  private listeners = new Map<string, Set<(ev: MessageEvent) => void>>();
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, l: (ev: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(l);
    this.listeners.set(type, set);
  }
  close(): void {
    this.readyState = 2;
  }
  dispatch(type: string, data: unknown): void {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    this.listeners.get(type)?.forEach((l) => l(ev));
  }
}

const tokens = (id: string) => ({
  accessToken: `at-${id}`,
  refreshToken: `rt-${id}`,
  expiresAt: Date.now() + 15 * 60_000,
  sessionId: id,
});

describe('session-events — revoke is scoped and reported after the clear', () => {
  beforeEach(async () => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    __resetClientForTests();
    configureClient({ apiBaseUrl: 'https://ct-bff.test', appId: 'bb_test', sdkVersion: '0.1.0-test' });
    __resetTokenManagerForTests();
    __resetSessionEventsForTests();
    await storage.__resetDbForTests();
    vi.mocked(emit).mockClear();
    vi.mocked(storage.clearAllSessionState).mockClear();
  });

  afterEach(() => {
    __resetSessionEventsForTests();
    vi.unstubAllGlobals();
  });

  it('a current-session revoke clears it and is not stale', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke' });

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ reason: 'admin_revoke' }))
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(getCurrentSessionId()).toBeNull();
  });

  it('a sign-in during the wipe keeps its session; the revoke is reported stale, after the clear', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();

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

    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke' });
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    expect(vi.mocked(emit).mock.calls.some((c) => c[0] === 'session.revoked')).toBe(false);

    const installing = setSession(tokens('sess-B'));
    releaseWipe();
    await installing;

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ stale: true }))
    );
    expect(getCurrentSessionId()).toBe('sess-B');
    expect(hasLiveAccessToken()).toBe(true);
  });
});
