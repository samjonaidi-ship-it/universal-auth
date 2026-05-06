// @samjonaidi-ship-it/universal-auth | test/unit/react/useDelegatedGrants.test.tsx | v0.1.0 | 2026-05-06 | BB
// Coverage for useDelegatedGrants — split arrays, grant/revoke, 60s cache, invalidation.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  useDelegatedGrants,
  __resetDelegatedGrantsCacheForTests,
} from '../../../src/react/useDelegatedGrants.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const GRANT_FROM_ME = {
  id: 'g1',
  grantor_id: 'sam',
  grantee_kind: 'identity' as const,
  grantee_id: 'alice',
  scopes: ['profile:read'],
  resource_match: null,
  effective_from: '2026-05-01T00:00:00Z',
  effective_until: '2026-08-01T00:00:00Z',
  revoked_at: null,
  revoked_by: null,
  revoked_reason: null,
  granted_via: 'user_consent' as const,
  audit_metadata: null,
  created_at: '2026-05-01T00:00:00Z',
};

const GRANT_TO_ME = {
  ...GRANT_FROM_ME,
  id: 'g2',
  grantor_id: 'bob',
  grantee_id: 'sam',
};

const LIST_BODY = {
  grants_from_me: [GRANT_FROM_ME],
  grants_to_me: [GRANT_TO_ME],
  protocol_version: 'v1',
};

function Probe({
  onResult,
}: {
  onResult: (r: ReturnType<typeof useDelegatedGrants>) => void;
}): ReactNode {
  const result = useDelegatedGrants();
  onResult(result);
  return <div data-testid="probe" />;
}

describe('react/useDelegatedGrants', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetDelegatedGrantsCacheForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.5',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResp(200, LIST_BODY));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('splits envelope into grants_from_me + grants_to_me', async () => {
    const captures: Array<ReturnType<typeof useDelegatedGrants>> = [];
    render(<Probe onResult={(r) => captures.push(r)} />);

    await waitFor(() => {
      const last = captures[captures.length - 1]!;
      expect(last.loading).toBe(false);
      expect(last.grants_from_me).toHaveLength(1);
      expect(last.grants_to_me).toHaveLength(1);
    });

    const last = captures[captures.length - 1]!;
    expect(last.grants_from_me[0]!.id).toBe('g1');
    expect(last.grants_to_me[0]!.id).toBe('g2');
  });

  it('grant() POSTs to /identity/v1/delegated-grants and refetches', async () => {
    let captured: ReturnType<typeof useDelegatedGrants> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);

    await waitFor(() => {
      expect((captured as unknown as ReturnType<typeof useDelegatedGrants>).loading).toBe(false);
    });

    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { grant: GRANT_FROM_ME, protocol_version: 'v1' })
    );
    fetchSpy.mockResolvedValueOnce(jsonResp(200, LIST_BODY));

    await act(async () => {
      await (captured as unknown as ReturnType<typeof useDelegatedGrants>).grant({
        grantee_kind: 'identity',
        grantee_id: 'alice',
        granted_via: 'user_consent',
        scopes: ['profile:read'],
      });
    });

    const calls = fetchSpy.mock.calls;
    const postCall = calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === 'POST';
    });
    expect(postCall).toBeDefined();
    expect(String(postCall![0])).toContain('/identity/v1/delegated-grants');
  });

  it('revoke() DELETEs and invalidates cache', async () => {
    let captured: ReturnType<typeof useDelegatedGrants> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);

    await waitFor(() => {
      expect((captured as unknown as ReturnType<typeof useDelegatedGrants>).loading).toBe(false);
    });

    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, { ok: true, protocol_version: 'v1' })
    );
    fetchSpy.mockResolvedValueOnce(jsonResp(200, LIST_BODY));

    await act(async () => {
      await (captured as unknown as ReturnType<typeof useDelegatedGrants>).revoke('g1');
    });

    const deleteCall = fetchSpy.mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === 'DELETE';
    });
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall![0])).toContain('/identity/v1/delegated-grants/g1');
  });

  it('cache hit on repeat call within 60s (no extra fetch)', async () => {
    // First mount → 1 GET
    let captured1: ReturnType<typeof useDelegatedGrants> | null = null;
    const { unmount } = render(
      <Probe onResult={(r) => (captured1 = r)} />
    );
    await waitFor(() => {
      expect((captured1 as unknown as ReturnType<typeof useDelegatedGrants>).loading).toBe(false);
    });
    unmount();

    const callsAfterFirst = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes('/identity/v1/delegated-grants')
    ).length;

    // Second mount within 60s → 0 additional GET (cache hit)
    let captured2: ReturnType<typeof useDelegatedGrants> | null = null;
    render(<Probe onResult={(r) => (captured2 = r)} />);
    await waitFor(() => {
      const last = captured2 as unknown as ReturnType<typeof useDelegatedGrants>;
      expect(last.grants_from_me.length).toBeGreaterThan(0);
    });

    const callsAfterSecond = fetchSpy.mock.calls.filter(
      (c) => String(c[0]).includes('/identity/v1/delegated-grants')
    ).length;
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it('exportJson returns a JSON Blob with both arrays', async () => {
    let captured: ReturnType<typeof useDelegatedGrants> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);
    await waitFor(() => {
      expect((captured as unknown as ReturnType<typeof useDelegatedGrants>).loading).toBe(false);
    });

    const blob = await (captured as unknown as ReturnType<typeof useDelegatedGrants>).exportJson();
    expect(blob.type).toBe('application/json');
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.version).toBe('1.0');
    expect(Array.isArray(parsed.grants_from_me)).toBe(true);
    expect(Array.isArray(parsed.grants_to_me)).toBe(true);
  });
});
