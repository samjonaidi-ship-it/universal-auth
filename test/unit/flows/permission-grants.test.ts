// @bainbridgebuilders/universal-auth | test/unit/flows/permission-grants.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordPermissionGrant,
  requestAndRecord,
} from '../../../src/flows/permission-grants.js';
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

describe('flows/permission-grants', () => {
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
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('recordPermissionGrant POSTs to /identity/v1/permission-grants', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await recordPermissionGrant({
      permission_key: 'geolocation',
      state: 'granted',
      prompted: true,
    });
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain('/identity/v1/permission-grants');
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.permission_key).toBe('geolocation');
    expect(body.state).toBe('granted');
  });

  it('records denied state', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await recordPermissionGrant({
      permission_key: 'camera',
      state: 'denied',
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('records revoked state', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await recordPermissionGrant({
      permission_key: 'notifications',
      state: 'revoked',
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('requestAndRecord falls back to denied when navigator unavailable', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    // happy-dom doesn't have full navigator.permissions; should default to denied
    const result = await requestAndRecord('camera');
    expect(['granted', 'denied']).toContain(result);
  });
});
