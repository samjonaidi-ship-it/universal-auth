// @samjonaidi-ship-it/universal-auth | test/unit/flows/impersonation-drift.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2b — coverage for v1.0.1 lookback C9 (impersonation.local_clear_drift event).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  endImpersonation,
  __resetImpersonationForTests,
} from '../../../src/flows/impersonation.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  setSession,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  flushNow,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface CapturedEvent {
  event_type: string;
  payload: Record<string, unknown>;
}

function captureEvents(fetchSpy: ReturnType<typeof vi.spyOn>): CapturedEvent[] {
  const out: CapturedEvent[] = [];
  for (const [url, init] of fetchSpy.mock.calls) {
    if (!String(url).includes('/events/v1/ingest')) continue;
    const body = (init as RequestInit | undefined)?.body;
    if (typeof body !== 'string') continue;
    try {
      const parsed = JSON.parse(body) as { events?: CapturedEvent[] };
      if (Array.isArray(parsed.events)) out.push(...parsed.events);
    } catch {
      // ignore non-JSON bodies
    }
  }
  return out;
}

describe('flows/impersonation — endImpersonation drift (v1.0.1 C9)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetImpersonationForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    await setSession({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
      sessionId: 'admin-session',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('server POST succeeds → only impersonation.ended is emitted (no drift event)', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/impersonation/end')) {
        return Promise.resolve(jsonResp(200, {}));
      }
      // Event ingest endpoint
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    await endImpersonation();
    // The flow uses `void emit(...)` (fire-and-forget). Yield a few microtasks
    // so the IDB persists complete before we ask the reporter to flush.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 30));
    await flushNow();

    const events = captureEvents(fetchSpy);
    const ended = events.filter((e) => e.event_type === 'impersonation.ended');
    const drift = events.filter((e) => e.event_type === 'impersonation.local_clear_drift');
    expect(ended.length).toBe(1);
    expect(drift.length).toBe(0);
  });

  it('server POST throws → both drift AND ended events fire', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/impersonation/end')) {
        // 5xx surfaces as an AuthSdkError thrown by the client.
        return Promise.resolve(
          jsonResp(500, { code: 'SERVER_ERROR', message: 'kaboom' })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    await endImpersonation(); // must not throw — drift path swallows
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 30));
    await flushNow();

    const events = captureEvents(fetchSpy);
    const ended = events.filter((e) => e.event_type === 'impersonation.ended');
    const drift = events.filter((e) => e.event_type === 'impersonation.local_clear_drift');
    expect(drift.length).toBe(1);
    expect(ended.length).toBe(1);
  });

  it('drift payload carries reason=server_call_failed + error_message + error_name', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/auth/v1/impersonation/end')) {
        return Promise.resolve(
          jsonResp(503, { code: 'SERVICE_UNAVAILABLE', message: 'maintenance window' })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    await endImpersonation();
    // The flow uses `void emit(...)` (fire-and-forget). Yield a few microtasks
    // so the IDB persists complete before we ask the reporter to flush.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 30));
    await flushNow();

    const events = captureEvents(fetchSpy);
    const drift = events.find((e) => e.event_type === 'impersonation.local_clear_drift');
    expect(drift).toBeDefined();
    expect(drift!.payload.reason).toBe('server_call_failed');
    expect(typeof drift!.payload.error_message).toBe('string');
    expect((drift!.payload.error_message as string).length).toBeGreaterThan(0);
    expect(typeof drift!.payload.error_name).toBe('string');
    expect((drift!.payload.error_name as string).length).toBeGreaterThan(0);
  });
});
