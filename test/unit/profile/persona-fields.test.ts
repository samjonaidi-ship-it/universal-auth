// @bainbridgebuilders/universal-auth | test/unit/profile/persona-fields.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPersonaFieldsRegistry,
  getPersonaRoster,
  __resetPersonaFieldsForTests,
} from '../../../src/profile/persona-fields.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

const REGISTRY = {
  version: 4,
  personas: {
    crew: {
      required: ['display_name', 'persona_extensions.crew.trade'],
      recommended: ['avatar'],
      optional: [],
      fields: {
        'persona_extensions.crew.trade': {
          type: 'select',
          options: ['carpenter', 'electrician'],
        },
      },
    },
    supplier: {
      required: ['display_name'],
      recommended: [],
      optional: [],
      fields: {},
    },
  },
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('profile/persona-fields (1h cache)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetPersonaFieldsForTests();
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

  it('fetches the registry on first call', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY));
    const reg = await getPersonaFieldsRegistry();
    expect(reg.version).toBe(4);
    expect(reg.personas.crew?.required).toContain('display_name');
  });

  it('caches the registry between calls', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY));
    await getPersonaFieldsRegistry();
    await getPersonaFieldsRegistry();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent calls', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY));
    await Promise.all([
      getPersonaFieldsRegistry(),
      getPersonaFieldsRegistry(),
      getPersonaFieldsRegistry(),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('getPersonaRoster returns the roster for a known persona', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY));
    const roster = await getPersonaRoster('crew');
    expect(roster?.required).toContain('display_name');
    expect(roster?.fields['persona_extensions.crew.trade']?.type).toBe('select');
  });

  it('getPersonaRoster returns null for unknown persona', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, REGISTRY));
    expect(await getPersonaRoster('martian')).toBeNull();
  });
});
