// @samjonaidi-ship-it/universal-auth | test/unit/flows/devices-flow.test.ts | v1.0.0 | 2026-08-10 | BB
// P4.11 — listing devices and signing one out.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { setSession, __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { clearDeviceIdCache } from '../../../src/core/device-id.js';
import { listDevices, revokeDevice } from '../../../src/flows/devices-flow.js';
import { emit } from '../../../src/core/event-reporter.js';

// Wrap `emit` with the REAL implementation so behaviour is unchanged but calls
// are observable — the "emits nothing" assertion below is only meaningful
// against a spy the code under test actually uses.
vi.mock('../../../src/core/event-reporter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/event-reporter.js')>();
  return { ...actual, emit: vi.fn(actual.emit) };
});

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const DEVICES = [
  {
    device_id: 'fam-phone', revocable: true, is_current: true, is_bound: true,
    ip: '10.0.0.1', user_agent: 'iPhone', last_seen_at: '2026-08-10T09:00:00Z',
    expires_at: '2026-11-08T09:00:00Z',
  },
  {
    device_id: 'tok-legacy', revocable: false, is_current: false, is_bound: false,
    ip: '10.0.0.3', user_agent: 'OldLaptop', last_seen_at: '2026-08-01T08:00:00Z',
    expires_at: '2026-10-30T08:00:00Z',
  },
];

const headersOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  (spy.mock.calls[i]![1] as RequestInit).headers as Record<string, string>;
const urlOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) => String(spy.mock.calls[i]![0]);
const bodyOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  JSON.parse(String((spy.mock.calls[i]![1] as RequestInit).body));

describe('P4.11 — devices flow', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    clearDeviceIdCache();
    configureClient({
      apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.1.0-rc.16', useDpop: 'auto',
    });
    await setSession({
      accessToken: 'at-live', refreshToken: 'rt-live',
      expiresAt: Date.now() + 15 * 60_000, sessionId: 's1',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => { fetchSpy.mockRestore(); });

  describe('listDevices', () => {
    it('GETs /auth/v1/devices with the bearer attached', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { devices: DEVICES }));
      const devices = await listDevices();

      expect(urlOf(fetchSpy)).toBe(`${BASE}/auth/v1/devices`);
      expect(headersOf(fetchSpy).Authorization).toBe('Bearer at-live');
      expect(devices).toHaveLength(2);
    });

    it('preserves revocable=false so the UI can withhold a dead button', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { devices: DEVICES }));
      const devices = await listDevices();
      expect(devices.find((d) => d.device_id === 'tok-legacy')!.revocable).toBe(false);
      expect(devices.find((d) => d.device_id === 'fam-phone')!.revocable).toBe(true);
    });

    it('returns [] rather than undefined when the server omits the key', async () => {
      // A screen that maps over the result must not crash on a thin response.
      fetchSpy.mockResolvedValueOnce(jsonResp(200, {}));
      expect(await listDevices()).toEqual([]);
    });

    it('sends NO DPoP proof — listing mints no session', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { devices: [] }));
      await listDevices();
      expect(headersOf(fetchSpy).DPoP).toBeUndefined();
    });
  });

  describe('revokeDevice', () => {
    it('POSTs device_id to the shared revoke endpoint', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await revokeDevice({ deviceId: 'fam-ipad' });

      expect(urlOf(fetchSpy)).toBe(`${BASE}/auth/v1/sessions/revoke`);
      expect(bodyOf(fetchSpy)).toEqual({ device_id: 'fam-ipad' });
      expect(headersOf(fetchSpy).Authorization).toBe('Bearer at-live');
    });

    it('carries an Idempotency-Key — it is a mutation', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await revokeDevice({ deviceId: 'fam-ipad' });
      expect(headersOf(fetchSpy)['Idempotency-Key']).toBeTypeOf('string');
    });

    it('surfaces a typed error when the device is not the caller’s', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(404, {
        code: 'NOT_FOUND', message: 'device not found', protocol_version: 'v1',
      }));
      await expect(revokeDevice({ deviceId: 'someone-elses' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('emits nothing — the BFF already writes session.revoked', async () => {
      // Guards the rule the P4.1 audit settled: the SDK emits only when it
      // owns the whole payload, and never duplicates a server-side event.
      // The module is mocked at the top of this file so `emit` is a real spy;
      // asserting on a locally-constructed vi.fn() would pass vacuously.
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await revokeDevice({ deviceId: 'fam-ipad' });
      expect(vi.mocked(emit)).not.toHaveBeenCalled();
    });
  });
});

// ── P5b (M4) ────────────────────────────────────────────────────────────────
describe('reportDeviceSyncState', () => {
  it('rejects a non-integer or negative count without calling the server', async () => {
    // The count is self-reported; sending nonsense would just store nonsense.
    const { reportDeviceSyncState } = await import('../../../src/flows/devices-flow.js');
    await expect(reportDeviceSyncState(-1)).resolves.toBe(false);
    await expect(reportDeviceSyncState(1.5)).resolves.toBe(false);
    await expect(reportDeviceSyncState(Number.NaN)).resolves.toBe(false);
  });
});
