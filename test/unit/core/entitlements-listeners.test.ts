// @samjonaidi-ship-it/universal-auth | test/unit/core/entitlements-listeners.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2b — coverage for v1.0.1 lookback C4 (onEntitlementsChange pub/sub).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  onEntitlementsChange,
  refreshEntitlements,
  clearEntitlements,
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

function meBody(features: readonly string[] = ['f1'], app_access: readonly string[] = ['bb_express']) {
  return {
    aggregate: { features, app_access },
    identity: { identity_id: 'id1' },
  };
}

describe('core/entitlements — onEntitlementsChange (v1.0.1 C4)', () => {
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

  it('listener fires when entitlements are saved (refreshEntitlements success)', async () => {
    const listener = vi.fn();
    onEntitlementsChange(listener);

    fetchSpy.mockResolvedValueOnce(jsonResp(200, meBody()));
    await refreshEntitlements();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('listener fires when entitlements are cleared', async () => {
    // Seed a cache first so clearEntitlements has something to clear.
    fetchSpy.mockResolvedValueOnce(jsonResp(200, meBody()));
    await refreshEntitlements();

    const listener = vi.fn();
    onEntitlementsChange(listener);

    clearEntitlements();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribed listener is NOT called after unsubscribe', async () => {
    const listener = vi.fn();
    const unsubscribe = onEntitlementsChange(listener);

    unsubscribe();

    fetchSpy.mockResolvedValueOnce(jsonResp(200, meBody()));
    await refreshEntitlements();
    clearEntitlements();

    expect(listener).not.toHaveBeenCalled();
  });

  it('multiple listeners independently subscribe + unsubscribe', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const unsubA = onEntitlementsChange(a);
    onEntitlementsChange(b);
    const unsubC = onEntitlementsChange(c);

    fetchSpy.mockResolvedValueOnce(jsonResp(200, meBody()));
    await refreshEntitlements();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);

    // Drop A and C; B remains subscribed.
    unsubA();
    unsubC();

    clearEntitlements();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('listener that throws does not block other listeners', async () => {
    const bad = vi.fn(() => {
      throw new Error('listener bug');
    });
    const good = vi.fn();
    onEntitlementsChange(bad);
    onEntitlementsChange(good);

    fetchSpy.mockResolvedValueOnce(jsonResp(200, meBody()));
    await refreshEntitlements();

    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
