// @samjonaidi-ship-it/universal-auth | test/unit/flows/recovery-logout-event-name.test.ts | v1.0.0 | 2026-09-06 | BB
//
// Pins the sign-out event name to `session.logout` (v1.2.0 rename).
//
// It used to be the bare string `logout` — the ONLY dotless name in this SDK's
// 28-event vocabulary. BB_ControlTower's /events/v1/ingest validates against an
// exact-match allowlist that contains no dotless type, so every `logout` this
// SDK emitted was discarded as UNKNOWN_EVENT_TYPE and never reached
// ct_bff.app_events. Measured 2026-09-06 on the bb-controltower-bff log source:
// 13 events dropped over 09-03 13:54 → 09-06 16:56 from bb_express alone.
//
// The regression this guards is silent by construction: the emit is
// fire-and-forget (`void emit(...)`), the ingest rejection travels only in a
// response body the SDK never reads, and sign-out keeps working perfectly
// either way. Nothing surfaces the mistake except the drop log on the far side,
// so the name is asserted here on the wire envelope rather than trusted.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signOut, signOutEverywhere } from '../../../src/flows/recovery.js';
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
import { __resetEntitlementsForTests } from '../../../src/core/entitlements.js';

const BASE = 'https://ct-bff.test';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('flows/recovery — sign-out event name', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetEntitlementsForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    fetchSpy.mockImplementation(() => Promise.resolve(jsonResp(200, { ok: true })));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  async function installSession(): Promise<void> {
    await setSession({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
      sessionId: 's1',
    });
  }

  /** Every event_type that reached an /events/v1/ingest POST. */
  async function ingestedEventTypes(): Promise<string[]> {
    await flushNow();
    return fetchSpy.mock.calls
      .filter(([url]) => String(url).includes('/events/v1/ingest'))
      .flatMap(([, init]) => {
        const body = JSON.parse(String((init as RequestInit).body)) as {
          events: Array<{ event_type: string }>;
        };
        return body.events.map((e) => e.event_type);
      });
  }

  it('signOut emits session.logout, never the dotless logout', async () => {
    await installSession();
    await signOut();

    const types = await ingestedEventTypes();
    expect(types).toContain('session.logout');
    expect(types).not.toContain('logout');
  });

  it('signOutEverywhere emits session.logout with scope all_devices', async () => {
    await installSession();
    await signOutEverywhere();

    await flushNow();
    const events = fetchSpy.mock.calls
      .filter(([url]) => String(url).includes('/events/v1/ingest'))
      .flatMap(([, init]) => {
        const body = JSON.parse(String((init as RequestInit).body)) as {
          events: Array<{ event_type: string; payload: Record<string, unknown> }>;
        };
        return body.events;
      });

    const logout = events.find((e) => e.event_type === 'session.logout');
    expect(logout).toBeDefined();
    expect(logout!.payload).toMatchObject({ forced: false, scope: 'all_devices' });
    expect(events.map((e) => e.event_type)).not.toContain('logout');
  });

  // The rename is only worth anything if the name CT will accept is the one on
  // the wire, so assert the shape the allowlist actually enforces rather than
  // just "it changed": `{feature}.{suffix}`, matching session.revoked /
  // session.refreshed / login.success.
  it('emits a dotted {feature}.{suffix} name, like every other SDK event', async () => {
    await installSession();
    await signOut();

    const types = await ingestedEventTypes();
    const logout = types.find((t) => t.endsWith('logout'));
    expect(logout).toBe('session.logout');
    expect(logout).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  // Sign-out must still work end to end — the rename touches only the label.
  it('still revokes the session server-side', async () => {
    await installSession();
    await signOut();

    const revoke = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('/auth/v1/session/revoke'),
    );
    expect(revoke).toBeDefined();
  });
});
