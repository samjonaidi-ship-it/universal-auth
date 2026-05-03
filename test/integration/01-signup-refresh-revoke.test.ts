// @samjonaidi-ship-it/universal-auth | test/integration/01-signup-refresh-revoke.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Integration test #1 per spec §11.3 — full sign-up → refresh → revoke loop.
//
// Asserts:
//   1. POST /auth/v1/code/request returns generic ok (enumeration-safe per §3.1)
//   2. POST /auth/v1/code/verify with seeded code 000000 returns access+refresh tokens
//   3. GET /auth/v1/me returns the identity
//   4. POST /auth/v1/session/refresh rotates the access token
//   5. POST /auth/v1/session/revoke kills the session — subsequent /me returns 401

import { describe, it, expect } from 'vitest';
import { bff, signInSeeded } from './helpers.js';

describe('Integration #1 — signup → refresh → revoke (§11.3)', () => {
  it('full lifecycle: code/request → verify → /me → refresh → revoke', async () => {
    // Step 1: request code (enumeration-safe — always returns ok)
    const codeReq = await bff('/auth/v1/code/request', {
      method: 'POST',
      testMode: true,
      body: {
        destination: 'test-crew-1@test.bainbridgebuilders.com',
        app_id: 'bb_integration_test',
      },
    });
    expect(codeReq.status).toBe(200);

    // Step 2: verify code → session issued
    const session = await signInSeeded('test-crew-1');
    expect(session.accessToken).toBeTypeOf('string');
    expect(session.refreshToken).toBeTypeOf('string');
    expect(session.identity.identity_id).toBeTypeOf('string');

    // Step 3: GET /me returns the identity
    const me = await bff<{ identity: { identity_id: string } }>('/auth/v1/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cookie: session.cookie,
    });
    expect(me.status).toBe(200);
    expect(me.body.identity.identity_id).toBe(session.identity.identity_id);

    // Step 4: refresh rotates the access token
    const refreshed = await bff<{ access_token: string; expires_at: string }>(
      '/auth/v1/session/refresh',
      {
        method: 'POST',
        body: { refresh_token: session.refreshToken },
      }
    );
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.access_token).toBeTypeOf('string');
    expect(refreshed.body.access_token).not.toBe(session.accessToken);

    // Step 5: revoke → /me with the OLD access token returns 401
    const revoke = await bff('/auth/v1/session/revoke', {
      method: 'POST',
      headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
      cookie: session.cookie,
      body: {},
    });
    expect(revoke.status).toBe(200);

    const meAfterRevoke = await bff('/auth/v1/me', {
      headers: { Authorization: `Bearer ${refreshed.body.access_token}` },
      cookie: session.cookie,
    });
    expect(meAfterRevoke.status).toBe(401);
  });
});
