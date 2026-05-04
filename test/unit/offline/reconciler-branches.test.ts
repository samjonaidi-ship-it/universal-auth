// @samjonaidi-ship-it/universal-auth | test/unit/offline/reconciler-branches.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2 (v1.0.4): branch-coverage push for src/offline/reconciler.ts.
// Existing reconciler.test.ts hits the §9.4 status matrix happy paths but
// leaves several branches uncovered:
//   - parseRetryAfter: every branch (delta-seconds, HTTP-date, invalid, empty)
//   - flushOne: network-error catch (transient retry path)
//   - flushOne: 429 with a parseable Retry-After header → setRetryAfter call
//   - flushOne: opaqueredirect → transient retry
//   - handleTransientFailure: row.id === undefined branch (defensive guard)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  flush,
  __parseRetryAfterForTests,
  __resetReconcilerForTests,
} from '../../../src/offline/reconciler.js';
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

function resp(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
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

describe('offline/reconciler — branch coverage (v1.0.4)', () => {
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

  describe('parseRetryAfter', () => {
    it('returns null for null input', () => {
      expect(__parseRetryAfterForTests(null)).toBeNull();
    });

    it('returns null for empty / whitespace-only input', () => {
      expect(__parseRetryAfterForTests('')).toBeNull();
      expect(__parseRetryAfterForTests('   ')).toBeNull();
    });

    it('parses delta-seconds (digits only) into a future epoch-ms', () => {
      const before = Date.now();
      const ts = __parseRetryAfterForTests('120');
      const after = Date.now();
      expect(ts).not.toBeNull();
      expect(ts!).toBeGreaterThanOrEqual(before + 120_000);
      expect(ts!).toBeLessThanOrEqual(after + 120_000);
    });

    it('parses an HTTP-date into its epoch-ms value', () => {
      // RFC 7231 §7.1.1.1 IMF-fixdate
      const ts = __parseRetryAfterForTests('Wed, 21 Oct 2026 07:28:00 GMT');
      expect(ts).toBe(Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'));
    });

    it('returns null for an unparseable HTTP-date', () => {
      expect(__parseRetryAfterForTests('not a real date')).toBeNull();
    });
  });

  describe('flushOne network/redirect handling', () => {
    it('treats a fetch rejection as transient + leaves row in queue', async () => {
      await addRow('netfail1');
      fetchSpy.mockRejectedValueOnce(new Error('connection reset'));
      const r = await flush();
      expect(r.failed).toBe(1);
      // row stays for retry
      expect(await depth()).toBe(1);
    });

    it('treats opaqueredirect responses as transient', async () => {
      await addRow('opaque1');
      // happy-dom doesn't expose `Response.error()` / `Response.redirect()` cleanly;
      // construct a real Response and override its `type` getter.
      const fake = new Response('', { status: 0 });
      Object.defineProperty(fake, 'type', { value: 'opaqueredirect' });
      fetchSpy.mockResolvedValueOnce(fake);
      const r = await flush();
      expect(r.failed).toBe(1);
      // row stays for retry
      expect(await depth()).toBe(1);
    });
  });

  describe('flushOne 429 + Retry-After', () => {
    it('persists retryAfterTs on the row when Retry-After is parseable', async () => {
      await addRow('rl-da');
      fetchSpy.mockResolvedValueOnce(resp(429, {}, { 'Retry-After': '60' }));

      const before = Date.now();
      const r = await flush();
      expect(r.deferred).toBe(1);

      const rows = await readAll();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.retryAfterTs).toBeDefined();
      expect(rows[0]!.retryAfterTs!).toBeGreaterThanOrEqual(before + 60_000);
    });

    it('skips already-cooldown rows on next flush (deferred branch)', async () => {
      await addRow('rl-cooldown');
      // First flush: 429 with cooldown
      fetchSpy.mockResolvedValueOnce(resp(429, {}, { 'Retry-After': '60' }));
      await flush();

      // Second flush — fetch should NOT be called for the cooled-down row
      fetchSpy.mockClear();
      const r = await flush();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(r.deferred).toBe(1);
    });
  });
});
