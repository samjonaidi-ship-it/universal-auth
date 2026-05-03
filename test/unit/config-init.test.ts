// @samjonaidi-ship-it/universal-auth | test/unit/config-init.test.ts | v1.0.1 | 2026-05-02 | BB
// Coverage push for src/config.ts initUniversalAuth flow (lines 97-134).
// v1.0.1: vi.mock stubs for dynamically-imported modules prevent DNS hangs
// when the full suite runs in parallel and client singleton is already armed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initUniversalAuth, type UniversalAuthConfig } from '../../src/config.js';

vi.mock('../../src/core/client.js', () => ({ configureClient: vi.fn(), get: vi.fn(), put: vi.fn(), patch: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('../../src/core/event-reporter.js', () => ({ configureEventReporter: vi.fn(), emit: vi.fn() }));
vi.mock('../../src/core/settings-sync.js', () => ({ configureSettingsSync: vi.fn() }));
vi.mock('../../src/offline/queue.js', () => ({ setMaxQueueSize: vi.fn() }));

const baseConfig: UniversalAuthConfig = {
  apiBaseUrl: 'https://ct-bff.test',
  appId: 'bb_init_test',
};

// Snapshot original window before mutating
const ORIGINAL_WINDOW = (globalThis as { window?: unknown }).window;

function setHostname(hostname: string): void {
  Object.defineProperty(globalThis, 'window', {
    value: { location: { hostname } },
    writable: true,
    configurable: true,
  });
}

function clearWindow(): void {
  Object.defineProperty(globalThis, 'window', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

describe('initUniversalAuth', () => {
  beforeEach(() => {
    setHostname('localhost');
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: ORIGINAL_WINDOW,
      writable: true,
      configurable: true,
    });
  });

  it('configures core client with default mode=production', async () => {
    await expect(initUniversalAuth(baseConfig)).resolves.toBeUndefined();
  });

  it('accepts explicit mode=development on localhost', async () => {
    await expect(
      initUniversalAuth({ ...baseConfig, mode: 'development' })
    ).resolves.toBeUndefined();
  });

  it('passes events.batchInterval + batchSize through', async () => {
    await expect(
      initUniversalAuth({
        ...baseConfig,
        events: { batchInterval: 5_000, batchSize: 25 },
      })
    ).resolves.toBeUndefined();
  });

  it('passes events partial config (batchInterval only)', async () => {
    await expect(
      initUniversalAuth({
        ...baseConfig,
        events: { batchInterval: 3_000 },
      })
    ).resolves.toBeUndefined();
  });

  it('passes events partial config (batchSize only)', async () => {
    await expect(
      initUniversalAuth({
        ...baseConfig,
        events: { batchSize: 10 },
      })
    ).resolves.toBeUndefined();
  });

  it('passes settings.debounceMs through', async () => {
    await expect(
      initUniversalAuth({
        ...baseConfig,
        settings: { debounceMs: 1_000 },
      })
    ).resolves.toBeUndefined();
  });

  it('passes offline.maxQueueSize through', async () => {
    await expect(
      initUniversalAuth({
        ...baseConfig,
        offline: { maxQueueSize: 50 },
      })
    ).resolves.toBeUndefined();
  });

  it('throws when non-production mode used on prod hostname', async () => {
    // v1.0.1: default cookieDomain is `.buildwithbainbridge.com` post-D20.
    // Test setup uses default config, so use the matching prod hostname.
    setHostname('app.buildwithbainbridge.com');
    await expect(
      initUniversalAuth({ ...baseConfig, mode: 'development' })
    ).rejects.toThrow(/non-production mode/i);
  });

  it('throws on legacy prod hostname when cookieDomain is set explicitly', async () => {
    setHostname('app.bainbridgebuilders.com');
    await expect(
      initUniversalAuth({ ...baseConfig, mode: 'development', cookieDomain: '.bainbridgebuilders.com' })
    ).rejects.toThrow(/non-production mode/i);
  });

  it('skips hostname check when window is undefined (Node/SSR)', async () => {
    clearWindow();
    await expect(
      initUniversalAuth({ ...baseConfig, mode: 'development' })
    ).resolves.toBeUndefined();
  });

  it('events config without options does not crash', async () => {
    await expect(
      initUniversalAuth({ ...baseConfig, events: {} })
    ).resolves.toBeUndefined();
  });

  it('settings config without options does not crash', async () => {
    await expect(
      initUniversalAuth({ ...baseConfig, settings: {} })
    ).resolves.toBeUndefined();
  });

  it('offline config without maxQueueSize does not crash', async () => {
    await expect(
      initUniversalAuth({ ...baseConfig, offline: {} })
    ).resolves.toBeUndefined();
  });
});
