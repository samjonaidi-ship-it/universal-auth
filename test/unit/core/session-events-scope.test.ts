// @samjonaidi-ship-it/universal-auth | test/unit/core/session-events-scope.test.ts | v1.3.0 | 2026-10-14 | BB
// v1.3.0 (session-events v0.4.0, issue #33 items 5 + 6): a family revoke
// naming this session in session_ids clears it; scope 'identity' clears any
// session; a session with no local id asks /me which session it is before it
// clears; the emitted event carries only allowlisted keys.
// v1.2.0 (session-events v0.3.1): a revoke naming a session_id clears a
// session that has no local id yet; a server `stale` key is dropped.
// v1.1.0 (session-events v0.3.0, pre-push review): a revoke naming another
// session_id clears nothing; a stale revoke reopens the stream; a failed
// wipe is reported as wipe_failed: true.
// rc.23 (session-events v0.2.0, issue #32): an SSE `session.revoked` clears
// only the session current when it arrived, and is emitted after the clear,
// with stale: true when a sign-in during the wipe superseded the clear.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../src/core/event-reporter.js', () => ({ emit: vi.fn(async () => {}) }));
vi.mock('../../../src/core/entitlements.js', () => ({ refreshEntitlements: vi.fn(async () => {}) }));
vi.mock('../../../src/core/storage.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/core/storage.js')>();
  return { ...real, clearAllSessionState: vi.fn(real.clearAllSessionState) };
});

import { startSessionEvents, __resetSessionEventsForTests } from '../../../src/core/session-events.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import {
  setSession,
  getCurrentSessionId,
  hasLiveAccessToken,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import * as storage from '../../../src/core/storage.js';
import { emit } from '../../../src/core/event-reporter.js';

