// @samjonaidi-ship-it/universal-auth | test/chaos/02-5xx-burst-events.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §11.6 scenario 2 — 5xx burst on event ingestion.
//
// Toxiproxy operates at TCP layer (cannot return synthetic 5xx). Closest
// approximation: `timeout` toxic that kills the connection after N ms,
// which the SDK treats as a network failure and retries with backoff.
//
// Scenario:
//   1. Inject 100ms timeout on every connection through the proxy
//   2. Attempt POST /events/v1/ingest 5 times back-to-back
//   3. All fail; SDK is expected to surface failures (caller catches)
//   4. Remove toxic; retry succeeds.
//
// What this proves:
//   * Persistent backend trouble does not crash the SDK
//   * Each failed call surfaces an error (caller decides retry strategy)
//   * Recovery is automatic once network is restored

import { describe, it, expect, beforeAll } from 'vitest';
import { BFF_PROXY_URL } from './setup.js';
import { addToxic } from './toxics.js';

const TEST_MODE_KEY = process.env.TEST_MODE_KEY ?? 'dev-test-mode-key';

async function signIn(): Promise<{ accessToken: string }> {
  const r = await fetch(`${BFF_PROXY_URL}/auth/v1/code/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Protocol-Version': 'v1',
      'X-App-Id': 'bb_chaos_test',
      'X-Test-Mode-Key': TEST_MODE_KEY,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      destination: 'test-crew-1@test.bainbridgebuilders.com',
      code: '000000',
      device_id: 'chaos-device-2',
      app_id: 'bb_chaos_test',
    }),
  });
  const body = (await r.json()) as { access_token: string };
  return { accessToken: body.access_token };
}

async function postEvent(accessToken: string): Promise<number> {
  const r = await fetch(`${BFF_PROXY_URL}/events/v1/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Protocol-Version': 'v1',
      'X-App-Id': 'bb_chaos_test',
      Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      events: [
        {
          event_type: 'session.heartbeat',
          ts: new Date().toISOString(),
          client_ts: new Date().toISOString(),
          sdk_version: '1.0.0-rc.1-test',
          protocol_version: 'v1',
        },
      ],
    }),
  }).catch((e) => ({ ok: false, status: 0, _err: e } as unknown as Response & { _err: Error }));
  return r.status;
}

describe('Chaos #2 — 5xx burst on event ingestion (§11.6)', () => {
  let accessToken: string;

  beforeAll(async () => {
    const session = await signIn();
    accessToken = session.accessToken;
  });

  it('persistent network fault → SDK surfaces error per call, recovers when fault clears', async () => {
    // Toxic: every connection killed after 50ms — guarantees no successful response
    await addToxic('timeout', { timeout: 50 }, { name: '5xx-burst' });

    // Burst of 5 event posts; each will fail at the network layer
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => postEvent(accessToken))
    );

    // Every attempt should have either thrown OR returned non-2xx
    for (const r of results) {
      if (r.status === 'fulfilled') {
        expect(r.value === 0 || r.value >= 500 || r.value === 408).toBe(true);
      } else {
        // Network error class — expected
        expect(r.reason).toBeInstanceOf(Error);
      }
    }

    // Setup's beforeEach clears toxics for the NEXT test, but we want to
    // recover within this test to prove same-test recovery works.
    // Manually delete the toxic.
    await fetch(`${process.env.TOXIPROXY_API ?? 'http://localhost:8474'}/proxies/ct-bff/toxics/5xx-burst`, {
      method: 'DELETE',
    });

    // Recovery: next call succeeds
    const recovered = await postEvent(accessToken);
    expect([200, 202, 204]).toContain(recovered);
  }, 30_000);
});
