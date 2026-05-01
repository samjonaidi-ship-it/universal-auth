// @bainbridgebuilders/universal-auth | test/chaos/06-tab-crash-restore.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §11.6 scenario 6 — tab crash + restore.
//
// Scenario: a tab dies (in-memory access token + Shared Worker state lost),
// a new tab opens and re-initializes the SDK. The persisted refresh token
// in IDB should let the new tab issue a session/refresh and recover the
// session without prompting the user to re-authenticate.
//
// This test is end-to-end against BFF (via proxy). We:
//   1. Sign in → grab refresh_token (the only thing that survives a crash)
//   2. Discard the access token (simulate in-memory loss)
//   3. POST /session/refresh with the refresh token → gets a NEW access token
//   4. GET /me with the new access token succeeds
//
// What this proves:
//   * Refresh token alone is sufficient to re-establish a working session
//   * No user prompt or re-authentication needed for crash recovery

import { describe, it, expect, beforeAll } from 'vitest';
import { BFF_PROXY_URL } from './setup.js';

const TEST_MODE_KEY = process.env.TEST_MODE_KEY ?? 'dev-test-mode-key';

async function bffPost<T = unknown>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
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
  return { status: r.status, body: (await r.json().catch(() => null)) as T };
}

async function bffGet<T = unknown>(path: string, headers: Record<string, string> = {}) {
  const r = await fetch(`${BFF_PROXY_URL}${path}`, {
    headers: {
      'X-Auth-Protocol-Version': 'v1',
      'X-App-Id': 'bb_chaos_test',
      ...headers,
    },
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as T };
}

describe('Chaos #6 — tab crash + restore (§11.6)', () => {
  let refreshToken: string;
  let originalAccessToken: string;
  let originalIdentityId: string;

  beforeAll(async () => {
    const r = await bffPost<{
      access_token: string;
      refresh_token: string;
      identity: { identity_id: string };
    }>(
      '/auth/v1/code/verify',
      {
        destination: 'test-crew-1@test.bainbridgebuilders.com',
        code: '000000',
        device_id: 'chaos-device-6',
        app_id: 'bb_chaos_test',
      },
      { 'X-Test-Mode-Key': TEST_MODE_KEY }
    );
    if (r.status !== 200) throw new Error(`sign-in failed: HTTP ${r.status}`);
    refreshToken = r.body.refresh_token;
    originalAccessToken = r.body.access_token;
    originalIdentityId = r.body.identity.identity_id;
  });

  it('recovery: refresh token alone re-establishes session', async () => {
    // Simulate tab crash — discard access token (in-memory state is gone)
    // (We literally just stop using `originalAccessToken` from this point.)

    // New tab spins up, reads refresh_token from IDB (here: from closure),
    // and posts to /session/refresh.
    const refreshed = await bffPost<{ access_token: string }>(
      '/auth/v1/session/refresh',
      { refresh_token: refreshToken }
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.access_token).toBeTypeOf('string');
    expect(refreshed.body.access_token).not.toBe(originalAccessToken);

    // New access token is valid — fetch /me succeeds
    const me = await bffGet<{ identity: { identity_id: string } }>('/auth/v1/me', {
      Authorization: `Bearer ${refreshed.body.access_token}`,
    });
    expect(me.status).toBe(200);
    expect(me.body.identity.identity_id).toBe(originalIdentityId);
  });
});
