// @samjonaidi-ship-it/universal-auth | test/unit/flows/permission-grants-list-revoke.test.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// Coverage push: list + revoke flow paths in src/flows/permission-grants.ts
// (lines 106-131 — uncovered before this file).
// Cites SDK spec §5.6 (Permissions framework) + §3.3 (permission-grants endpoints).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listPermissionGrants,
  revokePermissionGrant,
} from '../../../src/flows/permission-grants.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('permission-grants list + revoke flows', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.4',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('listPermissionGrants', () => {
    it('returns grants from the server unfiltered when no key passed', async () => {
      const fakeGrants = [
        {
          id: 'g1',
          identity_id: 'sam',
          permission_key: 'geolocation',
          state: 'granted',
          prompted: true,
          device_id: 'dev-1',
          user_agent: 'agent',
          recorded_at: '2026-04-30T00:00:00Z',
          scope: 'while_in_use',
          expires_at: null,
          revoked_at: null,
          revoked_reason: null,
        },
      ];
      fetchSpy.mockResolvedValue(jsonResp(200, { grants: fakeGrants }));
      const grants = await listPermissionGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0].permission_key).toBe('geolocation');
      // Verify URL was unfiltered
      const url = fetchSpy.mock.calls[0][0];
      expect(String(url)).toContain('/identity/v1/permission-grants');
      expect(String(url)).not.toContain('?key=');
    });

    it('appends ?key= query param when filterKey given', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { grants: [] }));
      await listPermissionGrants('camera');
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('?key=camera');
    });

    it('url-encodes special chars in filterKey', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { grants: [] }));
      await listPermissionGrants('background sync');
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('?key=background%20sync');
    });

    it('treats empty string filterKey as no filter (per spec)', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { grants: [] }));
      await listPermissionGrants('');
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).not.toContain('?key=');
    });

    it('returns empty array when server has no grants', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { grants: [] }));
      const grants = await listPermissionGrants();
      expect(grants).toEqual([]);
    });
  });

  describe('revokePermissionGrant', () => {
    it('POSTs to /:id/revoke with reason', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { ok: true }));
      await revokePermissionGrant('grant-abc', 'user toggled off');
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/identity/v1/permission-grants/grant-abc/revoke');
      expect((opts as RequestInit).method).toBe('POST');
      const body = JSON.parse(String((opts as RequestInit).body));
      expect(body.revoked_reason).toBe('user toggled off');
    });

    it('omits reason when undefined', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { ok: true }));
      await revokePermissionGrant('grant-xyz');
      const [, opts] = fetchSpy.mock.calls[0];
      const body = JSON.parse(String((opts as RequestInit).body));
      expect(body.revoked_reason).toBeUndefined();
    });

    it('url-encodes grantId with special chars', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, { ok: true }));
      await revokePermissionGrant('grant/with/slashes');
      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('grant%2Fwith%2Fslashes');
    });
  });
});
