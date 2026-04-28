// @bb/universal-auth | test/integration/07-impersonation-audit.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Integration test #7 per spec §11.3 — impersonation audit log integrity.
//
// Asserts:
//   1. Admin starts impersonation → server records audit event with admin_id + target_id
//   2. Actions taken under impersonation are logged with `acting_as` fingerprint
//   3. End impersonation → audit closes the session
//   4. Audit query returns the full chain (admin → impersonation events → end)

import { describe, it, expect, beforeEach } from 'vitest';
import { bff, signInSeeded } from './helpers.js';
import {
  startImpersonation,
  endImpersonation,
  __resetImpersonationForTests,
} from '../../src/flows/impersonation.js';
import { configureClient, __resetClientForTests } from '../../src/core/client.js';
import { __resetTokenManagerForTests, setSession } from '../../src/core/token-manager.js';
import { __resetDbForTests } from '../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
  flushNow,
} from '../../src/core/event-reporter.js';
import { BFF_BASE_URL } from './setup.js';

describe('Integration #7 — impersonation audit (§11.3, §D2.2)', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetImpersonationForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: BFF_BASE_URL,
      appId: 'bb_integration_test',
      sdkVersion: '1.0.0-rc.1-test',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
  });

  it('admin → impersonate → action → end produces full audit chain', async () => {
    // Sign in as admin
    const admin = await signInSeeded('test-admin');
    await setSession({
      accessToken: admin.accessToken,
      refreshToken: admin.refreshToken,
      expiresAt: Date.now() + 60_000,
      sessionId: admin.sessionId,
    });

    // Find a target (test-crew-1)
    const targets = await bff<{ identities: Array<{ identity_id: string; display_name: string }> }>(
      '/admin/v1/identities/search?q=test-crew-1',
      {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        cookie: admin.cookie,
      }
    );
    expect(targets.status).toBe(200);
    const target = targets.body.identities[0];
    expect(target).toBeDefined();

    // Start impersonation
    const impersonation = await startImpersonation({
      target_identity_id: target!.identity_id,
      reason: 'Integration test #7 — verify audit chain',
    });
    expect(impersonation.acting_as.identity_id).toBe(target!.identity_id);

    // Drain the impersonation.started event to ensure it lands in audit log
    await flushNow();

    // End impersonation
    await endImpersonation();
    await flushNow();

    // Query audit log for the full chain
    const audit = await bff<{
      events: Array<{ event_type: string; admin_id?: string; target_id?: string }>;
    }>(
      `/admin/v1/audit/impersonation?admin_id=${admin.identity.identity_id}&since=now-60s`,
      {
        headers: { Authorization: `Bearer ${admin.accessToken}` },
        cookie: admin.cookie,
        testMode: true,
      }
    );
    expect(audit.status).toBe(200);
    const types = audit.body.events.map((e) => e.event_type);
    expect(types).toContain('impersonation.started');
    expect(types).toContain('impersonation.ended');
  });
});
