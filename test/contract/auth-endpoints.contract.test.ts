// @samjonaidi-ship-it/universal-auth | test/contract/auth-endpoints.contract.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Pact consumer contract for §3.1 auth endpoints.
//
// What this asserts: the EXACT shapes the SDK sends + expects on each
// auth endpoint. Generated pact file is consumed by CT BFF CI's verifier
// to confirm the BFF's actual responses match.

import { describe, it } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'node:path';

const PACT_DIR = resolve(import.meta.dirname ?? '.', '..', '..', 'pacts');
const { like, regex, integer, string, eachLike } = MatchersV3;

describe('Pact contract — auth endpoints (§3.1)', () => {
  it('POST /auth/v1/code/request returns generic ok (enumeration-safe)', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [{ description: 'app bb_express is registered' }],
        uponReceiving: 'a request for an SMS code',
        withRequest: {
          method: 'POST',
          path: '/auth/v1/code/request',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': regex(/^[A-Za-z0-9_-]{16,}$/, 'abcd1234efgh5678'),
          },
          body: like({
            destination: '+15555550100',
            channel: 'sms',
            app_id: 'bb_express',
          }),
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': regex(/^application\/json/, 'application/json; charset=utf-8') },
          body: { ok: true },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/auth/v1/code/request`, {
          method: 'POST',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'abcd1234efgh5678',
          },
          body: JSON.stringify({
            destination: '+15555550100',
            channel: 'sms',
            app_id: 'bb_express',
          }),
        });
        if (r.status !== 200) throw new Error(`expected 200 got ${r.status}`);
      });
  });

  it('POST /auth/v1/code/verify with valid code returns session', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [
          { description: 'identity test-crew-1 exists' },
          { description: 'a valid one-time code 000000 is pending for test-crew-1' },
        ],
        uponReceiving: 'a code verify request',
        withRequest: {
          method: 'POST',
          path: '/auth/v1/code/verify',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'Content-Type': 'application/json',
          },
          body: {
            destination: 'test-crew-1@test.bainbridgebuilders.com',
            code: '000000',
            device_id: like('test-device-abc'),
            app_id: 'bb_express',
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': regex(/^application\/json/, 'application/json; charset=utf-8') },
          body: {
            access_token: like('eyJhbGc...'),
            refresh_token: like('rt_a1b2c3d4'),
            session_id: like('s_uuid'),
            expires_at: regex(
              /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
              '2026-04-28T05:00:00Z'
            ),
            identity: {
              identity_id: like('id_uuid'),
              identity_kind: regex(
                /^(human|device|service|external_app|agent)$/,
                'human'
              ),
              display_name: like('Crew Sam'),
            },
            aggregate: {
              features: eachLike('crew.timesheet'),
              app_access: eachLike('bb_express'),
            },
            session_meta: {
              session_id: like('s_uuid'),
              issued_at: like('2026-04-28T04:30:00Z'),
              expires_at: like('2026-04-28T05:00:00Z'),
            },
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/auth/v1/code/verify`, {
          method: 'POST',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            destination: 'test-crew-1@test.bainbridgebuilders.com',
            code: '000000',
            device_id: 'test-device-abc',
            app_id: 'bb_express',
          }),
        });
        if (r.status !== 200) throw new Error(`expected 200 got ${r.status}`);
      });
  });
});
