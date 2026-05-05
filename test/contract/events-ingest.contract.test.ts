// @samjonaidi-ship-it/universal-auth | test/contract/events-ingest.contract.test.ts | v1.0.4 | 2026-05-04 | BB
// Pact consumer contract for §3.2 / §6 event ingest endpoint.
//
// Asserts the wire shapes for:
//   * POST /events/v1/ingest                    — happy 202 (batch accepted)
//   * POST /events/v1/ingest (unknown type)     — 400 UNKNOWN_EVENT_TYPE envelope
//
// The 400 path is what trips event-reporter's `isPermanentFailure` branch
// (drops the row instead of infinite-retrying) — the BFF MUST emit
// UNKNOWN_EVENT_TYPE as the canonical code or the SDK will requeue.

import { describe, it } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'node:path';

const PACT_DIR = resolve(import.meta.dirname ?? '.', '..', '..', 'pacts');
const { like, regex, eachLike } = MatchersV3;

describe('Pact contract — events ingest (§3.2 / §6)', () => {
  it('POST /events/v1/ingest accepts a batch and returns 202', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [{ description: 'event ingest is healthy' }],
        uponReceiving: 'a batch of two well-formed events',
        withRequest: {
          method: 'POST',
          path: '/events/v1/ingest',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': regex(/^[A-Za-z0-9_-]{16,}$/, 'eventbatch1234567'),
          },
          body: {
            events: eachLike({
              event_type: like('profile.field_saved'),
              app_id: like('bb_express'),
              identity_id: like('id_uuid'),
              session_id: like('s_uuid'),
              device_id: like('dev_uuid'),
              client_ts: like('2026-05-04T10:00:00Z'),
              payload: like({ field_keys: ['display_name'] }),
              sdk_version: like('1.0.4'),
              protocol_version: 'v1',
            }),
          },
        },
        willRespondWith: {
          status: 202,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: { accepted: like(2) },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/events/v1/ingest`, {
          method: 'POST',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'eventbatch1234567',
          },
          body: JSON.stringify({
            events: [
              {
                event_type: 'profile.field_saved',
                app_id: 'bb_express',
                identity_id: 'id_uuid',
                session_id: 's_uuid',
                device_id: 'dev_uuid',
                client_ts: '2026-05-04T10:00:00Z',
                payload: { field_keys: ['display_name'] },
                sdk_version: '1.0.4',
                protocol_version: 'v1',
              },
            ],
          }),
        });
        if (r.status !== 202) throw new Error(`expected 202 got ${r.status}`);
      });
  });

  it('POST /events/v1/ingest rejects an unknown event type with UNKNOWN_EVENT_TYPE', async () => {
    const provider = new PactV3({
      consumer: 'bb-universal-auth-sdk',
      provider: 'bb-ct-bff',
      dir: PACT_DIR,
      logLevel: 'warn',
    });

    await provider
      .addInteraction({
        states: [{ description: 'event ingest is healthy' }],
        uponReceiving: 'a batch with an unknown event_type',
        withRequest: {
          method: 'POST',
          path: '/events/v1/ingest',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': regex(/^[A-Za-z0-9_-]{16,}$/, 'unknownevent12345'),
          },
          body: like({
            events: [
              {
                event_type: 'not.a.real.event',
                app_id: 'bb_express',
                identity_id: 'id_uuid',
                session_id: 's_uuid',
                device_id: 'dev_uuid',
                client_ts: '2026-05-04T10:00:00Z',
                payload: {},
                sdk_version: '1.0.4',
                protocol_version: 'v1',
              },
            ],
          }),
        },
        willRespondWith: {
          status: 400,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: {
            code: 'UNKNOWN_EVENT_TYPE',
            error: like('Unknown event_type: not.a.real.event'),
            trace_id: like('t_unknown_event'),
          },
        },
      })
      .executeTest(async (mockserver) => {
        const r = await fetch(`${mockserver.url}/events/v1/ingest`, {
          method: 'POST',
          headers: {
            'X-Auth-Protocol-Version': 'v1',
            'X-App-Id': 'bb_express',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'unknownevent12345',
          },
          body: JSON.stringify({
            events: [
              {
                event_type: 'not.a.real.event',
                app_id: 'bb_express',
                identity_id: 'id_uuid',
                session_id: 's_uuid',
                device_id: 'dev_uuid',
                client_ts: '2026-05-04T10:00:00Z',
                payload: {},
                sdk_version: '1.0.4',
                protocol_version: 'v1',
              },
            ],
          }),
        });
        if (r.status !== 400) throw new Error(`expected 400 got ${r.status}`);
        const envelope = (await r.json()) as { code: string };
        if (envelope.code !== 'UNKNOWN_EVENT_TYPE') {
          throw new Error(`expected code UNKNOWN_EVENT_TYPE got ${envelope.code}`);
        }
      });
  });
});
