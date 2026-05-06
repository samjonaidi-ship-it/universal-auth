// @samjonaidi-ship-it/universal-auth | test/unit/react/useAccess.test.tsx | v0.1.0 | 2026-05-06 | BB
// L3.3 useAccess + useAccessBulk hooks. Per ABAC_DESIGN_v1.0.md §5.1 + §8.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAccess } from '../../../src/react/useAccess.js';
import { useAccessBulk } from '../../../src/react/useAccessBulk.js';
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
    fetchSpy.mockRestore();
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
    fetchSpy.mockResolvedValue(jsonResp(200, decision(true)));
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
    fetchSpy.mockResolvedValue(jsonResp(200, decision(true)));
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
    fetchSpy.mockRestore();
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
});
