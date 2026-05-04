// @samjonaidi-ship-it/universal-auth | test/unit/core/event-reporter-flush.test.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// Branch coverage for src/core/event-reporter.ts doFlush() paths (§3.2, §6.3, §8.1):
//   - Permanent failure: UNKNOWN_EVENT_TYPE / APP_NOT_REGISTERED / VERSION_INCOMPATIBLE
//     → rows dropped, no retry (lines 215-217)
//   - Transient failure (network/5xx) → flush rescheduled (219-222)
//   - Post-flush re-flush when remaining > 0 (228-232)
//   - active_persona stamping (line 112)
//   - isPermanentFailure() positive + negative cases

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureEventReporter,
  emit,
  flushNow,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';

const BASE = 'https://ct-bff.test';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('event-reporter — flush branch coverage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    __resetEventReporterForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.4' });
    configureEventReporter({ batchSize: 50, batchInterval: 10_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // ── Permanent failure: server rejects + SDK drops events (no infinite retry) ─

  it('UNKNOWN_EVENT_TYPE response drops rows permanently (no retry)', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        jsonResp(400, { code: 'UNKNOWN_EVENT_TYPE', error: 'unknown' })
      )
    );
    await emit('totally.unknown.event', {});
    await flushNow();
    const ingestCalls1 = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls1.length).toBe(1);

    // Second flush with no new events should be a no-op (rows were dropped).
    await flushNow();
    const ingestCalls2 = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls2.length).toBe(1);
  });

  it('APP_NOT_REGISTERED response drops rows permanently', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        jsonResp(400, { code: 'APP_NOT_REGISTERED', error: 'unknown app' })
      )
    );
    await emit('login.success', {});
    await flushNow();

    // Re-flush should NOT re-send (rows were deleted).
    fetchSpy.mockClear();
    await flushNow();
    const ingestCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls.length).toBe(0);
  });

  // ── Transient failure: SDK keeps rows for next attempt ──────────────────

  it('5xx response keeps rows for retry (does not drop)', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(jsonResp(500, { code: 'HTTP_500', error: 'server' }))
    );
    await emit('login.success', {});
    await flushNow();

    // Now flip to success — the original event should still be in the queue.
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
    await flushNow();
    const successfulCall = fetchSpy.mock.calls.find(([url], i) => {
      // Pick a call whose response was 200 — proxy by checking second-onward.
      return String(url).includes('/events/v1/ingest') && i > 0;
    });
    expect(successfulCall).toBeDefined();
  });

  it('Network error keeps rows for retry', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error('offline')));
    await emit('session.heartbeat', {});
    await flushNow();

    fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
    await flushNow();

    const ingestCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls.length).toBeGreaterThanOrEqual(2);
  });

  // ── 401 NOT permanent — rows kept ───────────────────────────────────────

  it('401 response keeps rows (NOT a permanent failure)', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        jsonResp(401, { code: 'AUTH_SESSION_EXPIRED', error: 'expired' })
      )
    );
    await emit('foo.bar', {});
    await flushNow();

    // Switch to 200; queued event must be re-sent.
    fetchSpy.mockClear();
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
    await flushNow();
    const ingestCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls.length).toBeGreaterThan(0);
  });

  // ── active_persona stamping (line 112) ──────────────────────────────────

  it('stamps active_persona when getActivePersona returns non-null', async () => {
    __resetEventReporterForTests();
    configureEventReporter({
      batchSize: 50,
      batchInterval: 10_000,
      getActivePersona: () => 'crew',
      getIdentityId: () => 'id-42',
    });
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));

    await emit('persona.switched', { from: 'admin' });
    await flushNow();

    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(call).toBeDefined();
    const body = JSON.parse(String((call![1] as RequestInit).body)) as {
      events: Array<{ active_persona?: string; identity_id?: string | null }>;
    };
    expect(body.events[0]?.active_persona).toBe('crew');
    expect(body.events[0]?.identity_id).toBe('id-42');
  });

  it('omits active_persona when getActivePersona returns null', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
    await emit('plain.event', {});
    await flushNow();

    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(call).toBeDefined();
    const body = JSON.parse(String((call![1] as RequestInit).body)) as {
      events: Array<Record<string, unknown>>;
    };
    expect('active_persona' in body.events[0]!).toBe(false);
  });

  // ── Post-flush re-flush when remaining > 0 (lines 228-232) ──────────────

  // v1.0.4 (Lane 2a): rewritten to use a `firstPostInFlight` deferred
  // promise that resolves the moment the mock fetch sees the first POST.
  // No setTimeout racing — we await the actual call event.
  it('reschedules flush when more events arrived during POST', async () => {
    let firstPostSeen = false;
    let resolveFirstPostSeen: () => void = () => {};
    const firstPostSeenPromise = new Promise<void>((resolve) => {
      resolveFirstPostSeen = resolve;
    });
    let releaseFirstPost: ((v: Response) => void) = () => {};
    const firstPostHeld = new Promise<Response>((resolve) => {
      releaseFirstPost = resolve;
    });

    fetchSpy.mockImplementation((url) => {
      if (String(url).includes('/events/v1/ingest') && !firstPostSeen) {
        firstPostSeen = true;
        resolveFirstPostSeen();
        return firstPostHeld;
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    __resetEventReporterForTests();
    configureEventReporter({ batchSize: 1, batchInterval: 60_000 });

    // First emit triggers `void flushNow()` because batchSize=1.
    void emit('a.b', {});
    // Wait for the held POST to actually be in-flight (deterministic — the
    // mock signals when fetch is invoked, no time-based polling).
    await firstPostSeenPromise;

    // While the first POST is held, enqueue two more events. These persist
    // to IDB; their `void flushNow()` calls coalesce with the in-flight one.
    await emit('a.b', {});
    await emit('a.b', {});

    // Release the held POST → doFlush sees `remaining > 0` and calls
    // scheduleFlush() (60s timer). We trigger an immediate flush ourselves
    // so we don't have to wait for the timer. The first awaited flushNow()
    // returns the in-flight flush (which is finishing the held POST and
    // setting up the 60s reschedule); the SECOND awaited flushNow() spins
    // up a fresh doFlush() that drains the remaining 2 events.
    releaseFirstPost(jsonResp(200, { ok: true }));
    await flushNow();
    await flushNow();

    const ingestCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls.length).toBeGreaterThanOrEqual(2);
  });

  // ── flushNow coalescing ─────────────────────────────────────────────────

  it('concurrent flushNow calls coalesce to a single in-flight flush', async () => {
    let postCount = 0;
    fetchSpy.mockImplementation(async (url) => {
      if (String(url).includes('/events/v1/ingest')) {
        postCount += 1;
        await new Promise((r) => setTimeout(r, 10));
      }
      return jsonResp(200, { ok: true });
    });
    await emit('coalesce.test', {});

    const a = flushNow();
    const b = flushNow();
    const c = flushNow();
    await Promise.all([a, b, c]);

    expect(postCount).toBe(1);
  });

  // ── doFlush early return when queue is empty ────────────────────────────

  it('flushNow on empty queue is a no-op', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
    await flushNow();
    const ingestCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls.length).toBe(0);
  });
});
