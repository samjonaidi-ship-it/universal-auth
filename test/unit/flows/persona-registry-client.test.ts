// @bainbridgebuilders/universal-auth | test/unit/flows/persona-registry-client.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPersonaRegistry,
  lookupPersona,
  __resetPersonaRegistryForTests,
} from '../../../src/flows/persona-registry-client.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const REGISTRY_RESPONSE = {
  version: 7,
  entries: [
    {
      persona_type: 'crew',
      display_name: 'Crew',
      description: 'Field crew',
      landing_route: '/crew',
      required_consents: ['privacy_policy'],
      consent_audience: 'crew',
      order: 1,
      active: true,
    },
    {
      persona_type: 'admin',
      display_name: 'Administrator',
      description: 'BB admin',
      landing_route: '/admin',
      required_consents: [],
      consent_audience: 'admin',
      order: 99,
      active: true,
    },
  ],
};

describe('flows/persona-registry-client (§D2.6 — 1h cache)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetPersonaRegistryForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches registry on first call', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY_RESPONSE));
    const reg = await getPersonaRegistry();
    expect(reg.version).toBe(7);
    expect(reg.entries).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('serves second call from cache (no network)', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY_RESPONSE));
    await getPersonaRegistry();
    await getPersonaRegistry();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent calls into one fetch', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY_RESPONSE));
    await Promise.all([
      getPersonaRegistry(),
      getPersonaRegistry(),
      getPersonaRegistry(),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('lookupPersona returns the matching entry', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY_RESPONSE));
    const crew = await lookupPersona('crew');
    expect(crew?.persona_type).toBe('crew');
    expect(crew?.landing_route).toBe('/crew');
  });

  it('lookupPersona returns null for unknown persona_type', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY_RESPONSE));
    const martian = await lookupPersona('martian');
    expect(martian).toBeNull();
  });
});
