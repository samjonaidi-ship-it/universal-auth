// @bb/universal-auth | src/core/sdk-metrics.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Runtime SDK observability — `getSDKMetrics()` per §12.2.
// Intended for consumer-app dev panels + optional Sentry shim per §12.3.
//
// NOT a prod-user surface. Metrics are process-local and reset per page load.

import { getSharedDb } from './storage.js';
import { SDK_VERSION } from '../config.js';

// ── Counters ──────────────────────────────────────────────────────────────

interface Counters {
  tokenRefreshCount: number;
  tokenRefreshTotalMs: number;
  tokenRefreshP95Samples: number[];  // ring buffer of last 100
  eventBatchCount: number;
  eventBatchTotalMs: number;
  errorCount: number;
  lastError: { code: string; message: string; at: number } | null;
}

const c: Counters = {
  tokenRefreshCount: 0,
  tokenRefreshTotalMs: 0,
  tokenRefreshP95Samples: [],
  eventBatchCount: 0,
  eventBatchTotalMs: 0,
  errorCount: 0,
  lastError: null,
};

const MAX_SAMPLES = 100;

// ── Recording API (internal) ──────────────────────────────────────────────

export function recordTokenRefresh(durationMs: number): void {
  c.tokenRefreshCount += 1;
  c.tokenRefreshTotalMs += durationMs;
  c.tokenRefreshP95Samples.push(durationMs);
  if (c.tokenRefreshP95Samples.length > MAX_SAMPLES) {
    c.tokenRefreshP95Samples.shift();
  }
}

export function recordEventBatch(durationMs: number): void {
  c.eventBatchCount += 1;
  c.eventBatchTotalMs += durationMs;
}

export function recordError(code: string, message: string): void {
  c.errorCount += 1;
  c.lastError = { code, message, at: Date.now() };
}

// ── Public snapshot ───────────────────────────────────────────────────────

export interface SDKMetrics {
  version: string;
  tokenRefresh: {
    count: number;
    avgMs: number;
    p95Ms: number;
  };
  events: {
    batchCount: number;
    avgBatchMs: number;
  };
  errors: {
    count: number;
    last: { code: string; message: string; at: number } | null;
  };
  offlineQueueDepth: number;
  eventQueueDepth: number;
}

/**
 * Snapshot of runtime metrics. IDB-backed counts (queue depths) require an
 * async read — callers that don't await still get the synchronous fields.
 */
export async function getSDKMetrics(): Promise<SDKMetrics> {
  const offlineQueueDepth = await getStoreDepth('offline_queue');
  const eventQueueDepth = await getStoreDepth('event_queue');

  const tokenAvg =
    c.tokenRefreshCount === 0 ? 0 : c.tokenRefreshTotalMs / c.tokenRefreshCount;
  const tokenP95 = percentile(c.tokenRefreshP95Samples, 95);
  const eventAvg =
    c.eventBatchCount === 0 ? 0 : c.eventBatchTotalMs / c.eventBatchCount;

  return {
    version: SDK_VERSION,
    tokenRefresh: {
      count: c.tokenRefreshCount,
      avgMs: Math.round(tokenAvg),
      p95Ms: Math.round(tokenP95),
    },
    events: {
      batchCount: c.eventBatchCount,
      avgBatchMs: Math.round(eventAvg),
    },
    errors: {
      count: c.errorCount,
      last: c.lastError,
    },
    offlineQueueDepth,
    eventQueueDepth,
  };
}

async function getStoreDepth(storeName: string): Promise<number> {
  try {
    const db = await getSharedDb();
    if (!db.objectStoreNames.contains(storeName)) return 0;
    return await db.count(storeName);
  } catch {
    return 0;
  }
}

function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? 0;
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetSdkMetricsForTests(): void {
  c.tokenRefreshCount = 0;
  c.tokenRefreshTotalMs = 0;
  c.tokenRefreshP95Samples = [];
  c.eventBatchCount = 0;
  c.eventBatchTotalMs = 0;
  c.errorCount = 0;
  c.lastError = null;
}
