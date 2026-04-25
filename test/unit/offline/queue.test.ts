// @bb/universal-auth | test/unit/offline/queue.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A2 gate #3 — FIFO order. Gate #5 — maxQueueSize eviction.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enqueue,
  readAll,
  remove,
  setMaxQueueSize,
  depth,
  moveToDeadLetter,
  __resetQueueForTests,
} from '../../../src/offline/queue.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';

describe('offline/queue', () => {
  beforeEach(async () => {
    await __resetDbForTests();
    __resetQueueForTests();
    __resetEventReporterForTests();
    __resetClientForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    setMaxQueueSize(1000);
  });

  it('preserves FIFO insertion order in readAll', async () => {
    for (let i = 0; i < 10; i++) {
      await enqueue({
        endpoint: '/api/a',
        method: 'POST',
        body: { i },
        headers: {},
        idempotencyKey: `idem-${i}`,
      });
    }
    const rows = await readAll();
    expect(rows).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      expect((rows[i]!.body as { i: number }).i).toBe(i);
    }
  });

  it('remove() deletes the row', async () => {
    const id = await enqueue({
      endpoint: '/api/x',
      method: 'POST',
      body: {},
      headers: {},
      idempotencyKey: 'once',
    });
    expect(await depth()).toBe(1);
    await remove(id);
    expect(await depth()).toBe(0);
  });

  it('drops oldest row when maxQueueSize is exceeded', async () => {
    setMaxQueueSize(3);
    for (let i = 0; i < 4; i++) {
      await enqueue({
        endpoint: '/api/a',
        method: 'POST',
        body: { i },
        headers: {},
        idempotencyKey: `key-${i}`,
      });
    }
    const rows = await readAll();
    expect(rows).toHaveLength(3);
    // Should be rows 1, 2, 3 — row 0 got dropped
    expect((rows[0]!.body as { i: number }).i).toBe(1);
    expect((rows[rows.length - 1]!.body as { i: number }).i).toBe(3);
  });

  it('moveToDeadLetter pulls from offline_queue + stores reason', async () => {
    const id = await enqueue({
      endpoint: '/api/x',
      method: 'POST',
      body: { z: 1 },
      headers: {},
      idempotencyKey: 'dead',
    });
    const row = (await readAll())[0]!;
    expect(row.id).toBe(id);

    await moveToDeadLetter(row, 'http_500');
    expect(await depth()).toBe(0);
  });
});
