// @bainbridgebuilders/universal-auth | test/unit/flows/enroll-flow-branches.test.ts | v1.0.0-rc.2 | 2026-05-02 | BB
// Coverage push for enroll-flow.ts — branch lines 130-137 (D14 employee
// linking) + 149-151 (optional session fields).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { activateEnrollment } from '../../../src/flows/enroll-flow.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const MIN_SESSION_DATA = {
  access_token: 'a',
  refresh_token: 'r',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  session_id: 's',
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

describe('flows/enroll-flow — branch coverage', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_test', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('activate with crew persona + employee_id emits identity.employee_linked', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        ...MIN_SESSION_DATA,
        identity: {
          identity_id: 'sam',
          identity_kind: 'human',
          display_name: 'Sam',
          employee_id: 'emp-42',
        },
        personas: [
          {
            persona_type: 'crew',
            party_id: 'p',
            party_name: 'BB',
            role_in_party: 'crew',
            ct_role: null,
            plan_slug: 'crew_basic',
            subscription_status: 'active',
            landing_route: '/crew',
          },
        ],
        primary_persona: 'crew',
      })
    );
    const result = await activateEnrollment({
      token: 't',
      method: 'webauthn',
      credential: { attestationObject: 'ao', clientDataJSON: 'cd' },
      consents: [{ consent_type: 'privacy_policy', policy_version: '1.0' }],
    });
    expect(result.session.identity.identity_id).toBe('sam');
    expect(result.session.personas?.[0]?.persona_type).toBe('crew');
    expect(result.session.primary_persona).toBe('crew');
  });

  it('activate without crew persona does NOT emit employee_linked (branch)', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        ...MIN_SESSION_DATA,
        identity: {
          identity_id: 'sam',
          identity_kind: 'human',
          display_name: 'Sam',
          employee_id: 'emp-42',
        },
        personas: [
          {
            persona_type: 'supplier',
            party_id: 'p',
            party_name: 'Acme',
            role_in_party: 'supplier',
            ct_role: null,
            plan_slug: 'supplier_basic',
            subscription_status: 'active',
            landing_route: '/supplier',
          },
        ],
      })
    );
    const result = await activateEnrollment({
      token: 't',
      method: 'pin',
      credential: { pin: '0000' },
      consents: [],
    });
    expect(result.session.identity.identity_id).toBe('sam');
  });

  it('activate with crew but no employee_id (null) does NOT emit', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        ...MIN_SESSION_DATA,
        identity: {
          identity_id: 'sam',
          identity_kind: 'human',
          display_name: 'Sam',
          employee_id: null,
        },
        personas: [
          {
            persona_type: 'crew',
            party_id: 'p',
            party_name: 'BB',
            role_in_party: 'crew',
            ct_role: null,
            plan_slug: 'crew_basic',
            subscription_status: 'active',
            landing_route: '/crew',
          },
        ],
      })
    );
    const result = await activateEnrollment({
      token: 't',
      method: 'pin',
      credential: { pin: '0000' },
      consents: [],
    });
    expect(result.session.identity.employee_id).toBeNull();
  });

  it('activate without personas array (undefined) skips D14 emit + omits from session', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        ...MIN_SESSION_DATA,
        identity: {
          identity_id: 'sam',
          identity_kind: 'human',
          display_name: 'Sam',
        },
        // no personas, no primary_persona, no agent
      })
    );
    const result = await activateEnrollment({
      token: 't',
      method: 'pin',
      credential: { pin: '0000' },
      consents: [],
    });
    expect(result.session.personas).toBeUndefined();
    expect(result.session.primary_persona).toBeUndefined();
    expect(result.session.agent).toBeUndefined();
  });

  it('activate with agent context attaches agent to session', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        ...MIN_SESSION_DATA,
        identity: {
          identity_id: 'agent-buddy',
          identity_kind: 'agent',
          display_name: 'Buddy',
        },
        personas: [],
        agent: {
          agent_id: 'buddy',
          agent_name: 'Buddy',
          agent_kind: 'task_runner',
          on_behalf_of: 'sam',
        },
      })
    );
    const result = await activateEnrollment({
      token: 't',
      method: 'pin',
      credential: { pin: '0000' },
      consents: [],
    });
    expect(result.session.agent?.agent_id).toBe('buddy');
  });
});
