// @bainbridgebuilders/universal-auth | test/unit/flows/consent-list-flows.test.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// Coverage push: listConsents + listAllConsents + revokeConsent flows
// (lines 60-104 uncovered before this file).
// Cites SDK spec §3.4 + §3.4.1 (consent endpoints, FHIR-grade extensions).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listConsents,
  listAllConsents,
  revokeConsent,
} from '../../../src/flows/consent.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('consent flows — list + revoke', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.4',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('listConsents', () => {
    it('GETs /identity/v1/consents and returns consents array', async () => {
      const sample = [
        {
          id: 'c1',
          consent_type: 'privacy_policy',
          policy_version: '1.0',
          granted_at: '2026-04-30T00:00:00Z',
          revoked_at: null,
        },
      ];
      fetchSpy.mockResolvedValue(jsonResp(200, { consents: sample }));
      const consents = await listConsents();
      expect(consents).toHaveLength(1);
      expect(consents[0].consent_type).toBe('privacy_policy');
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('/identity/v1/consents');
    });

    it('returns empty array when no consents on server', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { consents: [] }));
      expect(await listConsents()).toEqual([]);
    });
  });

  describe('listAllConsents', () => {
    it('normalizes accepted_at → granted_at', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(200, {
          consents: [
            {
              id: 'c1',
              consent_type: 'tos',
              policy_version: '1.0',
              accepted_at: '2026-04-30T00:00:00Z',
              revoked_at: null,
            },
          ],
        })
      );
      const out = await listAllConsents();
      expect(out[0].granted_at).toBe('2026-04-30T00:00:00Z');
    });

    it('preserves granted_at when server returns it directly', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(200, {
          consents: [
            {
              id: 'c2',
              consent_type: 'marketing',
              policy_version: '1.0',
              granted_at: '2026-04-30T00:01:00Z',
              revoked_at: null,
            },
          ],
        })
      );
      const out = await listAllConsents();
      expect(out[0].granted_at).toBe('2026-04-30T00:01:00Z');
    });

    it('falls back to empty string when both granted_at + accepted_at are missing', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(200, {
          consents: [
            {
              id: 'c3',
              consent_type: 'odd_legacy',
              policy_version: '1.0',
              revoked_at: null,
            },
          ],
        })
      );
      const out = await listAllConsents();
      expect(out[0].granted_at).toBe('');
    });

    it('hits /identity/v1/consents/all endpoint, not /consents', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { consents: [] }));
      await listAllConsents();
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('/identity/v1/consents/all');
    });

    it('preserves revoked_at field in normalized output', async () => {
      const revokedAt = '2026-04-30T01:00:00Z';
      fetchSpy.mockResolvedValue(
        jsonResp(200, {
          consents: [
            {
              id: 'c4',
              consent_type: 'agent_buddy_crew',
              policy_version: '1.0',
              accepted_at: '2026-04-30T00:00:00Z',
              revoked_at: revokedAt,
            },
          ],
        })
      );
      const out = await listAllConsents();
      expect(out[0].revoked_at).toBe(revokedAt);
    });
  });

  describe('revokeConsent', () => {
    it('POSTs to /:id/revoke', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { ok: true }));
      await revokeConsent('consent-abc');
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/identity/v1/consents/consent-abc/revoke');
      expect((opts as RequestInit).method).toBe('POST');
    });

    it('url-encodes consentId with special chars', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { ok: true }));
      await revokeConsent('id/with/slashes');
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('id%2Fwith%2Fslashes');
    });
  });
});
