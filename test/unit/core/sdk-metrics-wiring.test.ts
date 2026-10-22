// @samjonaidi-ship-it/universal-auth | test/unit/core/sdk-metrics-wiring.test.ts | v1.0.0 | 2026-10-22 | BB
// N21 finding 1: sdk-metrics record*() functions were dead code — zero callers
// outside the module. Now wired at the real call sites; these tests prove the
// wiring (the module's own counters are covered by sdk-metrics.test.ts):
//   - recordTokenRefresh  <- performRefresh() in token-manager.ts
//   - recordEventBatch    <- doFlush() in event-reporter.ts
//   - recordError         <- reportSoftError() + refresh/flush failure paths

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setSession,
  getAccessToken,
  registerRefreshCallback,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import {
  configureEventReporter,
  emit,
  flushNow,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  getSDKMetrics,
  __resetSdkMetricsForTests,
} from '../../../src/core/sdk-metrics.js';
import { reportSoftError } from '../../../src/core/error-hook.js';
import { AuthSdkError } from '../../../src/errors.js';

const BASE = 'https://ct-bff.test.example.com';

describe('sdk-metrics wiring', () => {
  beforeEach(async () => {
    __resetSdkMetricsForTests();
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  describe('token refresh', () => {
    it('records a successful refresh (count + duration)', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-1',
        expiresAt: Date.now() - 1000, // expired → getAccessToken refreshes
        sessionId: 'sess-1',
      });
      registerRefreshCallback(async () => ({
        access_token: 'at-new',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        session_id: 'sess-1',
      }));

      expect(await getAccessToken()).toBe('at-new');
      const m = await getSDKMetrics();
      expect(m.tokenRefresh.count).toBe(1);
      expect(m.tokenRefresh.avgMs).toBeGreaterThanOrEqual(0);
    });

    it('records a failed refresh as both a refresh and an error', async () => {
      await setSession({
        accessToken: 'stale',
        refreshToken: 'rt-2',
        expiresAt: Date.now() - 1000,
        sessionId: 'sess-2',
      });
      registerRefreshCallback(async () => {
        throw new AuthSdkError('AUTH_SESSION_EXPIRED', 'refresh token dead');
      });

      await expect(getAccessToken()).rejects.toThrow();
      const m = await getSDKMetrics();
      expect(m.tokenRefresh.count).toBe(1);
      // ≥1: test envs without navigator.locks also record NO_NAVIGATOR_LOCKS
      // via reportSoftError — the refresh failure itself must be the last.
      expect(m.errors.count).toBeGreaterThanOrEqual(1);
      expect(m.errors.last?.code).toBe('AUTH_SESSION_EXPIRED');
    });
  });

  describe('soft-error hook', () => {
    it('reportSoftError records the error code', async () => {
      reportSoftError(new AuthSdkError('DPOP_FALLBACK', 'proof failed'));
      const m = await getSDKMetrics();
      expect(m.errors.count).toBe(1);
      expect(m.errors.last?.code).toBe('DPOP_FALLBACK');
    });
  });

  describe('event batch flush', () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      configureClient({ apiBaseUrl: BASE, appId: 'bb_test', sdkVersion: '0.0.0-test' });
      configureEventReporter({ batchSize: 50, batchInterval: 60_000 });
    });

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    it('records a successful batch POST', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      await emit('login.success', {});
      await flushNow();
      const m = await getSDKMetrics();
      expect(m.events.batchCount).toBe(1);
    });

    it('records a failed batch POST as an error', async () => {
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          new Response('server down', {
            status: 500,
            headers: { 'content-type': 'text/plain' },
          }),
        ),
      );
      await emit('login.success', {});
      await flushNow();
      const m = await getSDKMetrics();
      expect(m.events.batchCount).toBe(1);
      expect(m.errors.count).toBeGreaterThanOrEqual(1);
      expect(m.errors.last?.code).toBe('HTTP_500');
    });
  });
});
