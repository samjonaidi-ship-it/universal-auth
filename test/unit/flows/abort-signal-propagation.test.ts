// @samjonaidi-ship-it/universal-auth | test/unit/flows/abort-signal-propagation.test.ts | v1.1.0 | 2026-05-06 | BB
// P1-D — verify `signal?: AbortSignal` is threaded from public flow APIs all
// the way to the underlying `fetch()` call. Each test aborts the controller
// pre-flight, then asserts the SDK function rejects (because the underlying
// fetch sees an aborted signal and throws `AbortError`).
//
// We don't unit-test every code path here — just enough to prove the wiring
// is in place across the public surface. Full happy-path tests live in the
// per-flow test files.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  setSession,
} from '../../../src/core/token-manager.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

import { requestCode, verifyCode } from '../../../src/flows/code-flow.js';
import {
  verifyEnrollmentToken,
  activateEnrollment,
} from '../../../src/flows/enroll-flow.js';
import {
  signOut,
  signOutEverywhere,
  listSessions,
  revokeSession,
} from '../../../src/flows/recovery.js';
import {
  startImpersonation,
  endImpersonation,
  __resetImpersonationForTests,
} from '../../../src/flows/impersonation.js';
import {
  recordPermissionGrant,
  listPermissionGrants,
  revokePermissionGrant,
} from '../../../src/flows/permission-grants.js';
import {
  getConsentDocuments,
  bulkAcceptConsents,
  recordConsent,
  revokeConsent,
  listConsents,
  listAllConsents,
} from '../../../src/flows/consent.js';
import {
  getPersonaRegistry,
  lookupPersona,
  __resetPersonaRegistryForTests,
} from '../../../src/flows/persona-registry-client.js';
import { canAccess, canAccessBulk, __resetAbacForTests } from '../../../src/core/abac.js';
import {
  refreshEntitlements,
  __resetEntitlementsForTests,
} from '../../../src/core/entitlements.js';
import {
  flushSettingsNow,
  updateSettings,
  __resetSettingsSyncForTests,
} from '../../../src/core/settings-sync.js';

const BASE = 'https://ct-bff.test.example.com';

