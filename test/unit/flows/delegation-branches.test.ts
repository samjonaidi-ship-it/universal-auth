// @samjonaidi-ship-it/universal-auth | test/unit/flows/delegation-branches.test.ts | v1.0.0 | 2026-05-08 | BB
// COV-1 (rc.5 audit) — branch-coverage tests for flows/delegation.ts.
//
// Targeted branches (per `pnpm test:unit` rc.4: 36.36% on this file):
//   - listDelegatedGrants: response with grants_from_me/grants_to_me UNDEFINED
//     vs present (?? [] fallback)
//   - createDelegatedGrant: input.resource_match undefined vs set, input.effective_until
//     undefined vs set
//   - exportGrantsAsJson: payload contains exported_at + version, valid JSON

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listDelegatedGrants,
  createDelegatedGrant,
  revokeDelegatedGrant,
  exportGrantsAsJson,
} from '../../../src/flows/delegation.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { setSession } from '../../../src/core/token-manager.js';

const SESSION = {
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('delegation flows — branch coverage (COV-1)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    configureClient({
      apiBaseUrl: 'https://example.test',
      protocolVersion: '1.0',
      appId: 'test-app',
      mode: 'production',
    });
    setSession(SESSION);
    fetchSpy = vi.spyOn(globalThis, 'fetch') as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('listDelegatedGrants — fallback branches', () => {
    it('falls back to [] when server omits grants_from_me', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(200, { grants_to_me: [] }), // grants_from_me missing
      );
      const result = await listDelegatedGrants();
      expect(result.grants_from_me).toEqual([]);
      expect(result.grants_to_me).toEqual([]);
    });

    it('falls back to [] when server omits grants_to_me', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(200, { grants_from_me: [] }),
      );
      const result = await listDelegatedGrants();
      expect(result.grants_from_me).toEqual([]);
      expect(result.grants_to_me).toEqual([]);
    });

    it('returns both arrays when server provides them', async () => {
      const grant_from = {
        id: 'g1',
        grantor_id: 'sam',
        grantee_kind: 'identity',
        grantee_id: 'crew-1',
        scopes: ['read:profile'],
        granted_via: 'identity',
      };
      fetchSpy.mockResolvedValue(
        jsonResp(200, {
          grants_from_me: [grant_from],
          grants_to_me: [],
        }),
      );
      const result = await listDelegatedGrants();
      expect(result.grants_from_me).toHaveLength(1);
      expect(result.grants_to_me).toHaveLength(0);
    });
  });

  describe('createDelegatedGrant — optional-field branches', () => {
    it('omits resource_match + effective_until when undefined', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(201, {
          grant: {
            id: 'g1',
            grantor_id: 'sam',
            grantee_kind: 'identity',
            grantee_id: 'crew-1',
            scopes: ['read:profile'],
            granted_via: 'identity',
          },
        }),
      );
      await createDelegatedGrant({
        grantee_kind: 'identity',
        grantee_id: 'crew-1',
        granted_via: 'identity',
        scopes: ['read:profile'],
      });
      const requestBody = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(requestBody.resource_match).toBeUndefined();
      expect(requestBody.effective_until).toBeUndefined();
      expect(requestBody.scopes).toEqual(['read:profile']);
    });

    it('includes resource_match when provided', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(201, {
          grant: {
            id: 'g2',
            grantor_id: 'sam',
            grantee_kind: 'identity',
            grantee_id: 'crew-1',
            scopes: ['read:profile'],
            granted_via: 'identity',
            resource_match: { resource_type: 'project', id: 'p1' },
          },
        }),
      );
      await createDelegatedGrant({
        grantee_kind: 'identity',
        grantee_id: 'crew-1',
        granted_via: 'identity',
        scopes: ['read:profile'],
        resource_match: { resource_type: 'project', id: 'p1' },
      });
      const requestBody = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(requestBody.resource_match).toEqual({
        resource_type: 'project',
        id: 'p1',
      });
    });

    it('includes effective_until when provided', async () => {
      const until = '2026-06-01T00:00:00Z';
      fetchSpy.mockResolvedValue(
        jsonResp(201, {
          grant: {
            id: 'g3',
            grantor_id: 'sam',
            grantee_kind: 'identity',
            grantee_id: 'crew-1',
            scopes: ['read:profile'],
            granted_via: 'identity',
            effective_until: until,
          },
        }),
      );
      await createDelegatedGrant({
        grantee_kind: 'identity',
        grantee_id: 'crew-1',
        granted_via: 'identity',
        scopes: ['read:profile'],
        effective_until: until,
      });
      const requestBody = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string,
      );
      expect(requestBody.effective_until).toBe(until);
    });
  });

  describe('revokeDelegatedGrant', () => {
    it('encodes the grant id in the URL path', async () => {
      fetchSpy.mockResolvedValue(jsonResp(204, null));
      await revokeDelegatedGrant('grant with spaces!');
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain(encodeURIComponent('grant with spaces!'));
    });
  });

  describe('exportGrantsAsJson', () => {
    it('produces a valid JSON Blob with version + exported_at + both arrays', async () => {
      fetchSpy.mockResolvedValue(
        jsonResp(200, { grants_from_me: [], grants_to_me: [] }),
      );
      const blob = await exportGrantsAsJson();
      expect(blob.type).toBe('application/json');
      const text = await blob.text();
      const parsed = JSON.parse(text);
      expect(parsed.version).toBe('1.0');
      expect(typeof parsed.exported_at).toBe('string');
      expect(parsed.grants_from_me).toEqual([]);
      expect(parsed.grants_to_me).toEqual([]);
    });
  });
});
