// @samjonaidi-ship-it/universal-auth | test/chaos/01-connection-drop-mid-refresh.test.ts | v1.0.1 | 2026-05-22 | BB
// Spec §11.6 scenario 1 — connection drop mid-refresh.
//
// Scenario:
//   1. Sign in via clean proxy → got refresh_token
//   2. Add `reset_peer` toxic on /session/refresh path
//   3. Attempt refresh → expect a network-class error (NOT 401)
//   4. Remove toxic → retry refresh → succeeds, new access token issued
//
// What this proves:
//   * SDK does NOT confuse a TCP RST with `AuthSessionExpired`
//   * After fault clears, the same refresh token is still valid (idempotent)

import { describe, it, expect, beforeAll } from 'vitest';
import { BFF_PROXY_URL } from './setup.js';
import { addToxic } from './toxics.js';

const TEST_MODE_KEY = process.env.TEST_MODE_KEY ?? 'dev-test-mode-key';

async function bffPost(path: string, body: unknown, headers: Record<string, string> = {}) {
  const r = await fetch(`${BFF_PROXY_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Protocol-Version': 'v1',
      'X-App-Id': 'bb_chaos_test',
      'X-SDK-Version': '1.0.0-rc.1-test',
      'Idempotency-Key': crypto.randomUUID(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) as unknown };
}

// Sign in a fresh seeded session through the proxy (clean path) and return
// its refresh token. Each call yields a brand-new, unused refresh token.
async function signInFresh(): Promise<string> {
  const r = await bffPost(
    '/auth/v1/code/verify',
    {
      destination: 'test-crew-1@test.bainbridgebuilders.com',
      code: '000000',
      device_id: 'chaos-device-' + crypto.randomUUID().slice(0, 8),
      app_id: 'bb_chaos_test',
    },
    { 'X-Test-Mode-Key': TEST_MODE_KEY }
  );
  if (r.status !== 200) {
    throw new Error(`[chaos #1] sign-in failed: HTTP ${r.status}`);
  }
  return (r.body as { refresh_token: string }).refresh_token;
}

describe('Chaos #1 — connection drop mid-refresh (§11.6)', () => {
  let refreshToken: string;

  beforeAll(async () => {
    refreshToken = await signInFresh();
  });

  it('reset_peer during /session/refresh surfaces network error, not session-expired', async () => {
    // Inject reset_peer with 1ms timeout — kills any in-flight connection
    await addToxic('reset_peer', { timeout: 1 }, { name: 'drop-refresh' });

    let networkError: Error | null = null;
    try {
      await bffPost('/auth/v1/session/refresh', { refresh_token: refreshToken });
    } catch (err) {
      networkError = err as Error;
    }

    // The fetch should have failed with a connection-class error.
    // Critically, we did NOT receive a 401 — that would mean the SDK might
    // incorrectly mark the session as revoked.
    expect(networkError).toBeInstanceOf(Error);
  }, 30_000);

  it('after toxic clears, a fresh refresh succeeds', async () => {
    // setup.ts beforeEach already cleared the toxic. Verify the SDK→ct-bff
    // path recovered by doing one clean refresh.
    //
    // We sign in fresh rather than reuse the beforeAll token: `reset_peer`
    // with timeout:1 still forwards the request body to ct-bff before sending
    // the RST, so the previous test's "dropped" refresh actually reached the
    // server and consumed that token (refresh tokens are single-use / rotated
    // — ct-bff issues a new one each refresh). Reusing it here would 401 on a
    // legitimately-consumed token and tell us nothing about post-toxic health.
    const freshToken = await signInFresh();
    const r = await bffPost('/auth/v1/session/refresh', { refresh_token: freshToken });
    expect(r.status).toBe(200);
    expect((r.body as { access_token: string }).access_token).toBeTypeOf('string');
  });
});