describe('P1-D — AbortSignal propagation through public flow APIs', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetImpersonationForTests();
    __resetPersonaRegistryForTests();
    __resetAbacForTests();
    __resetEntitlementsForTests();
    __resetSettingsSyncForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.1.0-rc.2' });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    // Default: every fetch resolves with empty 200. Tests using aborted
    // signals never reach this — `fetch` throws AbortError synchronously.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(((
      _url: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      // Simulate the browser fetch's contract: if the signal is already
      // aborted, the returned promise rejects with AbortError.
      if (init?.signal?.aborted === true) {
        const e = new Error('The operation was aborted.');
        e.name = 'AbortError';
        return Promise.reject(e);
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }) as typeof fetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function abortedController(): AbortController {
    const c = new AbortController();
    c.abort();
    return c;
  }

  // 1. code-flow.ts ────────────────────────────────────────────────────────

  it('threads AbortSignal through requestCode (P1-D)', async () => {
    const c = abortedController();
    await expect(requestCode({ destination: 'x@y.com' }, { signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through verifyCode (P1-D)', async () => {
    const c = abortedController();
    await expect(
      verifyCode({ code: '123456', destination: 'x@y.com' }, { signal: c.signal }),
    ).rejects.toThrow();
  });

  // 2. enroll-flow.ts ──────────────────────────────────────────────────────

  it('threads AbortSignal through verifyEnrollmentToken (P1-D)', async () => {
    const c = abortedController();
    await expect(verifyEnrollmentToken('tok-1', { signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through activateEnrollment (P1-D)', async () => {
    const c = abortedController();
    await expect(
      activateEnrollment(
        {
          token: 'tok-1',
          method: 'pin',
          credential: { pin: '0000' },
          consents: [],
        },
        { signal: c.signal },
      ),
    ).rejects.toThrow();
  });

  // 3. recovery.ts ─────────────────────────────────────────────────────────

  it('threads AbortSignal through signOut (P1-D) — best-effort revoke aborts', async () => {
    // signOut swallows server errors in finally{}. We can't observe rejection
    // — instead we observe that the server-side fetch was attempted with an
    // aborted signal and the local cleanup still completed.
    const c = abortedController();
    await signOut({ signal: c.signal });
    // Verify the revoke call was attempted with the aborted signal.
    const revokeCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/v1/session/revoke'),
    );
    expect(revokeCall).toBeDefined();
    expect((revokeCall![1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('threads AbortSignal through signOutEverywhere (P1-D)', async () => {
    const c = abortedController();
    await signOutEverywhere({ signal: c.signal });
    const revokeAllCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/v1/session/revoke-all'),
    );
    expect(revokeAllCall).toBeDefined();
    expect((revokeAllCall![1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('threads AbortSignal through listSessions (P1-D)', async () => {
    const c = abortedController();
    await expect(listSessions({ signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through revokeSession (P1-D)', async () => {
    const c = abortedController();
    await expect(revokeSession('sess-1', { signal: c.signal })).rejects.toThrow();
  });

  // 4. impersonation.ts ────────────────────────────────────────────────────

  it('threads AbortSignal through startImpersonation (P1-D)', async () => {
    const c = abortedController();
    await expect(
      startImpersonation(
        { target_identity_id: 'id-1', reason: 'support' },
        { signal: c.signal },
      ),
    ).rejects.toThrow();
  });

  it('threads AbortSignal through endImpersonation (P1-D)', async () => {
    const c = abortedController();
    // endImpersonation swallows server errors. Verify the fetch was made with
    // the aborted signal.
    await endImpersonation({ signal: c.signal });
    const endCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/v1/impersonation/end'),
    );
    expect(endCall).toBeDefined();
    expect((endCall![1] as RequestInit).signal?.aborted).toBe(true);
  });

  // 5. permission-grants.ts ────────────────────────────────────────────────

  it('threads AbortSignal through recordPermissionGrant (P1-D)', async () => {
    const c = abortedController();
    await expect(
      recordPermissionGrant(
        { permission_key: 'notifications', state: 'granted' },
        { signal: c.signal },
      ),
    ).rejects.toThrow();
  });

  it('threads AbortSignal through listPermissionGrants (P1-D)', async () => {
    const c = abortedController();
    await expect(listPermissionGrants(undefined, { signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through revokePermissionGrant (P1-D)', async () => {
    const c = abortedController();
    await expect(
      revokePermissionGrant('grant-1', 'reason', { signal: c.signal }),
    ).rejects.toThrow();
  });

  // 6. consent.ts ──────────────────────────────────────────────────────────

  it('threads AbortSignal through getConsentDocuments (P1-D)', async () => {
    const c = abortedController();
    await expect(getConsentDocuments('crew', { signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through bulkAcceptConsents (P1-D)', async () => {
    const c = abortedController();
    await expect(
      bulkAcceptConsents(
        [{ consent_type: 'tos', policy_version: 'v1' }],
        { signal: c.signal },
      ),
    ).rejects.toThrow();
  });

  it('threads AbortSignal through recordConsent (P1-D)', async () => {
    const c = abortedController();
    await expect(recordConsent('tos', 'v1', { signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through revokeConsent (P1-D)', async () => {
    const c = abortedController();
    await expect(revokeConsent('cid-1', { signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through listConsents (P1-D)', async () => {
    const c = abortedController();
    await expect(listConsents({ signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through listAllConsents (P1-D)', async () => {
    const c = abortedController();
    await expect(listAllConsents({ signal: c.signal })).rejects.toThrow();
  });

  // 7. persona-registry-client.ts ──────────────────────────────────────────

  it('threads AbortSignal through getPersonaRegistry (P1-D)', async () => {
    const c = abortedController();
    await expect(getPersonaRegistry({ signal: c.signal })).rejects.toThrow();
  });

  it('threads AbortSignal through lookupPersona (P1-D)', async () => {
    const c = abortedController();
    await expect(lookupPersona('crew', { signal: c.signal })).rejects.toThrow();
  });

  // 8. core/abac.ts ────────────────────────────────────────────────────────

  it('threads AbortSignal through canAccess (P1-D)', async () => {
    const c = abortedController();
    await expect(
      canAccess({ resource_type: 'job', id: 'j-1' }, 'view', { signal: c.signal }),
    ).rejects.toThrow();
  });

  it('threads AbortSignal through canAccessBulk (P1-D)', async () => {
    const c = abortedController();
    await expect(
      canAccessBulk(
        [{ resource_type: 'job', resource_id: 'j-1', action: 'view' }],
        { signal: c.signal },
      ),
    ).rejects.toThrow();
  });

  // 9. core/entitlements.ts ────────────────────────────────────────────────

  it('threads AbortSignal through refreshEntitlements (P1-D)', async () => {
    const c = abortedController();
    // refreshEntitlements catches AbortError and returns the cached snapshot
    // (or null). Assert the underlying fetch saw the aborted signal.
    await refreshEntitlements({ signal: c.signal });
    const meCall = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/auth/v1/me'));
    expect(meCall).toBeDefined();
    expect((meCall![1] as RequestInit).signal?.aborted).toBe(true);
  });

  // 10. core/settings-sync.ts ──────────────────────────────────────────────

  it('threads AbortSignal through flushSettingsNow / updateSettings (P1-D)', async () => {
    // Need a session for the PUT to be attempted (auth required).
    await setSession({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 60_000,
      sessionId: 's1',
    });
    const c = abortedController();
    updateSettings({ theme: 'dark' }, { signal: c.signal });
    await flushSettingsNow({ signal: c.signal });
    const putCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/identity/v1/settings') &&
        (init as RequestInit | undefined)?.method === 'PUT',
    );
    expect(putCall).toBeDefined();
    expect((putCall![1] as RequestInit).signal?.aborted).toBe(true);
  });
});
