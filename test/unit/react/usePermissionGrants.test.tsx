// @bainbridgebuilders/universal-auth | test/unit/react/usePermissionGrants.test.tsx | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { usePermissionGrants } from '../../../src/react/usePermissionGrants.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
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

function Probe({
  onResult,
}: {
  onResult: (r: ReturnType<typeof usePermissionGrants>) => void;
}): ReactNode {
  const result = usePermissionGrants();
  onResult(result);
  return <div data-testid="probe" />;
}

describe('react/usePermissionGrants', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResp(200, { ok: true }));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('exposes record + requestAndRecord', () => {
    let captured: ReturnType<typeof usePermissionGrants> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);
    const r = captured as unknown as ReturnType<typeof usePermissionGrants>;
    expect(typeof r.record).toBe('function');
    expect(typeof r.requestAndRecord).toBe('function');
  });

  it('record posts to /identity/v1/permission-grants', async () => {
    let captured: ReturnType<typeof usePermissionGrants> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);
    const r = captured as unknown as ReturnType<typeof usePermissionGrants>;
    await r.record({ permission_key: 'geolocation', state: 'granted' });
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain('/identity/v1/permission-grants');
  });
});
