// @samjonaidi-ship-it/universal-auth | test/unit/react/useAccess.test.tsx | v0.1.1 | 2026-10-26 | BB
// L3.3 useAccess + useAccessBulk hooks. Per ABAC_DESIGN_v1.0.md §5.1 + §8.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAccess } from '../../../src/react/useAccess.js';
import { useAccessBulk } from '../../../src/react/useAccessBulk.js';
import * as abac from '../../../src/core/abac.js';
import { AuthSdkError } from '../../../src/errors.js';
import {
  invalidateAccessCache,
  __resetAbacForTests,
  type AccessDecision,
} from '../../../src/core/abac.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  setSession,
} from '../../../src/core/token-manager.js';
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
    matched_policy_ids: [],
    reason: allowed ? 'permit' : 'deny',
    protocol_version: 'v1',
  };
}

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
    sessionId: 'sess_react_1',
  });
  return fetchSpy;
}

describe('react/useAccess', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    fetchSpy = await setup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null + loading=true initially, then allowed=true after fetch', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, decision(true)));
    const { result } = renderHook(() =>
      useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete')
    );
    expect(result.current.allowed).toBeNull();
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allowed).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('stale-while-revalidate: hits cache instantly on second mount', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, decision(true)));
    const first = renderHook(() =>
      useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete')
    );
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    const second = renderHook(() =>
      useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete')
    );
    await waitFor(() => expect(second.result.current.allowed).toBe(true));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces error on server failure', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(500, { error: { code: 'HTTP_500', message: 'boom' } })
    );
    const { result } = renderHook(() =>
      useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).not.toBeNull();
    expect(result.current.allowed).toBeNull();
  });

  it('does not infinite-loop when resource descriptor is a fresh object on every render', async () => {
    fetchSpy.mockImplementation(async () => jsonResp(200, decision(true)));
    const { rerender } = renderHook(
      ({ id }: { id: string }) =>
        useAccess({ resource_type: 'receipt', id }, 'delete'),
      { initialProps: { id: 'r1' } }
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    rerender({ id: 'r1' });
    rerender({ id: 'r1' });
    rerender({ id: 'r1' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after invalidateAccessCache fires', async () => {
    fetchSpy.mockImplementation(async () => jsonResp(200, decision(true)));
    const { result } = renderHook(() =>
      useAccess({ resource_type: 'receipt', id: 'r1' }, 'delete')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      invalidateAccessCache();
    });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });
});

describe('react/useAccessBulk', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    fetchSpy = await setup();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ordered allowed[] after one bulk POST', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, [decision(true), decision(false)])
    );
    const { result } = renderHook(() =>
      useAccessBulk([
        { resource_type: 'r', resource_id: 'a', action: 'read' },
        { resource_type: 'r', resource_id: 'b', action: 'write' },
      ])
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allowed).toEqual([true, false]);
    expect(result.current.error).toBeNull();
  });

  it('handles empty input without network', async () => {
    const { result } = renderHook(() => useAccessBulk([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.allowed).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  const checks = [{ resource_type: 'receipt', resource_id: 'a', action: 'read' }];

  it.each([new AuthSdkError('DENIED', 'denied'), new Error('network failed'), 'offline'])(
    'surfaces a failed bulk check without allowing access: %s', async (failure) => {
      vi.spyOn(abac, 'canAccessBulk').mockRejectedValue(failure);
      const { result } = renderHook(() => useAccessBulk(checks));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.allowed).toBeNull();
      expect(result.current.error).toBeInstanceOf(AuthSdkError);
      if (failure instanceof AuthSdkError) expect(result.current.error).toBe(failure);
      else {
        expect(result.current.error?.code).toBe('UNKNOWN');
        expect(result.current.error?.message).toBe(String(failure));
      }
    }
  );

  it.each(['resolve', 'reject'] as const)('ignores an obsolete initial request after %s', async (settlement) => {
    let resolveOld!: (value: boolean[]) => void;
    let rejectOld!: (reason: unknown) => void;
    const old = new Promise<boolean[]>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const bulk = vi.spyOn(abac, 'canAccessBulk').mockReturnValueOnce(old).mockResolvedValue([false]);
    const { result, rerender } = renderHook(({ id }) => useAccessBulk([{ ...checks[0], resource_id: id }]), {
      initialProps: { id: 'old' },
    });
    rerender({ id: 'new' });
    await waitFor(() => expect(result.current.allowed).toEqual([false]));
    await act(async () => {
      if (settlement === 'resolve') resolveOld([true]);
      else rejectOld(new Error('obsolete request failed'));
    });
    expect(result.current.allowed).toEqual([false]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(bulk).toHaveBeenCalledTimes(2);
  });

  it('keeps the last decision after a failed background refresh and accepts the next successful one', async () => {
    const bulk = vi.spyOn(abac, 'canAccessBulk').mockResolvedValue([true]);
    const { result } = renderHook(() => useAccessBulk(checks));
    await waitFor(() => expect(result.current.allowed).toEqual([true]));
    bulk.mockRejectedValueOnce(new Error('background offline'));
    await act(async () => { invalidateAccessCache(); });
    expect(result.current.allowed).toEqual([true]);
    expect(result.current.error).toBeNull();
    bulk.mockResolvedValueOnce([false]);
    await act(async () => { invalidateAccessCache(); });
    await waitFor(() => expect(result.current.allowed).toEqual([false]));
    expect(result.current.loading).toBe(false);
  });

  it('ignores a background refresh from a previous input and does not refetch identical input', async () => {
    let resolveBackground!: (value: boolean[]) => void;
    const background = new Promise<boolean[]>((resolve) => { resolveBackground = resolve; });
    const bulk = vi.spyOn(abac, 'canAccessBulk').mockResolvedValueOnce([true]);
    const { result, rerender } = renderHook(({ id }) => useAccessBulk([{ ...checks[0], resource_id: id }]), {
      initialProps: { id: 'old' },
    });
    await waitFor(() => expect(result.current.allowed).toEqual([true]));
    rerender({ id: 'old' });
    expect(bulk).toHaveBeenCalledTimes(1);
    bulk.mockReturnValueOnce(background);
    await act(async () => { invalidateAccessCache(); });
    bulk.mockResolvedValueOnce([false]);
    rerender({ id: 'new' });
    await waitFor(() => expect(result.current.allowed).toEqual([false]));
    await act(async () => { resolveBackground([true]); });
    expect(result.current.allowed).toEqual([false]);
    expect(result.current.error).toBeNull();
    expect(bulk).toHaveBeenCalledTimes(3);
  });
});
