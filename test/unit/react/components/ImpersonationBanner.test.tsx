// @bainbridgebuilders/universal-auth | test/unit/react/components/ImpersonationBanner.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// A3 gate #9 — renders ONLY when actingAs is set; reads via useImpersonation pub-sub.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { ImpersonationBanner } from '../../../../src/react/components/ImpersonationBanner.js';
import {
  startImpersonation,
  endImpersonation,
  __resetImpersonationForTests,
  type ActingAs,
} from '../../../../src/flows/impersonation.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../../src/core/event-reporter.js';

const SESSION: Session = {
  identity: { identity_id: 'admin1', identity_kind: 'human', display_name: 'Admin Sam' },
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
  personas: [],
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ImpersonationBanner', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetImpersonationForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('renders nothing when no impersonation is active', () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <ImpersonationBanner />
      </AuthProvider>
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders banner with target name after startImpersonation', async () => {
    fetchSpy.mockImplementation((url) => {
      if (String(url).includes('/auth/v1/impersonation/start')) {
        return Promise.resolve(
          jsonResp(200, {
            access_token: 'at',
            refresh_token: 'rt',
            session_id: 'sid2',
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            acting_as: {
              identity_id: 'target1',
              display_name: 'Crew Bob',
              expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            } satisfies ActingAs,
            identity: SESSION.identity,
            aggregate: SESSION.aggregate,
            session_meta: SESSION.session_meta,
          })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    render(
      <AuthProvider initialSession={SESSION}>
        <ImpersonationBanner />
      </AuthProvider>
    );

    await act(async () => {
      await startImpersonation({
        target_identity_id: 'target1',
        reason: 'support',
      });
    });

    await waitFor(() => {
      const banner = screen.getByRole('status');
      expect(banner.textContent).toMatch(/acting as crew bob/i);
    });
  });

  it('disappears after endImpersonation', async () => {
    // Default to a successful generic response for any incidental calls
    // (e.g., onSessionChange-triggered /me fetch after setSession). Then
    // override the impersonation/start to inject acting_as.
    fetchSpy.mockImplementation((url) => {
      if (String(url).includes('/auth/v1/impersonation/start')) {
        return Promise.resolve(
          jsonResp(200, {
            access_token: 'at',
            refresh_token: 'rt',
            session_id: 'sid2',
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            acting_as: {
              identity_id: 'target1',
              display_name: 'Crew Bob',
              expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            } satisfies ActingAs,
            identity: SESSION.identity,
            aggregate: SESSION.aggregate,
            session_meta: SESSION.session_meta,
          })
        );
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });

    render(
      <AuthProvider initialSession={SESSION}>
        <ImpersonationBanner />
      </AuthProvider>
    );

    await act(async () => {
      await startImpersonation({ target_identity_id: 'target1', reason: 'support' });
    });
    await waitFor(() => screen.getByRole('status'));

    await act(async () => {
      await endImpersonation();
    });
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