class MockEventSource {
  static instances: MockEventSource[] = [];
  readyState = 1;
  private listeners = new Map<string, Set<(ev: MessageEvent) => void>>();
  constructor(public url: string) {
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, l: (ev: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(l);
    this.listeners.set(type, set);
  }
  close(): void {
    this.readyState = 2;
  }
  dispatch(type: string, data: unknown): void {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    this.listeners.get(type)?.forEach((l) => l(ev));
  }
}

const tokens = (id: string) => ({
  accessToken: `at-${id}`,
  refreshToken: `rt-${id}`,
  expiresAt: Date.now() + 15 * 60_000,
  sessionId: id,
});

describe('session-events — revoke is scoped and reported after the clear', () => {
  beforeEach(async () => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
    __resetClientForTests();
    configureClient({ apiBaseUrl: 'https://ct-bff.test', appId: 'bb_test', sdkVersion: '0.1.0-test' });
    __resetTokenManagerForTests();
    __resetSessionEventsForTests();
    await storage.__resetDbForTests();
    vi.mocked(emit).mockClear();
    vi.mocked(storage.clearAllSessionState).mockClear();
  });

  afterEach(() => {
    __resetSessionEventsForTests();
    vi.unstubAllGlobals();
  });

  it('a current-session revoke clears it and is not stale', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke' });

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ reason: 'admin_revoke' }))
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(getCurrentSessionId()).toBeNull();
  });

  it('a sign-in during the wipe keeps its session; the revoke is reported stale, after the clear', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();

    let releaseWipe!: () => void;
    const held = new Promise<void>((r) => {
      releaseWipe = r;
    });
    const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
      '../../../src/core/storage.js'
    );
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      await held;
      await real.clearAllSessionState();
    });

    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke' });
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    expect(vi.mocked(emit).mock.calls.some((c) => c[0] === 'session.revoked')).toBe(false);

    const installing = setSession(tokens('sess-B'));
    releaseWipe();
    await installing;

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ stale: true }))
    );
    expect(getCurrentSessionId()).toBe('sess-B');
    expect(hasLiveAccessToken()).toBe(true);
  });

  it('review: a stale revoke reopens the stream for the session that is current now', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    let releaseWipe!: () => void;
    const held = new Promise<void>((r) => {
      releaseWipe = r;
    });
    const real = await vi.importActual<typeof import('../../../src/core/storage.js')>(
      '../../../src/core/storage.js'
    );
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      await held;
      await real.clearAllSessionState();
    });

    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke' });
    await vi.waitFor(() => expect(storage.clearAllSessionState).toHaveBeenCalled());
    const installing = setSession(tokens('sess-B'));
    releaseWipe();
    await installing;

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ stale: true }))
    );
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1]!.readyState).toBe(1);
  });

  it('review: a revoke that names another session_id clears nothing and keeps the stream', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', {
      reason: 'admin_revoke',
      session_id: 'sess-other-device',
    });

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith(
        'session.revoked',
        expect.objectContaining({ session_id: 'sess-other-device', stale: true })
      )
    );
    expect(storage.clearAllSessionState).not.toHaveBeenCalled();
    expect(getCurrentSessionId()).toBe('sess-A');
    expect(hasLiveAccessToken()).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it('review: a revoke naming this session_id clears it', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke', session_id: 'sess-A' });

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ session_id: 'sess-A' }))
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(getCurrentSessionId()).toBeNull();
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it('review r2: a revoke naming a session_id clears a session with no local id yet', async () => {
    // Refresh-token-only session: /me has not run, so the scope has no id.
    // v1.3.0: the deferred /me fails (the session is revoked), so it fails closed.
    await storage.storeRefreshToken('rt-cookie', Date.now() + 86_400_000);
    stubMe(() => json(401, { code: 'SESSION_REVOKED', message: 'revoked' }));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke', session_id: 'sess-X' });

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ session_id: 'sess-X' }))
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(storage.clearAllSessionState).toHaveBeenCalled();
    expect(await storage.getRefreshToken()).toBeNull();
  });

  it('review r2: a server-sent stale key does not mislabel a revoke that cleared', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke', stale: true, wipe_failed: true });

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ reason: 'admin_revoke' }))
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(payload).not.toHaveProperty('wipe_failed');
    expect(getCurrentSessionId()).toBeNull();
  });

  it('review: a failed IndexedDB wipe is reported as wipe_failed', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    vi.mocked(storage.clearAllSessionState).mockImplementationOnce(async () => {
      throw new Error('idb blocked');
    });

    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke' });

    await vi.waitFor(() =>
      expect(emit).toHaveBeenCalledWith('session.revoked', expect.objectContaining({ wipe_failed: true }))
    );
    const payload = vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];
    expect(payload).not.toHaveProperty('stale');
    expect(getCurrentSessionId()).toBeNull();
    expect(MockEventSource.instances).toHaveLength(1);
  });

  const meBody = (id: string) => ({
    identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
    personas: [],
    aggregate: { features: [], app_access: [] },
    session_meta: { session_id: id, issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() },
  });
  const stubMe = (reply: () => Response) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes('/auth/v1/me')) return reply();
        return new Response('{}', { status: 404 });
      })
    );
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const revokePayload = () => vi.mocked(emit).mock.calls.find((c) => c[0] === 'session.revoked')?.[1];

  it('issue #33 item 5: a family revoke naming this session in session_ids clears it', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', {
      reason: 'family_revoke',
      scope: 'family',
      session_id: 'sess-other',
      session_ids: ['sess-other', 'sess-A'],
    });

    await vi.waitFor(() => expect(revokePayload()).toBeDefined());
    expect(revokePayload()).toMatchObject({ revoke_scope: 'family' });
    expect(revokePayload()).not.toHaveProperty('stale');
    expect(getCurrentSessionId()).toBeNull();
  });

  it('issue #33 item 5: a family revoke that does not name this session keeps it', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', {
      reason: 'family_revoke',
      scope: 'family',
      session_id: 'sess-other',
      session_ids: ['sess-other', 'sess-third'],
    });

    await vi.waitFor(() => expect(revokePayload()).toBeDefined());
    expect(revokePayload()).toMatchObject({ stale: true });
    expect(getCurrentSessionId()).toBe('sess-A');
  });

  it('issue #33 item 5: an identity-scope revoke clears this session whatever id it names', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', {
      reason: 'identity_revoke',
      scope: 'identity',
      session_id: 'sess-other',
    });

    await vi.waitFor(() => expect(revokePayload()).toBeDefined());
    expect(revokePayload()).toMatchObject({ revoke_scope: 'identity' });
    expect(revokePayload()).not.toHaveProperty('stale');
    expect(getCurrentSessionId()).toBeNull();
  });

  it('issue #33 item 5: no local id and /me names another session: kept, stale, stream reopens', async () => {
    await storage.storeRefreshToken('rt-cookie', Date.now() + 86_400_000);
    stubMe(() => json(200, meBody('sess-mine')));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke', session_id: 'sess-X' });

    await vi.waitFor(() => expect(revokePayload()).toBeDefined());
    expect(revokePayload()).toMatchObject({ session_id: 'sess-X', stale: true });
    expect(storage.clearAllSessionState).not.toHaveBeenCalled();
    expect(await storage.getRefreshToken()).not.toBeNull();
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it('issue #33 item 5: no local id and /me names the revoked session: cleared', async () => {
    await storage.storeRefreshToken('rt-cookie', Date.now() + 86_400_000);
    stubMe(() => json(200, meBody('sess-X')));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke', session_id: 'sess-X' });

    await vi.waitFor(() => expect(revokePayload()).toBeDefined());
    expect(revokePayload()).not.toHaveProperty('stale');
    expect(storage.clearAllSessionState).toHaveBeenCalled();
    expect(await storage.getRefreshToken()).toBeNull();
  });

  it('issue #33 item 5: no local id and /me fails: fails closed (cleared)', async () => {
    await storage.storeRefreshToken('rt-cookie', Date.now() + 86_400_000);
    stubMe(() => json(503, { code: 'HTTP_503', message: 'down' }));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', { reason: 'admin_revoke', session_id: 'sess-X' });

    await vi.waitFor(() => expect(revokePayload()).toBeDefined());
    expect(revokePayload()).not.toHaveProperty('stale');
    expect(await storage.getRefreshToken()).toBeNull();
  });

  it('issue #33 item 6: the emitted event carries only allowlisted keys and a safe reason', async () => {
    await setSession(tokens('sess-A'));
    startSessionEvents();
    MockEventSource.instances[0]!.dispatch('session.revoked', {
      reason: 'Admin Revoke <script>',
      identity_id: 'idn-secret',
      session_ids: ['sess-A', 'sess-B'],
      email: 'someone@example.com',
      session_id: 'sess-A',
    });

    await vi.waitFor(() => expect(revokePayload()).toBeDefined());
    const payload = revokePayload() as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['generation', 'reason', 'session_id']);
    expect(payload.reason).toBe('server');
    expect(payload.session_id).toBe('sess-A');
  });
});
