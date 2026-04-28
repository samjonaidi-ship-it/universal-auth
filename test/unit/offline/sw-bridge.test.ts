// @bb/universal-auth | test/unit/offline/sw-bridge.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerServiceWorker,
  requestBackgroundFlush,
  onBridgeMessage,
  __resetSwBridgeForTests,
  SYNC_TAG,
} from '../../../src/offline/sw-bridge.js';

describe('offline/sw-bridge', () => {
  beforeEach(() => {
    __resetSwBridgeForTests();
  });

  it('exports the canonical SYNC_TAG', () => {
    expect(SYNC_TAG).toBe('bb-universal-auth-flush');
  });

  it('registerServiceWorker no-ops when serviceWorker not available', async () => {
    // happy-dom + vitest don't have full serviceWorker support; this tests
    // the early-return safety branch.
    const originalSW = (navigator as { serviceWorker?: unknown }).serviceWorker;
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    await expect(registerServiceWorker()).resolves.toBeUndefined();
    if (originalSW !== undefined) {
      (navigator as { serviceWorker?: unknown }).serviceWorker = originalSW;
    }
  });

  it('requestBackgroundFlush no-ops when serviceWorker not available', async () => {
    const originalSW = (navigator as { serviceWorker?: unknown }).serviceWorker;
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    await expect(requestBackgroundFlush()).resolves.toBeUndefined();
    if (originalSW !== undefined) {
      (navigator as { serviceWorker?: unknown }).serviceWorker = originalSW;
    }
  });

  it('onBridgeMessage returns an unsubscribe function', () => {
    const listener = vi.fn();
    const unsubscribe = onBridgeMessage(listener);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('registers SW with default scope when navigator.serviceWorker exists', async () => {
    const register = vi.fn().mockResolvedValue({});
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register,
      addEventListener: vi.fn(),
      ready: Promise.resolve({}),
    };
    await registerServiceWorker();
    expect(register).toHaveBeenCalledWith('/bb-universal-auth-sw.js', { scope: '/' });
  });

  it('swallows registration errors (best-effort SW)', async () => {
    (navigator as { serviceWorker: unknown }).serviceWorker = {
      register: vi.fn().mockRejectedValue(new Error('CSP block')),
      addEventListener: vi.fn(),
      ready: Promise.resolve({}),
    };
    await expect(registerServiceWorker()).resolves.toBeUndefined();
  });
});
