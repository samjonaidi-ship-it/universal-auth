// @samjonaidi-ship-it/universal-auth | test/chaos/idb-quota-exceeded.test.ts | v1.0.1 | 2026-05-01 | BB
// Spec §11.6 — IDB quota exhaustion (added in Phase E8 v1.0.1 hardening).
//
// Scenario: user storage is full (browser refuses IDB writes with
// QuotaExceededError). The SDK's event-reporter persists every emit() to
// IDB before flushing — when the disk is full, the write rejects.
//
// Contract being tested:
//   * emit() does NOT crash the calling code
//   * emit() silently drops the offending event
//   * emit() emits `sync.failed` with `reason: 'quota_exceeded'` so the host
//     app can react (purge old data, prompt user, switch to memory-only mode)
//   * the recursive emit of sync.failed itself does NOT loop infinitely if
//     it ALSO hits the quota error (re-entry guard in event-reporter.ts)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { emit, configureEventReporter, __resetEventReporterForTests, isQuotaExceededError } from '../../src/core/event-reporter.js';
import { configureClient, __resetClientForTests } from '../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../src/core/token-manager.js';
import { __resetDbForTests, getSharedDb, STORE_EVENT_QUEUE } from '../../src/core/storage.js';

const BASE = 'https://ct-bff.test.example.com';

describe('Chaos #8 — IDB QuotaExceededError on event write (§11.6 + Phase E8)', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1-test' });
    configureEventReporter({ batchSize: 50, batchInterval: 60_000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isQuotaExceededError detects DOMException-style and legacy code-22 errors', () => {
    const modern = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
    expect(isQuotaExceededError(modern)).toBe(true);

    const legacy = Object.assign(new Error('Quota exceeded (legacy)'), { code: 22 });
    expect(isQuotaExceededError(legacy)).toBe(true);

    expect(isQuotaExceededError(new Error('something else'))).toBe(false);
    expect(isQuotaExceededError('not an error')).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });

  it('emit() does not throw when IDB add() rejects with QuotaExceededError', async () => {
    // Spy on the shared db's add() to throw the first time it's called.
    const db = await getSharedDb();
    const originalAdd = db.add.bind(db);
    let firstCall = true;
    vi.spyOn(db, 'add').mockImplementation(async (...args: Parameters<typeof originalAdd>) => {
      if (firstCall && args[0] === STORE_EVENT_QUEUE) {
        firstCall = false;
        const err = new Error('QuotaExceededError: storage quota exceeded');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return originalAdd(...args);
    });

    // Must not throw (callers use `void emit(...)` and rely on never throwing).
    await expect(emit('login.success', { method: 'code' })).resolves.toBeUndefined();
  });

  it('emit() emits sync.failed{reason:quota_exceeded} when IDB write quota is hit', async () => {
    const db = await getSharedDb();
    const originalAdd = db.add.bind(db);

    // Track every store-name we receive an add() for. The first call (the
    // user's emit) should reject; the second call (the recursive
    // sync.failed emit) should succeed so we can read it back from IDB.
    const adds: { storeName: string; record: unknown; rejected: boolean }[] = [];
    let rejectedOnce = false;
    vi.spyOn(db, 'add').mockImplementation(async (...args: Parameters<typeof originalAdd>) => {
      const storeName = args[0] as string;
      const record = args[1];
      if (!rejectedOnce && storeName === STORE_EVENT_QUEUE) {
        rejectedOnce = true;
        adds.push({ storeName, record, rejected: true });
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      adds.push({ storeName, record, rejected: false });
      return originalAdd(...args);
    });

    await emit('enrollment.code_sent', { channel: 'sms', masked_destination: '+1***' });

    // Wait one microtask flush so the recursive sync.failed emit can land.
    await new Promise((r) => setTimeout(r, 10));

    // Two adds total: the failing original and the successful sync.failed
    expect(adds.length).toBeGreaterThanOrEqual(2);
    expect(adds[0]?.rejected).toBe(true);

    const recoveryRow = adds.find((a) => !a.rejected);
    expect(recoveryRow).toBeDefined();
    const envelope = (recoveryRow!.record as { envelope: { event_type: string; payload: Record<string, unknown> } }).envelope;
    expect(envelope.event_type).toBe('sync.failed');
    expect(envelope.payload.reason).toBe('quota_exceeded');
    expect(envelope.payload.dropped_event_type).toBe('enrollment.code_sent');
  });

  it('re-entry guard: a sync.failed emission that ALSO hits quota does not loop', async () => {
    const db = await getSharedDb();
    const originalAdd = db.add.bind(db);

    // Reject EVERY add — even the recursive sync.failed write. Must
    // terminate without stack overflow / infinite recursion.
    let rejectionCount = 0;
    vi.spyOn(db, 'add').mockImplementation(async (...args: Parameters<typeof originalAdd>) => {
      const storeName = args[0] as string;
      if (storeName === STORE_EVENT_QUEUE) {
        rejectionCount++;
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return originalAdd(...args);
    });

    await emit('login.success', { method: 'code' });
    await new Promise((r) => setTimeout(r, 10));

    // We expect at most 2 attempts total: the original emit and ONE
    // recursive sync.failed retry. The re-entry guard prevents a 3rd.
    expect(rejectionCount).toBeLessThanOrEqual(2);
  });
});
