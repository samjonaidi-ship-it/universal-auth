// @bainbridgebuilders/universal-auth | test/unit/flows/enroll-flow.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A2 gate #10 — enrollment flow integration (verify → activate).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  verifyEnrollmentToken,
  activateEnrollment,
  parseEnrollmentTokenFromUrl,
} from '../../../src/flows/enroll-flow.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  hasLiveAccessToken,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
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

describe('flows/enroll-flow', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    void __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('parseEnrollmentTokenFromUrl', () => {
    it('extracts token from URL fragment', () => {
      expect(
        parseEnrollmentTokenFromUrl('https://express.bb.com/enroll#abc-token-123')
      ).toBe('abc-token-123');
    });

    it('returns null when no fragment', () => {
      expect(parseEnrollmentTokenFromUrl('https://express.bb.com/enroll')).toBeNull();
    });

    it('returns null on empty fragment', () => {
      expect(parseEnrollmentTokenFromUrl('https://express.bb.com/enroll#')).toBeNull();
    });
  });

  it('verifyEnrollmentToken uses POST (D3 — defeats Safe Links)', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        identity: {
          id: 'id1',
          display_name: 'Crew Sam',
          email_masked: 's***@bb.com',
          persona_type: 'crew',
          consent_documents_required: [],
        },
        invite: { expires_at: '2026-05-01T00:00:00Z', dispatched_to: '+1...' },
      })
    );
    await verifyEnrollmentToken('tok-xyz');

    const call = fetchSpy.mock.calls[0]!;
    expect((call[1] as RequestInit).method).toBe('POST');
    expect(String(call[0])).toContain('/auth/v1/enroll/verify/tok-xyz');
  });

  it('activateEnrollment installs the session', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResp(200, {
        access_token: 'at',
        refresh_token: 'rt',
        session_id: 'sid',
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        identity: {
          identity_id: 'id1',
          identity_kind: 'human',
          display_name: 'Crew Sam',
          employee_id: 'emp-42',  // D14
        },
        aggregate: { features: ['crew.timesheet'], app_access: ['bb_express'] },
        session_meta: {
          session_id: 'sid',
          issued_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        },
        personas: [
          {
            persona_type: 'crew',
            party_id: 'bb_inc',
            party_name: 'Bainbridge Builders',
            role_in_party: 'crew_member',
            ct_role: null,
            plan_slug: 'crew_basic',
            subscription_status: 'active',
            landing_route: '/crew',
          },
        ],
      })
    );

    const { session } = await activateEnrollment({
      token: 'tok-xyz',
      method: 'webauthn',
      credential: { attestationObject: 'ao', clientDataJSON: 'cd' },
      consents: [
        { consent_type: 'privacy_policy', policy_version: '1.0' },
        { consent_type: 'terms_of_service', policy_version: '1.0' },
      ],
    });

    expect(session.identity.identity_id).toBe('id1');
    expect(session.identity.employee_id).toBe('emp-42');
    expect(hasLiveAccessToken()).toBe(true);
  });
});
