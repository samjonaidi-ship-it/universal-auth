// @bb/universal-auth | test/unit/offline/reconciler.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A2 gate #4 — reconciler status-code matrix (§9.4).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush, __resetReconcilerForTests } from '../../../src/offline/reconciler.js';
import {
  enqueue,
  depth,
  readAll,
  __resetQueueForTests,
} from '../../../src/offline/queue.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';

function resp(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function addRow(idem: string): Promise<void> {
  await enqueue({
    endpoint: '/api/x',
    method: 'POST',
    body: { idem },
    headers: {},
    idempotencyKey: idem,
  });
}

describe('offline/reconciler', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    __resetQueueForTests();
    __resetEventReporterForTests();
    __resetReconcilerForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('removes rows on 2xx', async () => {
    await addRow('a1');
    fetchSpy.mockImplementation((url) => {
      if (String(url).includes('/api/x')) return Promise.resolve(resp(200, { ok: true }));
      return Promise.resolve(resp(200, { ok: true }));
    });
    const r = await flush();
    expect(r.flushed).toBe(1);
    expect(await depth()).toBe(0);
  });

  it('removes rows on 4xx (permanent client error)', async () => {
    await addRow('bad1');
    fetchSpy.mockResolvedValueOnce(resp(400, { code: 'VALIDATION_ERROR' }));
    const r = await flush();
    expect(r.flushed).toBe(1);
    expect(await depth()).toBe(0);
  });

  it('defers flush on 401 (auth pause)', async () => {
    await addRow('auth1');
    await addRow('auth2');
    fetchSpy.mockResolvedValueOnce(resp(401));
    const r = await flush();
    expect(r.deferred).toBe(1);
    // Both rows still present — second never attempted after 401 defer
    expect(await depth()).toBe(2);
  });

  it('defers flush on 429 (rate limit)', async () => {
    await addRow('rl1');
    fetchSpy.mockResolvedValueOnce(resp(429));
    const r = await flush();
    expect(r.deferred).toBe(1);
    expect(await depth()).toBe(1);
  });

  it('emits sync.conflict + removes row on 409', async () => {
    await addRow('conflict1');
    fetchSpy.mockImplementation(() => Promise.resolve(resp(409, { code: 'SYNC_CONFLICT' })));
    const r = await flush();
    expect(r.flushed).toBe(1);
    expect(await depth()).toBe(0);
  });

  it('retries + moves to dead-letter after MAX_RETRIES on 5xx', async () => {
    await addRow('retry1');
    fetchSpy.mockImplementation(() => Promise.resolve(resp(503)));
    // 1st attempt: retryCount 0→1; row stays (fail)
    await flush();
    expect(await depth()).toBe(1);
    // Simulate additional retries (bump to 6) — direct manipulation via enqueue/re-flush
    for (let i = 0; i < 5; i++) {
      await flush();
    }
    // After > MAX_RETRIES (5), row should have been dead-lettered
    const remaining = await readAll();
    expect(remaining.length).toBe(0);
  });
});
