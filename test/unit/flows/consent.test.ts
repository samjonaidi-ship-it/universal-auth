// @samjonaidi-ship-it/universal-auth | test/unit/flows/consent.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getConsentDocuments,
  bulkAcceptConsents,
  recordConsent,
  revokeConsent,
} from '../../../src/flows/consent.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

const BASE = 'https://ct-bff.test';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('flows/consent (§3.4 + §D2.6)', () => {
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

  it('getConsentDocuments encodes audience query parameter', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { documents: [] }));
    await getConsentDocuments('crew');
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(url).toContain('/identity/v1/consent-documents?audience=crew');
  });

  it('bulkAcceptConsents POSTs the consents array', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
    await bulkAcceptConsents([
      { consent_type: 'privacy_policy', policy_version: '1.0' },
      { consent_type: 'terms_of_service', policy_version: '1.0' },
    ]);
    const call = fetchSpy.mock.calls[0]!;
    expect((call[1] as RequestInit).method).toBe('POST');
    const body = JSON.parse(String((call[1] as RequestInit).body)) as { consents: unknown[] };
    expect(body.consents).toHaveLength(2);
  });

  it('recordConsent posts a single consent', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, {}));
    await recordConsent('marketing_communications', '1.0');
    const call = fetchSpy.mock.calls[0]!;
    expect(String(call[0])).toContain('/identity/v1/consents');
    const body = JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
    expect(body.consent_type).toBe('marketing_communications');
  });

  it('revokeConsent posts to /:id/revoke', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResp(200, {}));
    await revokeConsent('consent-uuid-123');
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('/identity/v1/consents/consent-uuid-123/revoke');
  });
});
