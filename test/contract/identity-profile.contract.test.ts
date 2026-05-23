// @samjonaidi-ship-it/universal-auth | test/contract/identity-profile.contract.test.ts | v1.0.5 | 2026-05-22 | BB
// Pact consumer contract for §3.3 identity-profile endpoints.
//
// Asserts the wire shapes for:
//   * GET  /identity/v1/profile               — happy 200 with full UniversalProfile
//   * PUT  /identity/v1/profile (If-Match)    — 409 VERSION_CONFLICT envelope
//
// The 409 path is what trips the SDK's `sync.conflict` event + `dirtyPatch`
// retention path (profile-store.ts §D1). v1.0.5 (2026-05-22): the code pinned
// here is `VERSION_CONFLICT` — the real CT BFF wire (bff/routes/identity-v1.js
// PUT /identity/v1/profile), not the historical `SYNC_CONFLICT` placeholder.
// profile-store recognises VERSION_CONFLICT, SYNC_CONFLICT and HTTP_409 so the
// back-compat code is still tolerated, but the contract documents reality.

import { describe, it } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'node:path';

const PACT_DIR = resolve(import.meta.dirname ?? '.', '..', '..', 'pacts');
const { like, regex, eachLike } = MatchersV3;

describe('Pact contract — identity profile (§3.3)', () => {
  it('GET /identity/v1/profile returns the canonical UniversalProfile', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [
          { description: 'identity test-crew-1 has an existing profile at version 7' },
        ],
        uponReceiving: 'a request for the current profile',
        withRequest: {
          method: 'GET',
          path: '/identity/v1/profile',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            Authorization: regex(/^Bearer .+$/, 'Bearer eyJhbGc...'),
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: {
            identity_id: like('id_uuid'),
            profile_version: like(7),
            display_name: like('Crew Sam'),
            given_name: like('Sam'),
            family_name: like('Naidi'),
            email: like('sam@example.com'),
            phone_e164: like('+15555550100'),
            completeness_score: like(85),
            missing_required_fields: eachLike('avatar_url'),
            updated_at: regex(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
              '2026-05-04T10:00:00Z'
            ),
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/identity/v1/profile`, {
          method: 'GET',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            Authorization: 'Bearer eyJhbGc...',
          },
        });
        if (r.status !== 200) throw new Error(`expected 200 got ${r.status}`);
      });
  });

  it('PUT /identity/v1/profile with stale If-Match returns 409 VERSION_CONFLICT', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [
          { description: 'identity test-crew-1 has profile at version 8' },
          { description: 'a concurrent writer has bumped profile to version 9' },
        ],
        uponReceiving: 'a profile update with stale If-Match version',
        withRequest: {
          method: 'PUT',
          path: '/identity/v1/profile',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': regex(/^[A-Za-z0-9_-]{16,}$/, 'profileput1234567'),
            'If-Match': '8',
            Authorization: regex(/^Bearer .+$/, 'Bearer eyJhbGc...'),
          },
          body: like({
            display_name: 'Crew Sam Updated',
          }),
        },
        willRespondWith: {
          status: 409,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: {
            code: 'VERSION_CONFLICT',
            message: like('profile_version mismatch — current is 9, you sent 8'),
            current_version: like(9),
            protocol_version: 'v1',
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/identity/v1/profile`, {
          method: 'PUT',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'profileput1234567',
            'If-Match': '8',
            Authorization: 'Bearer eyJhbGc...',
          },
          body: JSON.stringify({ display_name: 'Crew Sam Updated' }),
        });
        if (r.status !== 409) throw new Error(`expected 409 got ${r.status}`);
        const envelope = (await r.json()) as { code: string };
        if (envelope.code !== 'VERSION_CONFLICT') {
          throw new Error(`expected code VERSION_CONFLICT got ${envelope.code}`);
        }
      });
  });
});
