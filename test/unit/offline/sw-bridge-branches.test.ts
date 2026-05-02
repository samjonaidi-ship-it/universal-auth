// @bainbridgebuilders/universal-auth | test/unit/offline/sw-bridge-branches.test.ts | v1.0.1 | 2026-05-01 | BB
// Branch coverage for src/offline/sw-bridge.ts (was 60.86% lines).
// Targets §9.4 SW sync registration + main-thread bridge.
//
// Existing sw-bridge.test.ts covers the safe early-returns and SW
// registration call. This file targets:
//   - requestBackgroundFlush happy path: sync.register called with SYNC_TAG
//   - requestBackgroundFlush fallthrough: sync.register rejects → no throw
//   - requestBackgroundFlush no-sync branch: registration without sync property
//   - notify() dispatches incoming messages to all listeners
//   - notify() isolates a throwing listener (other listeners still notified)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerServiceWorker,
  requestBackgroundFlush,
  onBridgeMessage,
  __resetSwBridgeForTests,
  SYNC_TAG,
} from '../../../src/offline/sw-bridge.js';

describe('offline/sw-bridge — branch coverage', () => {
  let originalSW: unknown;

  beforeEach(() => {
    __resetSwBridgeForTests();
    originalSW = (navigator as { serviceWorker?: unknown }).serviceWorker;
  });

  afterEach(() => {
    if (originalSW !== undefined) {
      (navigator as { serviceWorker: unknown }).serviceWorker = originalSW;
    } else {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    }
    __resetSwBridgeForTests();
  });

  it('requestBackgroundFlush calls sync.register with SYNC_TAG when sync API exists', async () => {
    const syncRegister = vi.fn().mockResolvedValue(undefined);
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      addEventListener: vi.fn(),
      ready: Promise.resolve({ sync: { register: syncRegister } }),
    };
    await requestBackgroundFlush();
    expect(syncRegister).toHaveBeenCalledWith(SYNC_TAG);
  });

  it('requestBackgroundFlush swallows sync.register rejection (falls through)', async () => {
    const syncRegister = vi.fn().mockRejectedValue(new Error('sync denied'));
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      addEventListener: vi.fn(),
      ready: Promise.resolve({ sync: { register: syncRegister } }),
    };
    // When sync.register rejects, runForegroundFlush() is invoked which
    // calls the reconciler via dynamic import. The reconciler calls fetch()
    // when there are queued items — mock it to prevent real DNS lookups that
    // would exceed the 5000ms test timeout.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    try {
      await expect(requestBackgroundFlush()).resolves.toBeUndefined();
      expect(syncRegister).toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('requestBackgroundFlush no-ops when SW registration has no sync property', async () => {
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      addEventListener: vi.fn(),
      ready: Promise.resolve({}), // no `sync` property — fallthrough branch
    };
    await expect(requestBackgroundFlush()).resolves.toBeUndefined();
  });

  it('onBridgeMessage receives messages dispatched by SW (via notify)', async () => {
    let messageHandler: ((ev: MessageEvent) => void) | null = null;
    // Phase C5 hardening — bridge now validates origin + source. Stub
    // controller so the synthetic event passes the guard.
    const controllerStub = { id: 'controller' };
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      controller: controllerStub,
      addEventListener: vi.fn(
        (type: string, listener: (ev: MessageEvent) => void) => {
          if (type === 'message') messageHandler = listener;
        }
      ),
      ready: Promise.resolve({}),
    };

    await registerServiceWorker();
    expect(messageHandler).not.toBeNull();

    const received: unknown[] = [];
    onBridgeMessage((m) => received.push(m));
    onBridgeMessage((m) => received.push(m));

    // Simulate SW sending a message — must include origin + source for the
    // C5 trust check.
    const payload = { type: 'flush_complete' as const, payload: { ok: 1 } };
    (messageHandler as unknown as (ev: { data: unknown; origin: string; source: unknown }) => void)({
      data: payload,
      origin: self.location.origin,
      source: controllerStub,
    });

    expect(received).toEqual([payload, payload]);
  });

  it('a throwing listener does not block other listeners (notify isolation)', async () => {
    let messageHandler: ((ev: MessageEvent) => void) | null = null;
    const controllerStub = { id: 'controller' };
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      controller: controllerStub,
      addEventListener: vi.fn(
        (type: string, listener: (ev: MessageEvent) => void) => {
          if (type === 'message') messageHandler = listener;
        }
      ),
      ready: Promise.resolve({}),
    };
    await registerServiceWorker();

    let goodListenerFired = false;
    onBridgeMessage(() => {
      throw new Error('listener bug');
    });
    onBridgeMessage(() => {
      goodListenerFired = true;
    });

    expect(() =>
      (messageHandler as unknown as (ev: { data: unknown; origin: string; source: unknown }) => void)({
        data: { type: 'flush_failed', payload: {} },
        origin: self.location.origin,
        source: controllerStub,
      })
    ).not.toThrow();
    expect(goodListenerFired).toBe(true);
  });

  it('registerServiceWorker is idempotent (second call no-ops)', async () => {
    const register = vi.fn().mockResolvedValue({});
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register,
      addEventListener: vi.fn(),
      ready: Promise.resolve({}),
    };
    await registerServiceWorker();
    await registerServiceWorker();
    // Second call must not register again (already-registered guard)
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe from onBridgeMessage stops further deliveries', async () => {
    let messageHandler: ((ev: MessageEvent) => void) | null = null;
    const controllerStub = { id: 'controller' };
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      controller: controllerStub,
      addEventListener: vi.fn(
        (type: string, listener: (ev: MessageEvent) => void) => {
          if (type === 'message') messageHandler = listener;
        }
      ),
      ready: Promise.resolve({}),
    };
    await registerServiceWorker();

    let count = 0;
    const unsubscribe = onBridgeMessage(() => {
      count += 1;
    });
    (messageHandler as unknown as (ev: { data: unknown; origin: string; source: unknown }) => void)({
      data: { type: 'flush_complete' },
      origin: self.location.origin,
      source: controllerStub,
    });
    expect(count).toBe(1);
    unsubscribe();
    (messageHandler as unknown as (ev: { data: unknown; origin: string; source: unknown }) => void)({
      data: { type: 'flush_complete' },
      origin: self.location.origin,
      source: controllerStub,
    });
    expect(count).toBe(1);
  });
});
