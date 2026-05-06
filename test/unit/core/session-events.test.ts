// @samjonaidi-ship-it/universal-auth | test/unit/core/session-events.test.ts | v0.1.0 | 2026-05-06 | BB
// Coverage for src/core/session-events.ts (SSE_DESIGN_v1.0.md §5).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  startSessionEvents,
  stopSessionEvents,
  __resetSessionEventsForTests,
  __isSessionEventsActiveForTests,
} from '../../../src/core/session-events.js';
import { configureClient } from '../../../src/core/client.js';
import {
  __resetSessionWatcherForTests,
  startSessionWatcher,
  stopSessionWatcher,
} from '../../../src/core/session-watcher.js';
import {
  clearSession,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetEntitlementsForTests } from '../../../src/core/entitlements.js';
import { initUniversalAuth } from '../../../src/config.js';

// ── EventSource mock ──────────────────────────────────────────────────────
//
// happy-dom doesn't ship a real EventSource. We install a class that records
// every constructor + addEventListener call, lets tests dispatch synthetic
// typed events, and exposes readyState manipulation for the reconnect path.

const ES_CONNECTING = 0;
const ES_OPEN = 1;
const ES_CLOSED = 2;

interface MockEventSourceInit {
  withCredentials?: boolean;
}

class MockEventSource {
  static CONNECTING = ES_CONNECTING;
  static OPEN = ES_OPEN;
  static CLOSED = ES_CLOSED;
  static instances: MockEventSource[] = [];

  url: string;
  withCredentials: boolean;
  readyState: number = ES_CONNECTING;
  closed = false;

  private listeners = new Map<string, Set<(ev: MessageEvent) => void>>();

