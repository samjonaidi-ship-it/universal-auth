// @samjonaidi-ship-it/universal-auth | test/unit/offline/sw-bridge-foreground.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2b — coverage for v1.0.1 lookback C8 (requestBackgroundFlush foreground fallback).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  requestBackgroundFlush,
  __resetSwBridgeForTests,
  SYNC_TAG,
} from '../../../src/offline/sw-bridge.js';
import * as reconciler from '../../../src/offline/reconciler.js';

type SwSlot = { serviceWorker?: unknown };

describe('offline/sw-bridge — requestBackgroundFlush foreground fallback (v1.0.1 C8)', () => {
  let originalSW: unknown;

  beforeEach(() => {
    __resetSwBridgeForTests();
    originalSW = (navigator as SwSlot).serviceWorker;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSW === undefined) {
      delete (navigator as SwSlot).serviceWorker;
    } else {
      (navigator as SwSlot).serviceWorker = originalSW;
    }
  });

  it('SW available + bg-sync supported → posts message to SW (no foreground flush)', async () => {
    const syncRegister = vi.fn().mockResolvedValue(undefined);
    (navigator as SwSlot).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      addEventListener: vi.fn(),
      ready: Promise.resolve({
        sync: { register: syncRegister },
      }),
    };

    const flushSpy = vi.spyOn(reconciler, 'flush').mockResolvedValue(undefined);

    await requestBackgroundFlush();

    expect(syncRegister).toHaveBeenCalledWith(SYNC_TAG);
    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('SW unavailable → dynamically imports reconciler and calls flush()', async () => {
    delete (navigator as SwSlot).serviceWorker;

    const flushSpy = vi.spyOn(reconciler, 'flush').mockResolvedValue(undefined);

    await requestBackgroundFlush();

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('SW ready but no SyncManager → falls through to foreground reconciler.flush()', async () => {
    (navigator as SwSlot).serviceWorker = {
      register: vi.fn().mockResolvedValue({}),
      addEventListener: vi.fn(),
      // No `sync` on the registration — simulates Safari/Firefox
      ready: Promise.resolve({}),
    };

    const flushSpy = vi.spyOn(reconciler, 'flush').mockResolvedValue(undefined);

    await requestBackgroundFlush();

    expect(flushSpy).toHaveBeenCalledTimes(1);
  });

  it('reconciler.flush() rejection is swallowed (caller-safe by design)', async () => {
    // Source comment: "Reconciler errors must not crash the caller. The next
    // sync event / online event / explicit flush() call will retry."
    // The lane spec's "Flush errors propagate" phrasing conflicts with the
    // source — current behavior is documented swallow-and-retry-later.
    delete (navigator as SwSlot).serviceWorker;

    vi.spyOn(reconciler, 'flush').mockRejectedValueOnce(new Error('reconciler boom'));

    await expect(requestBackgroundFlush()).resolves.toBeUndefined();
  });
});
