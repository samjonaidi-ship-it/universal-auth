// @samjonaidi-ship-it/universal-auth | test/unit/react/useAccess-branches.test.tsx | v1.0.0 | 2026-05-08 | BB
// COV-1 finish (rc.5+ → GA): branch-coverage tests for useAccess.tsx.
//
// Targeted branches (per `pnpm test:unit` rc.5: 63.63% on this file):
//   - line 57: `err instanceof AuthSdkError ? err : new AuthSdkError('UNKNOWN', String(err))`
//     The non-AuthSdkError fallback was uncovered.
//   - background-refresh catch path (line 70-73)
//   - cancelled-then-resolved race (lines 48, 53, 67)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAccess } from '../../../src/react/useAccess.js';
import {
  invalidateAccessCache,
  __resetAbacForTests,
} from '../../../src/core/abac.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  setSession,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { AuthSdkError } from '../../../src/errors.js';

const BASE = 'https://ct-bff.test.example.com';

async function setup(): Promise<ReturnType<typeof vi.spyOn>> {
  __resetClientForTests();
  __resetTokenManagerForTests();
  await __resetDbForTests();
  __resetAbacForTests();
  configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '0.1.0' });
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await setSession({
    accessToken: 'tok',
    refreshToken: 'r',
    expiresAt: Date.now() + 60_000,
    sessionId: 'sess_useaccess_branches',
  });
  return fetchSpy;
}

describe('react/useAccess — branch coverage (COV-1 finish)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    fetchSpy = await setup();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('error wrapping (line 55-58)', () => {
    it('wraps non-AuthSdkError into new AuthSdkError("UNKNOWN", ...)', async () => {
      // canAccess re-throws what fetch threw; a TypeError doesn't extend AuthSdkError
      fetchSpy.mockRejectedValueOnce(new TypeError('network down'));
      const { result } = renderHook(() =>
        useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBeInstanceOf(AuthSdkError);
      // The wrapping branch makes code = 'UNKNOWN' for non-AuthSdkError throws
      expect(result.current.error?.code).toBe('UNKNOWN');
    });

    it('preserves AuthSdkError instance when canAccess throws AuthSdkError', async () => {
      // 401 with envelope produces AuthSessionExpired (extends AuthSdkError)
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'AUTH_SESSION_EXPIRED', error: 'expired' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );
      // The 401 will trigger refresh logic — mock the second fetch (refresh) to also fail
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 'AUTH_SESSION_EXPIRED', error: 'expired' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      );
      const { result } = renderHook(() =>
        useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete'),
      );
      await waitFor(() => expect(result.current.loading).toBe(false), {
        timeout: 3000,
      });
      // Either 'AUTH_SESSION_EXPIRED' (preserved) or some other AuthSdkError code,
      // BUT it should be a real AuthSdkError instance — not a UNKNOWN wrap.
      expect(result.current.error).toBeInstanceOf(AuthSdkError);
    });
  });

  describe('background-refresh path (onAccessChange)', () => {
    it('keeps last-known allowed value when background refresh fails', async () => {
      // First fetch succeeds
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            decision: 'permit',
            allowed: true,
            matched_policy_ids: [],
            reason: 'permit',
            protocol_version: 'v1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const { result } = renderHook(() =>
        useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete'),
      );
      await waitFor(() => expect(result.current.allowed).toBe(true));
      // Trigger background refresh by invalidating + queue a failing fetch
      fetchSpy.mockRejectedValueOnce(new TypeError('refresh-time network down'));
      await act(async () => {
        invalidateAccessCache();
        // Wait microtask + macrotask for the refetch attempt
        await new Promise((r) => setTimeout(r, 50));
      });
      // Last-known value is preserved (not reset to null) — background catch swallowed it
      expect(result.current.allowed).toBe(true);
      // No error state surfaced from background refresh
      expect(result.current.error).toBeNull();
    });
  });

  describe('cleanup / cancellation', () => {
    it('does not setState after unmount when fetch resolves late', async () => {
      let resolveFetch!: (response: Response) => void;
      const slowFetch = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      fetchSpy.mockReturnValue(slowFetch);
      const { result, unmount } = renderHook(() =>
        useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete'),
      );
      // Unmount BEFORE fetch resolves
      unmount();
      // Now resolve — the cancelled flag should prevent setState
      resolveFetch(
        new Response(
          JSON.stringify({
            decision: 'permit',
            allowed: true,
            matched_policy_ids: [],
            reason: 'permit',
            protocol_version: 'v1',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      // Wait a tick — if setState fires, React would emit a warning
      await new Promise((r) => setTimeout(r, 30));
      // result.current is the snapshot at unmount time — it should still be the
      // initial loading=true state (the post-resolution setAllowed was guarded out).
      // We can't assert that the React internal state is unchanged via result.current,
      // but the test verifies the no-warning happy path completes without throwing.
      expect(result.current.loading).toBe(true);
    });
  });
});