  constructor(url: string | URL, init?: MockEventSourceInit) {
    this.url = String(url);
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (ev: MessageEvent) => void): void {
    let set = this.listeners.get(type);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (ev: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.readyState = ES_CLOSED;
  }

  // Test helpers
  dispatch(type: string, data: unknown): void {
    const ev = { data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent;
    this.listeners.get(type)?.forEach((l) => l(ev));
  }

  triggerOpen(): void {
    this.readyState = ES_OPEN;
    this.dispatch('open', '');
  }

  triggerError({ closed }: { closed: boolean }): void {
    if (closed) this.readyState = ES_CLOSED;
    this.dispatch('error', '');
  }
}

// ── Test setup ────────────────────────────────────────────────────────────

const API_BASE = 'https://ct-bff.test';

beforeEach(async () => {
  MockEventSource.instances = [];
  vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);

  configureClient({
    apiBaseUrl: API_BASE,
    appId: 'bb_test',
    sdkVersion: '0.1.0-test',
  });
  __resetTokenManagerForTests();
  __resetSessionWatcherForTests();
  __resetSessionEventsForTests();
  __resetEntitlementsForTests();

  // Default to useSSE: 'auto' — overridden by specific tests as needed.
  // mode: 'development' so the v1.1.0 P1-I production-mode apiBaseUrl
  // validation doesn't reject the synthetic `ct-bff.test` host.
  await initUniversalAuth({
    apiBaseUrl: API_BASE,
    appId: 'bb_test',
    mode: 'development',
  });
});

afterEach(() => {
  __resetSessionEventsForTests();
  __resetSessionWatcherForTests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── Specs ─────────────────────────────────────────────────────────────────

describe('session-events', () => {
  it('startSessionEvents() opens an EventSource at the right URL with withCredentials=true', () => {
    startSessionEvents();
    expect(MockEventSource.instances.length).toBe(1);
    const es = MockEventSource.instances[0]!;
    expect(es.url).toBe(`${API_BASE}/auth/v1/session/events`);
    expect(es.withCredentials).toBe(true);
  });

  it('is idempotent — second startSessionEvents() does not open a second connection', () => {
    startSessionEvents();
    startSessionEvents();
    expect(MockEventSource.instances.length).toBe(1);
  });

  it('stopSessionEvents() closes the EventSource', () => {
    startSessionEvents();
    const es = MockEventSource.instances[0]!;
    expect(es.closed).toBe(false);
    stopSessionEvents();
    expect(es.closed).toBe(true);
    expect(__isSessionEventsActiveForTests()).toBe(false);
  });

  it('session.revoked event triggers stream close + clearSession', async () => {
    startSessionEvents();
    const es = MockEventSource.instances[0]!;
    es.triggerOpen();

    es.dispatch('session.revoked', { reason: 'admin_revoke', admin_id: 'a-1' });

    // Microtask drain so the void emit + void clearSession scheduled inside
    // the event handler get a chance to run.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(es.closed).toBe(true);
    expect(__isSessionEventsActiveForTests()).toBe(false);
  });

  it('entitlements.updated event triggers refreshEntitlements (calls /auth/v1/me)', async () => {
    vi.restoreAllMocks();
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url instanceof Request ? url.url : url));
      return new Response(
        JSON.stringify({ identity: { identity_id: 'x' }, aggregate: { features: [], app_access: [] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });
    globalThis.fetch = fakeFetch as unknown as typeof globalThis.fetch;

    try {
      startSessionEvents();
      const es = MockEventSource.instances[0]!;
      es.triggerOpen();
      es.dispatch('entitlements.updated', { feature_keys_changed: ['x'] });

      // Drain the void refreshEntitlements() promise — fetch + IDB roundtrips.
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 0));
      }

      const calledMe = calls.some((u) => u.includes('/auth/v1/me'));
      expect(calledMe).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('session.heartbeat is a no-op (does not close the stream)', () => {
    startSessionEvents();
    const es = MockEventSource.instances[0]!;
    es.triggerOpen();
    es.dispatch('session.heartbeat', { server_ts: '2026-05-06T00:00:00Z' });
    expect(es.closed).toBe(false);
    expect(__isSessionEventsActiveForTests()).toBe(true);
  });

  it('3 reconnect failures triggers polling fallback', async () => {
    vi.useFakeTimers();
    startSessionEvents();
    expect(MockEventSource.instances.length).toBe(1);

    // Failure 1 — counter=1, schedules a 1s reconnect.
    MockEventSource.instances[0]!.triggerError({ closed: true });
    await vi.runOnlyPendingTimersAsync();
    expect(MockEventSource.instances.length).toBe(2);

    // Failure 2 — counter=2, schedules a 2s reconnect.
    MockEventSource.instances[1]!.triggerError({ closed: true });
    await vi.runOnlyPendingTimersAsync();
    expect(MockEventSource.instances.length).toBe(3);

    // Failure 3 — counter hits MAX_FALLBACK_FAILURES (3); fallback runs.
    MockEventSource.instances[2]!.triggerError({ closed: true });
    // Drain dynamic-import + microtasks inside handleFallback. Use real
    // timers so the dynamic import + its microtask chain can resolve.
    vi.useRealTimers();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1));
    }

    expect(__isSessionEventsActiveForTests()).toBe(false);
    expect(MockEventSource.instances.length).toBe(3);
  });

  it('clearSession() also stops session events (lifecycle integration)', async () => {
    startSessionEvents();
    const es = MockEventSource.instances[0]!;
    expect(es.closed).toBe(false);

    await clearSession();
    // dynamic import inside clearSession is async; let it settle
    await Promise.resolve();
    await Promise.resolve();

    expect(es.closed).toBe(true);
    expect(__isSessionEventsActiveForTests()).toBe(false);
  });

  it('useSSE: "never" — startSessionWatcher() does NOT open SSE; polling starts instead', async () => {
    // Re-init with useSSE: 'never'.
    __resetSessionEventsForTests();
    __resetSessionWatcherForTests();
    await initUniversalAuth({
      apiBaseUrl: API_BASE,
      appId: 'bb_test',
      mode: 'development',
      useSSE: 'never',
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    vi.useFakeTimers();
    startSessionWatcher();

    expect(MockEventSource.instances.length).toBe(0);

    // Polling cadence is the default 60s — let one fire to confirm the
    // legacy path is alive.
    await vi.advanceTimersByTimeAsync(61_000);
    const calledMe = fetchSpy.mock.calls.some((c) => String(c[0]).includes('/auth/v1/me'));
    expect(calledMe).toBe(true);

    stopSessionWatcher();
    fetchSpy.mockRestore();
  });

  it('useSSE: "auto" + EventSource available — startSessionWatcher() delegates to SSE', () => {
    startSessionWatcher();
    expect(MockEventSource.instances.length).toBe(1);
    expect(__isSessionEventsActiveForTests()).toBe(true);
    stopSessionWatcher();
    expect(__isSessionEventsActiveForTests()).toBe(false);
  });

  it('startSessionEvents() is a no-op when EventSource is undefined', () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('EventSource', undefined);
    __resetSessionEventsForTests();
    startSessionEvents();
    expect(MockEventSource.instances.length).toBe(0);
    expect(__isSessionEventsActiveForTests()).toBe(false);
  });
});
