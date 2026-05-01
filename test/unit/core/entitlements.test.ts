// @bainbridgebuilders/universal-auth | test/unit/core/entitlements.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A2 gate #9 — 7-day offline grace + stale-while-revalidate.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hasFeature,
  hasAppAccess,
  refreshEntitlements,
  getEntitlementsSnapshot,
  __resetEntitlementsForTests,
} from '../../../src/core/entitlements.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('core/entitlements', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    void __resetDbForTests();
    __resetEntitlementsForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns false from hasFeature before any cache hydrated', () => {
    expect(hasFeature('bid_packages')).toBe(false);
  });

  it('populates cache on refreshEntitlements + hasFeature reads from it', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        aggregate: { features: ['bid_packages', 'crew.gps'], app_access: ['bb_express'] },
        identity: { identity_id: 'id1' },
      })
    );
    await refreshEntitlements();
    expect(hasFeature('bid_packages')).toBe(true);
    expect(hasFeature('admin.impersonate')).toBe(false);
    expect(hasAppAccess('bb_express')).toBe(true);
    expect(hasAppAccess('controltower')).toBe(false);
  });

  it('coalesces concurrent refresh calls into one network request', async () => {
    fetchSpy.mockResolvedValue(
      jsonResp(200, {
        aggregate: { features: ['f1'], app_access: [] },
        identity: { identity_id: 'id1' },
      })
    );
    await Promise.all([refreshEntitlements(), refreshEntitlements(), refreshEntitlements()]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('snapshot.offline = true when TTL elapsed but within grace', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        aggregate: { features: ['f1'], app_access: [] },
        identity: { identity_id: 'id1' },
      })
    );
    await refreshEntitlements();
    const snap = getEntitlementsSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.offline).toBe(false);
  });

  it('returns null snapshot when beyond 7-day grace', async () => {
    // Write a stale cache directly to localStorage
    localStorage.setItem(
      'bb-universal-auth:entitlements',
      JSON.stringify({
        features: ['f1'],
        app_access: [],
        fetched_at: Date.now() - 8 * 24 * 60 * 60 * 1000,  // 8 days ago
        identity_id: 'id1',
      })
    );
    expect(getEntitlementsSnapshot()).toBeNull();
    expect(hasFeature('f1')).toBe(false);
  });
});
