// @samjonaidi-ship-it/universal-auth | test/contract/identity-settings.contract.test.ts | v1.0.5 | 2026-05-04 | BB
// Pact consumer contract for §3.3 identity-settings endpoints.
//
// Asserts the wire shapes for:
//   * GET /identity/v1/settings              — happy 200 with { settings, version }
//   * PUT /identity/v1/settings (If-Match)   — 409 SYNC_CONFLICT envelope
//
// The 409 trips settings-sync's `sync.conflict` event + pendingPatch retention
// (settings-sync.ts §C8). Wire shape MUST match what `errorFromEnvelope`
// expects (code='SYNC_CONFLICT' or HTTP_409 fallback).

import { describe, it } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'node:path';

const PACT_DIR = resolve(import.meta.dirname ?? '.', '..', '..', 'pacts');
const { like, regex } = MatchersV3;

describe('Pact contract — identity settings (§3.3)', () => {
  it('GET /identity/v1/settings returns settings + version', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [
          { description: 'identity test-crew-1 has settings at version 4' },
        ],
        uponReceiving: 'a request for current settings',
        withRequest: {
          method: 'GET',
          path: '/identity/v1/settings',
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
            settings: like({
              theme: 'dark',
              notifications_enabled: true,
            }),
            version: like(4),
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/identity/v1/settings`, {
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

  it('PUT /identity/v1/settings with stale If-Match returns 409 SYNC_CONFLICT', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [
          { description: 'identity test-crew-1 has settings at version 5' },
          { description: 'a concurrent writer has bumped settings to version 6' },
        ],
        uponReceiving: 'a settings update with stale If-Match version',
        withRequest: {
          method: 'PUT',
          path: '/identity/v1/settings',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': regex(/^[A-Za-z0-9_-]{16,}$/, 'settingsput123456'),
            'If-Match': '5',
            Authorization: regex(/^Bearer .+$/, 'Bearer eyJhbGc...'),
          },
          body: like({
            settings: { theme: 'light' },
          }),
        },
        willRespondWith: {
          status: 409,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: {
            code: 'SYNC_CONFLICT',
            error: like('Settings version mismatch.'),
            trace_id: like('t_conflict_xyz'),
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/identity/v1/settings`, {
          method: 'PUT',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'settingsput123456',
            'If-Match': '5',
            Authorization: 'Bearer eyJhbGc...',
          },
          body: JSON.stringify({ settings: { theme: 'light' } }),
        });
        if (r.status !== 409) throw new Error(`expected 409 got ${r.status}`);
        const envelope = (await r.json()) as { code: string };
        if (envelope.code !== 'SYNC_CONFLICT') {
          throw new Error(`expected code SYNC_CONFLICT got ${envelope.code}`);
        }
      });
  });
});
