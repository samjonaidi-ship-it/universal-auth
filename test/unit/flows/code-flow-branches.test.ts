// @samjonaidi-ship-it/universal-auth | test/unit/flows/code-flow-branches.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2 (v1.0.4): branch-coverage push for src/flows/code-flow.ts.
// code-flow.test.ts covers the SMS/numeric happy path. The remaining
// uncovered branches are:
//   - verifyCode response carrying personas / primary_persona / agent
//   - maskDestination email branch (with both halves present)
//   - inferChannel email branch
// All three are reached by running verifyCode against an email destination
// whose response includes the optional persona fields.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestCode, verifyCode } from '../../../src/flows/code-flow.js';
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

describe('flows/code-flow — branch coverage (v1.0.4)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('requestCode with email destination — inferred channel + email-mask path', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await requestCode({ destination: 'someone@example.com' });
    const body = JSON.parse(String((fetchSpy.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown>;
    expect(body.destination).toBe('someone@example.com');
    // No explicit channel passed — server infers
    expect(body.channel).toBeUndefined();
  });

  it('verifyCode with email destination + persona payload populates session optional fields', async () => {
    fetchSpy.mockImplementation((url) => {
      if (String(url).endsWith('/auth/v1/code/verify')) {
        return Promise.resolve(
          jsonResp(200, {
            access_token: 'at-new',
            refresh_token: 'rt-new',
            session_id: 's-new',
            expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            identity: { identity_id: 'id1', identity_kind: 'human', display_name: 'Sam' },
            aggregate: { features: [], app_access: ['bb_express'] },
            session_meta: {
              session_id: 's-new',
              issued_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            },
            personas: [
              { persona_id: 'p1', display_name: 'Foreman', kind: 'staff' },
            ],
            primary_persona: 'p1',
            agent: { agent_id: 'a1', kind: 'human' },
          })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    const { session } = await verifyCode({
      destination: 'sam@bainbridgebuilders.com',
      code: '654321',
    });

    // Optional fields all hydrated when the server includes them
    expect(session.personas).toBeDefined();
    expect(session.personas).toHaveLength(1);
    expect(session.primary_persona).toBe('p1');
    expect(session.agent).toBeDefined();
    expect(session.agent!.agent_id).toBe('a1');
  });

  it('requestCode with short numeric destination uses fallback mask path', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    // length <= 4 triggers the '***' branch in maskDestination
    await expect(requestCode({ destination: '1234' })).resolves.toBeUndefined();
  });
});
