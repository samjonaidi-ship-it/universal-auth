// @bb/universal-auth | test/unit/imperative/getAuth.test.ts | v1.0.0-rc.3 | 2026-04-29 | BB
// rc.3: imperative AuthClient is no longer a stub. These tests validate
// the real surface — getSession returns a snapshot (not null), onSessionChange
// receives snapshot updates, signIn delegates to requestCode, signOut delegates
// to recovery flow. Network-touching paths are mocked at the flow level.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAuth,
  __resetGetAuthForTests,
} from '../../../src/imperative/getAuth.js';

// ── Module mocks ──────────────────────────────────────────────────────
// We mock the flow modules so signIn/verify/signOut don't need a live BFF.

vi.mock('../../../src/flows/code-flow.js', () => ({
  requestCode: vi.fn(async () => undefined),
  verifyCode: vi.fn(async () => ({ access_token: 'fake.jwt', session_id: 'sess-1' })),
}));
vi.mock('../../../src/flows/recovery.js', () => ({
  signOut: vi.fn(async () => undefined),
}));

describe('imperative/getAuth — rc.3 real client', () => {
  beforeEach(() => {
    __resetGetAuthForTests();
    vi.clearAllMocks();
  });

  it('exposes the canonical method surface', () => {
    const auth = getAuth();
    expect(typeof auth.signIn).toBe('function');
    expect(typeof auth.verify).toBe('function');
    expect(typeof auth.getSession).toBe('function');
    expect(typeof auth.getAccessToken).toBe('function');
    expect(typeof auth.onSessionChange).toBe('function');
    expect(typeof auth.signOut).toBe('function');
  });

  it('returns the same singleton on repeated calls', () => {
    const a = getAuth();
    const b = getAuth();
    expect(a).toBe(b);
  });

  it('getSession returns the anonymous snapshot when no session is set', () => {
    const snapshot = getAuth().getSession();
    expect(snapshot).toEqual({
      session_id: null,
      is_authenticated: false,
    });
  });

  it('getAccessToken returns null when no session exists', async () => {
    const token = await getAuth().getAccessToken();
    expect(token).toBeNull();
  });

  it('signIn delegates to requestCode with destination + optional channel', async () => {
    const { requestCode } = await import('../../../src/flows/code-flow.js');
    await getAuth().signIn({ destination: '+15555550100', channel: 'sms' });
    expect(requestCode).toHaveBeenCalledWith({ destination: '+15555550100', channel: 'sms' });

    await getAuth().signIn({ destination: 'crew@bb.test' });
    // omits channel when undefined (exactOptionalPropertyTypes)
    expect(requestCode).toHaveBeenLastCalledWith({ destination: 'crew@bb.test' });
  });

  it('verify delegates to verifyCode with destination + code', async () => {
    const { verifyCode } = await import('../../../src/flows/code-flow.js');
    const r = await getAuth().verify({ destination: 'crew@bb.test', code: '123456' });
    expect(verifyCode).toHaveBeenCalledWith({ destination: 'crew@bb.test', code: '123456' });
    expect(r).toEqual({ access_token: 'fake.jwt', session_id: 'sess-1' });
  });

  it('signOut delegates to recovery.signOut and resolves', async () => {
    const recovery = await import('../../../src/flows/recovery.js');
    await expect(getAuth().signOut()).resolves.toBeUndefined();
    expect(recovery.signOut).toHaveBeenCalledTimes(1);
  });

  it('onSessionChange returns an unsubscribe function', () => {
    const unsubscribe = getAuth().onSessionChange(() => undefined);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
