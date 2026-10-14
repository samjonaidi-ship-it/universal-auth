// @samjonaidi-ship-it/universal-auth | test/unit/react/AuthProvider-token-state.test.tsx | v1.0.0 | 2026-10-14 | BB
// rc.22 (AuthProvider v1.1.0) — gaps 2 + 5 from CalExp5 #881:
//   hydrate() used to report 'authenticated' with nothing to tell a consumer
//   that no access token exists. It now tries one mint, then reports
//   tokenState 'cookie_only' honestly, and records the cookie session's id.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { AuthProvider, StatusContext } from '../../../src/react/AuthProvider.js';
import type { Session } from '../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  getSessionScope,
  setSession,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

const BASE = 'https://ct-bff.test.example.com';

function meBody(sessionId: string): Session {
  return {
    identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
    personas: [],
    aggregate: { features: [], app_access: [] },
    session_meta: {
      session_id: sessionId,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function StatusProbe(): ReactNode {
  const ctx = useContext(StatusContext);
  return (
    <div>
      <div data-testid="status">{ctx?.status ?? 'none'}</div>
      <div data-testid="token">{ctx?.tokenState ?? 'missing'}</div>
    </div>
  );
}

describe('AuthProvider — tokenState (rc.22)', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cookie alive, no local token: authenticated + tokenState cookie_only + scoped session id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) return jsonResp(200, meBody('sess-cookie-1'));
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('token').textContent).toBe('cookie_only');
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-cookie-1', source: 'cookie' });
  });

  it('a token session reports tokenState live and keeps its own session id', async () => {
    await setSession({
      accessToken: 'at-live',
      refreshToken: 'rt-live',
      expiresAt: Date.now() + 15 * 60_000,
      sessionId: 'sess-token-1',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) return jsonResp(200, meBody('sess-token-1'));
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('token').textContent).toBe('live');
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-token-1', source: 'token' });
  });
});
