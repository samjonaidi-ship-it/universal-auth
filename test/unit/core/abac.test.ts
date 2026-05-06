// @samjonaidi-ship-it/universal-auth | test/unit/core/abac.test.ts | v0.1.0 | 2026-05-06 | BB
// L3.3 ABAC client cache + imperative API. Per ABAC_DESIGN_v1.0.md §5.1 + §8.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  canAccess,
  canAccessBulk,
  invalidateAccessCache,
  __resetAbacForTests,
  type AccessDecision,
} from '../../../src/core/abac.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests, setSession } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function decision(allowed: boolean): AccessDecision {
  return {
    decision: allowed ? 'permit' : 'deny',
    allowed,
    matched_policy_ids: allowed ? ['p_test_1'] : [],
    reason: allowed ? 'matched test policy' : 'default deny',
    protocol_version: 'v1',
  };
}

async function installSession(sessionId = 'sess_abac_1'): Promise<void> {
  await setSession({
    accessToken: 'tok_abac',
    refreshToken: 'r_abac',
    expiresAt: Date.now() + 60_000,
    sessionId,
  });
}

describe('core/abac', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    __resetAbacForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '0.1.0' });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    await installSession();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('canAccess', () => {
    it('hits GET /access/v1/check on cache miss', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, decision(true)));
      const allowed = await canAccess({ resource_type: 'receipt', id: 'r1' }, 'delete');
      expect(allowed).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0]![0] as string;
      expect(url).toContain('/access/v1/check?');
      expect(url).toContain('resource_type=receipt');
      expect(url).toContain('resource_id=r1');
      expect(url).toContain('action=delete');
    });

    it('returns cached value on second call without re-fetching (TTL)', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, decision(true)));
      await canAccess({ resource_type: 'receipt', id: 'r1' }, 'delete');
      const second = await canAccess({ resource_type: 'receipt', id: 'r1' }, 'delete');
      expect(second).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('treats indeterminate as deny via the server-supplied `allowed` field', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResp(200, {
          decision: 'indeterminate',
          allowed: false,
          matched_policy_ids: [],
          reason: 'no matching policy',
          protocol_version: 'v1',
        } satisfies AccessDecision)
      );
      const allowed = await canAccess({ resource_type: 'jobsite', id: 'j1' }, 'write');
      expect(allowed).toBe(false);
    });

    it('invalidateAccessCache forces a re-fetch', async () => {
      fetchSpy.mockResolvedValue(jsonResp(200, decision(true)));
      await canAccess({ resource_type: 'r', id: 'x' }, 'read');
      invalidateAccessCache();
      await canAccess({ resource_type: 'r', id: 'x' }, 'read');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('propagates server errors', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResp(500, { error: { code: 'HTTP_500', message: 'boom' } })
      );
      await expect(
        canAccess({ resource_type: 'r', id: 'x' }, 'read')
      ).rejects.toThrow();
    });
  });

  describe('canAccessBulk', () => {
    it('returns [] for empty input without hitting network', async () => {
      const result = await canAccessBulk([]);
      expect(result).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects > 50 checks', async () => {
      const checks = Array.from({ length: 51 }, (_, i) => ({
        resource_type: 'r',
        resource_id: `id${i}`,
        action: 'read',
      }));
      await expect(canAccessBulk(checks)).rejects.toThrow(/at most 50/);
    });

    it('POSTs misses and preserves input order', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResp(200, [decision(true), decision(false), decision(true)])
      );
      const result = await canAccessBulk([
        { resource_type: 'r', resource_id: 'a', action: 'read' },
        { resource_type: 'r', resource_id: 'b', action: 'write' },
        { resource_type: 'r', resource_id: 'c', action: 'delete' },
      ]);
      expect(result).toEqual([true, false, true]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]! as [string, RequestInit];
      expect(url).toContain('/access/v1/check-bulk');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body as string) as { checks: unknown[] };
      expect(body.checks).toHaveLength(3);
    });

    it('serves cache hits inline + only POSTs the misses', async () => {
      // Pre-warm cache for one entry.
      fetchSpy.mockResolvedValueOnce(jsonResp(200, decision(true)));
      await canAccess({ resource_type: 'r', id: 'a' }, 'read');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Now bulk: 1 hit (a/read), 2 misses.
      fetchSpy.mockResolvedValueOnce(
        jsonResp(200, [decision(false), decision(true)])
      );
      const result = await canAccessBulk([
        { resource_type: 'r', resource_id: 'a', action: 'read' },
        { resource_type: 'r', resource_id: 'b', action: 'read' },
        { resource_type: 'r', resource_id: 'c', action: 'read' },
      ]);
      expect(result).toEqual([true, false, true]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [, init] = fetchSpy.mock.calls[1]! as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        checks: { resource_id: string }[];
      };
      expect(body.checks.map((c) => c.resource_id)).toEqual(['b', 'c']);
    });

    it('fails closed (deny) when server returns shorter array than requested', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, [decision(true)]));
      const result = await canAccessBulk([
        { resource_type: 'r', resource_id: 'a', action: 'read' },
        { resource_type: 'r', resource_id: 'b', action: 'read' },
      ]);
      expect(result).toEqual([true, false]);
    });
  });
});
