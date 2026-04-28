// @bb/universal-auth | test/unit/core/sdk-metrics.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for src/core/sdk-metrics.ts (was 0%).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordTokenRefresh,
  recordEventBatch,
  recordError,
  getSDKMetrics,
  __resetSdkMetricsForTests,
} from '../../../src/core/sdk-metrics.js';

describe('sdk-metrics', () => {
  beforeEach(() => {
    __resetSdkMetricsForTests();
  });

  describe('recording API', () => {
    it('recordTokenRefresh accumulates count + total ms', async () => {
      recordTokenRefresh(100);
      recordTokenRefresh(200);
      recordTokenRefresh(300);

      const m = await getSDKMetrics();
      expect(m.tokenRefresh.count).toBe(3);
      expect(m.tokenRefresh.avgMs).toBe(200);
    });

    it('recordEventBatch accumulates batch metrics', async () => {
      recordEventBatch(50);
      recordEventBatch(150);

      const m = await getSDKMetrics();
      expect(m.events.batchCount).toBe(2);
      expect(m.events.avgBatchMs).toBe(100);
    });

    it('recordError stores last error + increments count', async () => {
      recordError('AUTH_CODE_INVALID', 'bad code');
      recordError('SESSION_EXPIRED', 'token gone');

      const m = await getSDKMetrics();
      expect(m.errors.count).toBe(2);
      expect(m.errors.last?.code).toBe('SESSION_EXPIRED');
      expect(m.errors.last?.message).toBe('token gone');
      expect(m.errors.last?.at).toBeGreaterThan(0);
    });
  });

  describe('getSDKMetrics snapshot', () => {
    it('returns zeroed metrics on fresh state', async () => {
      const m = await getSDKMetrics();
      expect(m.tokenRefresh.count).toBe(0);
      expect(m.tokenRefresh.avgMs).toBe(0);
      expect(m.tokenRefresh.p95Ms).toBe(0);
      expect(m.events.batchCount).toBe(0);
      expect(m.events.avgBatchMs).toBe(0);
      expect(m.errors.count).toBe(0);
      expect(m.errors.last).toBeNull();
      expect(m.offlineQueueDepth).toBe(0);
      expect(m.eventQueueDepth).toBe(0);
    });

    it('includes SDK version', async () => {
      const m = await getSDKMetrics();
      expect(m.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('p95 reports 95th percentile of refresh samples', async () => {
      // 100 samples 1..100; p95 = 95
      for (let i = 1; i <= 100; i++) recordTokenRefresh(i);
      const m = await getSDKMetrics();
      expect(m.tokenRefresh.p95Ms).toBe(95);
    });

    it('p95 ring buffer caps at 100 samples — old values evicted', async () => {
      // 150 samples; only the last 100 (51..150) should remain
      for (let i = 1; i <= 150; i++) recordTokenRefresh(i);
      const m = await getSDKMetrics();
      // p95 of 51..150 = 145
      expect(m.tokenRefresh.p95Ms).toBe(145);
      // Count still reflects every recordTokenRefresh call
      expect(m.tokenRefresh.count).toBe(150);
    });

    it('avg rounds to integer', async () => {
      recordTokenRefresh(10);
      recordTokenRefresh(11); // avg = 10.5
      const m = await getSDKMetrics();
      expect(m.tokenRefresh.avgMs).toBe(11);
    });
  });

  describe('reset for tests', () => {
    it('zeroes every counter', async () => {
      recordTokenRefresh(123);
      recordEventBatch(45);
      recordError('X', 'y');

      __resetSdkMetricsForTests();

      const m = await getSDKMetrics();
      expect(m.tokenRefresh.count).toBe(0);
      expect(m.events.batchCount).toBe(0);
      expect(m.errors.count).toBe(0);
      expect(m.errors.last).toBeNull();
    });
  });
});
