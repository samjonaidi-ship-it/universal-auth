// @samjonaidi-ship-it/universal-auth | test/contract/identity-consents.contract.test.ts | v1.0.5 | 2026-05-04 | BB
// Pact consumer contract for §3.4 / §D2.6 consent endpoints.
//
// Asserts the wire shapes for:
//   * GET  /identity/v1/consent-documents?audience=X — list documents (anon-allowed)
//   * POST /identity/v1/consents/bulk                — atomic bulk accept
//   * POST /identity/v1/consents/bulk (missing)      — 400 CONSENT_REQUIRED envelope
//   * GET  /identity/v1/consents                     — list active consents

import { describe, it } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'node:path';

const PACT_DIR = resolve(import.meta.dirname ?? '.', '..', '..', 'pacts');
const { like, regex, eachLike } = MatchersV3;

describe('Pact contract — identity consents (§3.4)', () => {
  it('GET /identity/v1/consent-documents?audience=crew lists required + optional documents', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [
          { description: 'audience crew has 2 required + 1 optional consent doc' },
        ],
        uponReceiving: 'a request for consent documents for audience=crew',
        withRequest: {
          method: 'GET',
          path: '/identity/v1/consent-documents',
          query: { audience: 'crew' },
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: {
            documents: eachLike({
              consent_type: like('terms_of_service'),
              policy_version: like('2026-01-01'),
              required: like(true),
              title: like('Terms of Service'),
              url: like('https://bainbridgebuilders.com/legal/tos'),
            }),
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(
          `${mockserver.url}/identity/v1/consent-documents?audience=crew`,
          {
            method: 'GET',
            headers: {
              'X-Auth-Protocol-Version': 'v1',
              'X-App-Id': 'bb_express',
            },
          }
        );
        if (r.status !== 200) throw new Error(`expected 200 got ${r.status}`);
      });
  });

  it('POST /identity/v1/consents/bulk atomically records all consents', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [{ description: 'identity test-crew-1 exists' }],
        uponReceiving: 'a bulk consent acceptance request',
        withRequest: {
          method: 'POST',
          path: '/identity/v1/consents/bulk',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': regex(/^[A-Za-z0-9_-]{16,}$/, 'bulkconsent12345'),
            Authorization: regex(/^Bearer .+$/, 'Bearer eyJhbGc...'),
          },
          body: {
            consents: eachLike({
              consent_type: 'terms_of_service',
              policy_version: '2026-01-01',
            }),
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: { ok: true },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/identity/v1/consents/bulk`, {
          method: 'POST',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'bulkconsent12345',
            Authorization: 'Bearer eyJhbGc...',
          },
          body: JSON.stringify({
            consents: [
              { consent_type: 'terms_of_service', policy_version: '2026-01-01' },
              { consent_type: 'privacy_policy', policy_version: '2026-01-01' },
            ],
          }),
        });
        if (r.status !== 200) throw new Error(`expected 200 got ${r.status}`);
      });
  });

  it('POST /identity/v1/consents/bulk rejects missing required consents with CONSENT_REQUIRED', async () => {
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
          { description: 'audience crew requires terms_of_service + privacy_policy' },
        ],
        uponReceiving: 'a bulk consent request missing privacy_policy',
        withRequest: {
          method: 'POST',
          path: '/identity/v1/consents/bulk',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': regex(/^[A-Za-z0-9_-]{16,}$/, 'partialconsent123'),
            Authorization: regex(/^Bearer .+$/, 'Bearer eyJhbGc...'),
          },
          body: like({
            consents: [
              { consent_type: 'terms_of_service', policy_version: '2026-01-01' },
            ],
          }),
        },
        willRespondWith: {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: {
            code: 'CONSENT_REQUIRED',
            error: like('One or more required consents are missing.'),
            missing_consents: eachLike('privacy_policy'),
            trace_id: like('t_consent_missing'),
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/identity/v1/consents/bulk`, {
          method: 'POST',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'partialconsent123',
            Authorization: 'Bearer eyJhbGc...',
          },
          body: JSON.stringify({
            consents: [
              { consent_type: 'terms_of_service', policy_version: '2026-01-01' },
            ],
          }),
        });
        if (r.status !== 400) throw new Error(`expected 400 got ${r.status}`);
        const envelope = (await r.json()) as { code: string };
        if (envelope.code !== 'CONSENT_REQUIRED') {
          throw new Error(`expected code CONSENT_REQUIRED got ${envelope.code}`);
        }
      });
  });

  it('GET /identity/v1/consents lists active consents for the current identity', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [
          { description: 'identity test-crew-1 has 2 active consents' },
        ],
        uponReceiving: 'a request to list active consents',
        withRequest: {
          method: 'GET',
          path: '/identity/v1/consents',
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
            consents: eachLike({
              id: like('cons_uuid'),
              consent_type: like('terms_of_service'),
              policy_version: like('2026-01-01'),
              granted_at: regex(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
                '2026-04-15T12:00:00Z'
              ),
              revoked_at: null,
            }),
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/identity/v1/consents`, {
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
});
