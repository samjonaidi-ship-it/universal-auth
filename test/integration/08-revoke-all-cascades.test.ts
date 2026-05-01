// @bainbridgebuilders/universal-auth | test/integration/08-revoke-all-cascades.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Integration test #8 per spec §11.3 — POST /auth/v1/session/revoke-all cascades to all sessions.
//
// Scenario: same user signs in 3 times (3 different devices). Then calls
// revoke-all on one. All 3 sessions should be invalidated — verified by
// /me returning 401 on each device's old access token.

import { describe, it, expect } from 'vitest';
import { bff, signInSeeded } from './helpers.js';

describe('Integration #8 — revoke-all cascades (§11.3, §3.1)', () => {
  it('3 sessions → revoke-all on one → all 3 die', async () => {
    // Three independent sign-ins (each returns its own access token + refresh + session_id)
    const s1 = await signInSeeded('test-crew-1');
    const s2 = await signInSeeded('test-crew-1');
    const s3 = await signInSeeded('test-crew-1');

    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(s2.sessionId).not.toBe(s3.sessionId);

    // Sanity — all 3 can hit /me
    for (const s of [s1, s2, s3]) {
      const me = await bff('/auth/v1/me', {
        headers: { Authorization: `Bearer ${s.accessToken}` },
        cookie: s.cookie,
      });
      expect(me.status).toBe(200);
    }

    // Revoke-all from session 1
    const revokeAll = await bff('/auth/v1/session/revoke-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s1.accessToken}` },
      cookie: s1.cookie,
      body: {},
    });
    expect(revokeAll.status).toBe(200);

    // All 3 access tokens should now be 401 (server-side session_id invalidated)
    for (const s of [s1, s2, s3]) {
      const me = await bff('/auth/v1/me', {
        headers: { Authorization: `Bearer ${s.accessToken}` },
        cookie: s.cookie,
      });
      expect(me.status).toBe(401);
    }

    // Refresh tokens should also be revoked (no resurrecting via refresh)
    for (const s of [s1, s2, s3]) {
      const refreshed = await bff('/auth/v1/session/refresh', {
        method: 'POST',
        body: { refresh_token: s.refreshToken },
      });
      expect(refreshed.status).toBe(401);
    }
  });
});
