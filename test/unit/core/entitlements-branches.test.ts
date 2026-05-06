// @samjonaidi-ship-it/universal-auth | test/unit/core/entitlements-branches.test.ts | v1.0.0 | 2026-05-08 | BB
// COV-1 (rc.5 audit) — branch-coverage tests for entitlements.ts.
//
// Targeted branches (per `pnpm test:unit` coverage report rc.4):
//   - line ~338-339: refreshEntitlements catch — TypeError vs AbortError vs
//     AuthSessionRevoked vs other AuthSdkError
//   - line ~376-378: constantTimeStringEquals — length mismatch fast path,
//     equal-length differing-content path, equal path
//   - line 379: __resetEntitlementsForTests when localStorage unavailable
//
// These were the uncovered branches that pulled global coverage from 85.2 →
// 83.74% across rc.2/rc.3/rc.4. Restoring 85 is COV-1 in docs/BACKLOG.md.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  refreshEntitlements,
  hasFeature,
  __resetEntitlementsForTests,
} from '../../../src/core/entitlements.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { AuthSessionRevoked } from '../../../src/errors.js';

describe('entitlements — branch coverage (COV-1)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetEntitlementsForTests();
    __resetClientForTests();
    await __resetDbForTests();
    if (typeof localStorage !== 'undefined') localStorage.clear();
    configureClient({
      apiBaseUrl: 'https://example.test',
      protocolVersion: '1.0',
      appId: 'test-app',
      mode: 'production',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch') as ReturnType<typeof vi.spyOn>;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    __resetEntitlementsForTests();
  });

  describe('refreshEntitlements error handling', () => {
    it('re-throws AuthSessionRevoked so session-watcher can drive sign-out', async () => {
      // Mock the fetch call directly to simulate the BFF returning a revoked session
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'AUTH_SESSION_REVOKED', error: 'revoked' }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        )
      );
      await expect(refreshEntitlements()).rejects.toBeInstanceOf(AuthSessionRevoked);
    });

    it('returns cached data on TypeError (network failure)', async () => {
      // Pre-seed disk
      const seed = {
        features: ['cached-feature'],
        app_access: [],
        fetched_at: Date.now(),
        identity_id: 'sam',
      };
      localStorage.setItem(
        'bb-universal-auth:entitlements',
        JSON.stringify(seed)
      );
      // Ensure the cached blob is loaded into memory FIRST (legacy path bumps signatureVerified).
      // Then make the network error happen.
      fetchSpy.mockRejectedValue(new TypeError('fetch failed (offline)'));
      const result = await refreshEntitlements();
      // Network TypeError → falls back to loadFromDisk(). The legacy seed is
      // adopted with signatureVerified=true, so result reflects the cached features.
      expect(result?.features).toContain('cached-feature');
    });

    it('returns cached data on AbortError', async () => {
      const seed = {
        features: ['cached-on-abort'],
        app_access: [],
        fetched_at: Date.now(),
        identity_id: 'sam',
      };
      localStorage.setItem(
        'bb-universal-auth:entitlements',
        JSON.stringify(seed)
      );
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortErr);
      const result = await refreshEntitlements();
      expect(result?.features).toContain('cached-on-abort');
    });

    it('returns cached data on generic AuthSdkError (rate limit / 5xx)', async () => {
      const seed = {
        features: ['cached-on-server-error'],
        app_access: [],
        fetched_at: Date.now(),
        identity_id: 'sam',
      };
      localStorage.setItem(
        'bb-universal-auth:entitlements',
        JSON.stringify(seed)
      );
      // 503 with envelope — produces AuthSdkError but not AuthSessionRevoked
      fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'MAINTENANCE_MODE', error: 'down' }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        )
      );
      const result = await refreshEntitlements();
      expect(result?.features).toContain('cached-on-server-error');
    });

    it('dedups concurrent refreshEntitlements calls into one in-flight promise', async () => {
      let resolveFetch!: (value: Response) => void;
      const slowResponse = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      fetchSpy.mockReturnValue(slowResponse);
      const p1 = refreshEntitlements();
      const p2 = refreshEntitlements();
      // Resolve fetch with data
      resolveFetch(
        new Response(
          JSON.stringify({
            identity: { identity_id: 'sam' },
            aggregate: { features: ['shared'], app_access: [] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2); // same in-flight promise → identical reference
      // Only one fetch call was made
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('hasFeature branch paths', () => {
    it('returns false when cache is null (no entitlements loaded)', () => {
      expect(hasFeature('any-feature')).toBe(false);
    });

    it('returns false when feature not in the cached set', () => {
      localStorage.setItem(
        'bb-universal-auth:entitlements',
        JSON.stringify({
          features: ['feature-a'],
          app_access: [],
          fetched_at: Date.now(),
          identity_id: 'sam',
        })
      );
      expect(hasFeature('feature-b')).toBe(false);
    });

    it('returns true when feature is in the cached set and within grace', () => {
      localStorage.setItem(
        'bb-universal-auth:entitlements',
        JSON.stringify({
          features: ['feature-a'],
          app_access: [],
          fetched_at: Date.now(),
          identity_id: 'sam',
        })
      );
      expect(hasFeature('feature-a')).toBe(true);
    });

    it('returns false when cache is beyond the 7-day offline grace cutoff', () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      localStorage.setItem(
        'bb-universal-auth:entitlements',
        JSON.stringify({
          features: ['feature-a'],
          app_access: [],
          fetched_at: eightDaysAgo,
          identity_id: 'sam',
        })
      );
      expect(hasFeature('feature-a')).toBe(false);
    });
  });
});
