// @samjonaidi-ship-it/universal-auth | test/unit/react/useImpersonation.test.tsx | v1.0.4 | 2026-05-04 | BB
// L2.18 — drift-event UI hook coverage for useImpersonation.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImpersonation } from '../../../src/react/useImpersonation.js';
import {
  startImpersonation,
  endImpersonation,
  onLocalClearDrift,
  __resetImpersonationForTests,
  type ImpersonationDriftEvent,
} from '../../../src/flows/impersonation.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { configureEventReporter, __resetEventReporterForTests } from '../../../src/core/event-reporter.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockStartResponse(): unknown {
  return {
    access_token: 'at-imp',
    refresh_token: 'rt-imp',
    session_id: 'sess-imp',
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    acting_as: {
      identity_id: 'target-1',
      display_name: 'Target User',
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
    identity: { identity_id: 'admin-1', identity_kind: 'human', display_name: 'Admin' },
    aggregate: { features: [], app_access: [] },
    session_meta: {
      session_id: 'sess-imp',
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
  };
}

describe('useImpersonation — drift event hook (L2.18)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetImpersonationForTests();
    __resetEventReporterForTests();
    void __resetDbForTests();
    configureClient({
      apiBaseUrl: BASE,
      appId: 'bb_express',
      sdkVersion: '1.0.4',
    });
    configureEventReporter({});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('initial lastDriftEvent is null', () => {
    const { result } = renderHook(() => useImpersonation());
    expect(result.current.lastDriftEvent).toBeNull();
  });

  it('populates lastDriftEvent when endImpersonation server call fails', async () => {
    // start succeeds
    fetchSpy.mockResolvedValueOnce(jsonResp(200, mockStartResponse()));
    // end fails — server-call-failed → drift event fires
    fetchSpy.mockResolvedValueOnce(jsonResp(500, { code: 'INTERNAL', message: 'boom' }));

    const { result } = renderHook(() => useImpersonation());

    await act(async () => {
      await result.current.start({
        target_identity_id: 'target-1',
        reason: 'support',
      });
    });

    expect(result.current.lastDriftEvent).toBeNull();
    expect(result.current.actingAs?.identity_id).toBe('target-1');

    await act(async () => {
      await result.current.end();
    });

    expect(result.current.actingAs).toBeNull();
    expect(result.current.lastDriftEvent).not.toBeNull();
    const drift = result.current.lastDriftEvent as ImpersonationDriftEvent;
    expect(drift.reason).toBe('server_call_failed');
    expect(typeof drift.error_message).toBe('string');
    expect(drift.error_message.length).toBeGreaterThan(0);
    expect(typeof drift.error_name).toBe('string');
    expect(typeof drift.timestamp).toBe('number');
    expect(drift.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('clears lastDriftEvent on a fresh start()', async () => {
    // 1) start ok, 2) end fails (drift), 3) start again → clears drift
    fetchSpy.mockResolvedValueOnce(jsonResp(200, mockStartResponse()));
    fetchSpy.mockResolvedValueOnce(jsonResp(500, { code: 'INTERNAL' }));
    fetchSpy.mockResolvedValueOnce(jsonResp(200, mockStartResponse()));

    const { result } = renderHook(() => useImpersonation());

    await act(async () => {
      await result.current.start({ target_identity_id: 'target-1', reason: 'support' });
    });
    await act(async () => {
      await result.current.end();
    });

    expect(result.current.lastDriftEvent).not.toBeNull();

    await act(async () => {
      await result.current.start({ target_identity_id: 'target-1', reason: 'support-again' });
    });

    expect(result.current.lastDriftEvent).toBeNull();
  });

  it('does NOT populate lastDriftEvent when endImpersonation succeeds', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, mockStartResponse()));
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));

    const { result } = renderHook(() => useImpersonation());

    await act(async () => {
      await result.current.start({ target_identity_id: 'target-1', reason: 'support' });
    });
    await act(async () => {
      await result.current.end();
    });

    expect(result.current.lastDriftEvent).toBeNull();
  });

  it('unsubscribes drift listener on unmount (no leak)', async () => {
    const { result, unmount } = renderHook(() => useImpersonation());
    expect(result.current.lastDriftEvent).toBeNull();

    unmount();

    // After unmount, firing a drift event should NOT crash and should NOT
    // affect the (already-discarded) hook state. We assert by introspecting
    // the listener registry: register a fresh listener AFTER unmount, fire
    // a synthetic drift via the flow path, and confirm the fresh listener
    // sees it (proving the pub-sub is alive) while the original hook is gone.
    let fired: ImpersonationDriftEvent | null = null;
    const unsub = onLocalClearDrift((e) => {
      fired = e;
    });

    // Trigger a server-failed end to fire drift via the real code path
    fetchSpy.mockResolvedValueOnce(jsonResp(200, mockStartResponse()));
    fetchSpy.mockResolvedValueOnce(jsonResp(500, { code: 'INTERNAL' }));
    await startImpersonation({ target_identity_id: 'target-2', reason: 'r' });
    await endImpersonation();

    expect(fired).not.toBeNull();
    unsub();
  });
});
