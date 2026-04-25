// @bb/universal-auth | test/unit/core/event-reporter.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A2 gate #7 — envelope auto-population + batch ingest.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureEventReporter,
  emit,
  flushNow,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('core/event-reporter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    void __resetDbForTests();
    __resetEventReporterForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 3, batchInterval: 10_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResp(200, { ok: true }))
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('stamps envelope with app_id + sdk_version + protocol_version + client_ts + device_id', async () => {
    await emit('login.success', { method: 'code' });
    await emit('login.success', {});
    await emit('login.success', {});
    // batch cap = 3 → immediate flush
    await new Promise((r) => setTimeout(r, 20));
    await flushNow();

    expect(fetchSpy).toHaveBeenCalled();
    const call = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(call).toBeDefined();
    const body = JSON.parse(String((call![1] as RequestInit).body)) as {
      events: Array<Record<string, unknown>>;
    };
    expect(body.events.length).toBeGreaterThanOrEqual(1);
    const e = body.events[0]!;
    expect(e.app_id).toBe('bb_express');
    expect(e.sdk_version).toBe('1.0.0-rc.1');
    expect(e.protocol_version).toBe('v1');
    expect(typeof e.device_id).toBe('string');
    expect(typeof e.client_ts).toBe('string');
    expect(e.event_type).toBe('login.success');
  });

  it('flushes when batchSize cap is reached', async () => {
    await emit('a.b', {});
    await emit('a.b', {});
    await emit('a.b', {});  // 3rd → cap hit
    await new Promise((r) => setTimeout(r, 20));

    const ingestCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/events/v1/ingest')
    );
    expect(ingestCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('silently drops events when not configured', async () => {
    __resetEventReporterForTests();
    // Deliberately no configureEventReporter() call
    await expect(emit('x.y', {})).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
