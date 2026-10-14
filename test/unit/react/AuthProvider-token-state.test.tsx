// @samjonaidi-ship-it/universal-auth | test/unit/react/AuthProvider-token-state.test.tsx | v1.8.1 | 2026-10-14 | BB
// v1.8.1 (AuthProvider v1.3.1): a failed corrective /me drops the SSR identity.
// v1.8.0 (AuthProvider v1.3.0, issue #33 item 3): an initialSession for
//   another session than the live token's runs one /me and shows the live
//   identity; the same session id runs no /me.
// v1.7.0 (AuthProvider v1.2.4, Devin round 3): a sign-in that keeps the same
//   session id during hydrate's /me drops the old reply; the new identity stays.
// v1.6.0 (AuthProvider v1.2.3, Devin round 2): a /me whose own token refresh
//   adopted its session still applies when the listener's /me fails.
// v1.5.0 (AuthProvider v1.2.2, Devin PR #34): a sign-out while hydrate's /me
//   is in flight stays signed out; the late reply is dropped.
// v1.4.0 (AuthProvider v1.2.1, pre-push review): hydrate does not apply the
//   old session's /me over a sign-in that landed during the mint.
// v1.3.0 (rc.23, AuthProvider v1.2.0, issue #32): a sign-in during a failed
//   mint reports 'live'; a sign-out during it leaves 'none'; an initialSession
//   does not relabel a live token session; a new initialSession object with
//   the same session id does not re-run the mint.
// rc.22 (AuthProvider v1.1.0) — gaps 2 + 5 from CalExp5 #881:
//   hydrate() used to report 'authenticated' with nothing to tell a consumer
//   that no access token exists. It now tries one mint, then reports
//   tokenState 'cookie_only' honestly, and records the cookie session's id.
// v1.2.0 (pre-push review, PR #31): a /me reply overtaken by a sign-in does
//   not relabel the new session; a terminal mint error is 'cookie_only'; an
//   initialSession with a refresh token mints one.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import { AuthProvider, IdentityContext, StatusContext } from '../../../src/react/AuthProvider.js';
import type { Session } from '../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  __resetTokenManagerForTests,
  clearSession,
  getSessionScope,
  registerRefreshCallback,
  setSession,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests, storeRefreshToken } from '../../../src/core/storage.js';
import { AuthSdkError } from '../../../src/errors.js';

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

function meFor(sessionId: string, name: string): Session {
  const body = meBody(sessionId);
  return { ...body, identity: { ...body.identity, identity_id: name, display_name: name } };
}

function IdentityProbe(): ReactNode {
  const ctx = useContext(IdentityContext);
  return <div data-testid="who">{ctx?.identity?.display_name ?? 'nobody'}</div>;
}

