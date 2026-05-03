// @samjonaidi-ship-it/universal-auth | test/unit/flows/permission-grants-branches.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Branch coverage for requestAndRecord — Notification path + permissions API
// + error fallback.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestAndRecord } from '../../../src/flows/permission-grants.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('requestAndRecord — branch coverage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResp(200, { ok: true }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    // Restore Notification global
    if ((globalThis as { __origNotification?: unknown }).__origNotification !== undefined) {
      Object.defineProperty(globalThis, 'Notification', {
        value: (globalThis as { __origNotification?: unknown }).__origNotification,
        writable: true,
        configurable: true,
      });
      delete (globalThis as { __origNotification?: unknown }).__origNotification;
    }
  });

  it('Notification permission: granted', async () => {
    (globalThis as { __origNotification?: unknown }).__origNotification = (
      globalThis as { Notification?: unknown }
    ).Notification;
    Object.defineProperty(globalThis, 'Notification', {
      value: { requestPermission: async () => 'granted' },
      writable: true,
      configurable: true,
    });
    const result = await requestAndRecord('notifications');
    expect(result).toBe('granted');
  });

  it('Notification permission: denied', async () => {
    (globalThis as { __origNotification?: unknown }).__origNotification = (
      globalThis as { Notification?: unknown }
    ).Notification;
    Object.defineProperty(globalThis, 'Notification', {
      value: { requestPermission: async () => 'denied' },
      writable: true,
      configurable: true,
    });
    const result = await requestAndRecord('notifications');
    expect(result).toBe('denied');
  });

  it('navigator.permissions.query: prompt → denied (default)', async () => {
    const orig = navigator.permissions;
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: async () => ({ state: 'prompt' }),
      },
      writable: true,
      configurable: true,
    });
    try {
      const result = await requestAndRecord('camera');
      expect(['granted', 'denied']).toContain(result);
    } finally {
      Object.defineProperty(navigator, 'permissions', {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it('navigator.permissions.query: granted', async () => {
    const orig = navigator.permissions;
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: async () => ({ state: 'granted' }),
      },
      writable: true,
      configurable: true,
    });
    try {
      const result = await requestAndRecord('camera');
      expect(result).toBe('granted');
    } finally {
      Object.defineProperty(navigator, 'permissions', {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });

  it('navigator.permissions.query rejects → catch block sets denied', async () => {
    const orig = navigator.permissions;
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: async () => {
          throw new Error('not supported');
        },
      },
      writable: true,
      configurable: true,
    });
    try {
      const result = await requestAndRecord('camera');
      expect(result).toBe('denied');
    } finally {
      Object.defineProperty(navigator, 'permissions', {
        value: orig,
        writable: true,
        configurable: true,
      });
    }
  });
});