function IdentityHistory({ seen }: { seen: string[] }): ReactNode {
  const ctx = useContext(IdentityContext);
  seen.push(ctx?.identity?.display_name ?? 'nobody');
  return null;
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

  it('Devin round 1: a failing mint (transient) reports refresh_error, not cookie_only', async () => {
    registerRefreshCallback(async () => {
      throw new AuthSdkError('HTTP_503', 'bff down');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) {
          // The client asks for a bearer BEFORE /me (none yet, so /me goes on
          // the cookie). A refresh token appears now, so hydrate's one mint
          // reaches the refresh callback, which fails transiently.
          await storeRefreshToken('rt-orphan', Date.now() + 86_400_000);
          return jsonResp(200, meBody('sess-cookie-2'));
        }
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('token').textContent).toBe('refresh_error');
  });

  it('Devin round 1: going offline then online keeps a cookie-only session signed in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) return jsonResp(200, meBody('sess-cookie-3'));
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('cookie_only'));

    act(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByTestId('status').textContent).not.toBe('anonymous');
  });

  it('Devin round 1: an initialSession with no bearer reports cookie_only and is scoped', async () => {
    render(
      <AuthProvider initialSession={meBody('sess-ssr-1')}>
        <StatusProbe />
      </AuthProvider>
    );
    expect(screen.getByTestId('token').textContent).toBe('cookie_only');
    await waitFor(() =>
      expect(getSessionScope()).toMatchObject({ sessionId: 'sess-ssr-1', source: 'cookie' })
    );
  });

  it('review: a /me reply that a sign-in overtook does not relabel the new session', async () => {
    let meCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me') && ++meCalls > 1) return jsonResp(200, meBody('sess-B'));
        if (url.includes('/auth/v1/me')) {
          // B signs in while the first /me (answering for cookie session A)
          // is in flight. Later /me calls (B's own re-fetch) answer for B.
          await setSession({
            accessToken: 'at-B',
            refreshToken: 'rt-B',
            expiresAt: Date.now() + 15 * 60_000,
            sessionId: 'sess-B',
          });
          return jsonResp(200, meBody('sess-A'));
        }
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-B', source: 'token' });
  });

  it('review: a terminal mint error reports cookie_only, not the retryable refresh_error', async () => {
    registerRefreshCallback(async () => {
      throw new AuthSdkError('AUTH_SESSION_EXPIRED', 'refresh token expired');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) {
          await storeRefreshToken('rt-dead', Date.now() + 86_400_000);
          return jsonResp(200, meBody('sess-cookie-4'));
        }
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
  });

  it('review: an initialSession with a refresh token on this origin mints one (live)', async () => {
    await storeRefreshToken('rt-ssr', Date.now() + 86_400_000);
    registerRefreshCallback(async () => ({
      access_token: 'at-ssr',
      refresh_token: 'rt-ssr-2',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      session_id: 'sess-ssr-2',
    }));

    render(
      <AuthProvider initialSession={meBody('sess-ssr-2')}>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('live'));
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

  it('issue #32: a sign-in during a failed mint reports live and keeps the new session', async () => {
    registerRefreshCallback(async () => {
      // B signs in while the mint for cookie session A is in flight; then
      // A's refresh fails transiently.
      await setSession({
        accessToken: 'at-B',
        refreshToken: 'rt-B',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-B',
      });
      throw new AuthSdkError('HTTP_503', 'bff down');
    });
    let meCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me') && ++meCalls > 1) return jsonResp(200, meBody('sess-B'));
        if (url.includes('/auth/v1/me')) {
          await storeRefreshToken('rt-A', Date.now() + 86_400_000);
          return jsonResp(200, meBody('sess-A'));
        }
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('token').textContent).toBe('live');
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-B', source: 'token' });
  });

  it('issue #32: a sign-out during a failed mint stays signed out (none, not refresh_error)', async () => {
    registerRefreshCallback(async () => {
      await clearSession();
      throw new AuthSdkError('HTTP_503', 'bff down');
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) {
          await storeRefreshToken('rt-A', Date.now() + 86_400_000);
          return jsonResp(200, meBody('sess-A'));
        }
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('none'));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('token').textContent).toBe('none');
    expect(screen.getByTestId('status').textContent).toBe('anonymous');
  });

  it('issue #32: an initialSession does not relabel a live token session', async () => {
    await setSession({
      accessToken: 'at-B',
      refreshToken: 'rt-B',
      expiresAt: Date.now() + 15 * 60_000,
      sessionId: 'sess-B',
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp(404, { error: 'not_stubbed' })));

    render(
      <AuthProvider initialSession={meBody('sess-A')}>
        <StatusProbe />
      </AuthProvider>
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-B', source: 'token' });
  });

  it('issue #32: a new initialSession object with the same session id does not re-run the mint', async () => {
    await storeRefreshToken('rt-ssr', Date.now() + 86_400_000);
    const refresh = vi.fn(async () => {
      throw new AuthSdkError('HTTP_503', 'bff down');
    });
    registerRefreshCallback(refresh);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp(404, { error: 'not_stubbed' })));

    const { rerender } = render(
      <AuthProvider initialSession={meBody('sess-ssr-3')}>
        <StatusProbe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('refresh_error'));
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender(
      <AuthProvider initialSession={meBody('sess-ssr-3')}>
        <StatusProbe />
      </AuthProvider>
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('review: a sign-in during the mint is not overwritten by the old session /me', async () => {
    registerRefreshCallback(async () => {
      // B signs in during A's mint. The listener's /me for B lands first;
      // then A's refresh fails and the hydrate resumes with A's /me reply.
      await setSession({
        accessToken: 'at-B',
        refreshToken: 'rt-B',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 'sess-B',
      });
      await new Promise((r) => setTimeout(r, 30));
      throw new AuthSdkError('HTTP_503', 'bff down');
    });
    let meCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me') && ++meCalls > 1) return jsonResp(200, meFor('sess-B', 'bob'));
        if (url.includes('/auth/v1/me')) {
          await storeRefreshToken('rt-A', Date.now() + 86_400_000);
          return jsonResp(200, meFor('sess-A', 'alice'));
        }
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
        <IdentityProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('bob'));
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.getByTestId('who').textContent).toBe('bob');
    expect(screen.getByTestId('token').textContent).toBe('live');
  });

  it('Devin PR #34: a sign-out during the hydrate /me is not undone by its late reply', async () => {
    let meCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me') && ++meCalls === 1) {
          await clearSession(); // the user signs out while /me is in flight
          return jsonResp(200, meFor('sess-A', 'alice'));
        }
        if (url.includes('/auth/v1/me')) {
          return jsonResp(401, { code: 'AUTH_SESSION_EXPIRED', message: 'signed out' });
        }
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
        <IdentityProbe />
      </AuthProvider>
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByTestId('who').textContent).toBe('nobody');
    expect(screen.getByTestId('status').textContent).not.toBe('authenticated');
    expect(getSessionScope().sessionId).toBeNull();
  });

  it('Devin round 2: a /me whose own refresh adopted its session still applies', async () => {
    await storeRefreshToken('rt-A', Date.now() + 86_400_000);
    registerRefreshCallback(async () => ({
      access_token: 'at-A',
      refresh_token: 'rt-A-2',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      session_id: 'sess-A',
    }));
    let meCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        // The refresh notifies first, so the listener's /me is call 1: it
        // fails. Hydrate's own /me (call 2) succeeds.
        if (url.includes('/auth/v1/me') && ++meCalls === 1) throw new TypeError('network down');
        if (url.includes('/auth/v1/me')) return jsonResp(200, meFor('sess-A', 'alice'));
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
        <IdentityProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('alice'));
    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(meCalls).toBeGreaterThan(1);
  });
  it('Devin round 3: a same-id sign-in during the hydrate /me keeps the new identity', async () => {
    let meCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me') && ++meCalls === 1) {
          // A sign-in replaces the session but keeps its id. Its listener's
          // /me (call 2) lands first; then the old reply comes back.
          await setSession({
            accessToken: 'at-A2',
            refreshToken: 'rt-A2',
            expiresAt: Date.now() + 15 * 60_000,
            sessionId: 'sess-A',
          });
          await new Promise((r) => setTimeout(r, 40));
          return jsonResp(200, meFor('sess-A', 'alice'));
        }
        if (url.includes('/auth/v1/me')) return jsonResp(200, meFor('sess-A', 'carol'));
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
        <IdentityProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('carol'));
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByTestId('who').textContent).toBe('carol');
    expect(meCalls).toBeGreaterThanOrEqual(2);
  });

  it('issue #33 item 3: an initialSession for another session shows the live session identity', async () => {
    await setSession({
      accessToken: 'at-B',
      refreshToken: 'rt-B',
      expiresAt: Date.now() + 15 * 60_000,
      sessionId: 'sess-B',
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('/auth/v1/me')) return jsonResp(200, meFor('sess-B', 'bob'));
      return jsonResp(404, { error: 'not_stubbed' });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider initialSession={meFor('sess-A', 'alice')}>
        <StatusProbe />
        <IdentityProbe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('bob'));
    expect(screen.getByTestId('token').textContent).toBe('live');
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-B', source: 'token' });
  });

  it('issue #33 item 3: a failed corrective /me drops the other session identity', async () => {
    await setSession({
      accessToken: 'at-B',
      refreshToken: 'rt-B',
      expiresAt: Date.now() + 15 * 60_000,
      sessionId: 'sess-B',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) return jsonResp(403, { code: 'FORBIDDEN', message: 'no' });
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider initialSession={meFor('sess-A', 'alice')}>
        <StatusProbe />
        <IdentityProbe />
      </AuthProvider>
    );

    // alice is sess-A's identity; requests carry sess-B's token. Never both.
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('nobody'));
    expect(screen.getByTestId('status').textContent).toBe('loading');
    expect(screen.getByTestId('token').textContent).toBe('live');
  });

  it('issue #33 item 3: an initialSession for the live session runs no /me', async () => {
    await setSession({
      accessToken: 'at-A',
      refreshToken: 'rt-A',
      expiresAt: Date.now() + 15 * 60_000,
      sessionId: 'sess-A',
    });
    const fetchMock = vi.fn(async () => jsonResp(200, meFor('sess-A', 'other')));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider initialSession={meFor('sess-A', 'alice')}>
        <IdentityProbe />
      </AuthProvider>
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByTestId('who').textContent).toBe('alice');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issue #33 item 3: a sign-out during the corrective /me drops its reply', async () => {
    await setSession({
      accessToken: 'at-B',
      refreshToken: 'rt-B',
      expiresAt: Date.now() + 15 * 60_000,
      sessionId: 'sess-B',
    });
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) {
          await clearSession();
          // The sign-out settles (listener ran) before the reply lands.
          await new Promise((r) => setTimeout(r, 40));
          return jsonResp(200, meFor('sess-B', 'bob'));
        }
        return jsonResp(404, { error: 'not_stubbed' });
      })
    );

    render(
      <AuthProvider initialSession={meFor('sess-A', 'alice')}>
        <StatusProbe />
        <IdentityProbe />
        <IdentityHistory seen={seen} />
      </AuthProvider>
    );
    await new Promise((r) => setTimeout(r, 100));

    // A late session_cleared broadcast also lands, so check every render.
    expect(seen).not.toContain('bob');
    expect(screen.getByTestId('who').textContent).toBe('nobody');
    expect(screen.getByTestId('status').textContent).toBe('anonymous');
  });
});
