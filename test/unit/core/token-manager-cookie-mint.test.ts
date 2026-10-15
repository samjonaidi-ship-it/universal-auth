// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-cookie-mint.test.ts | v1.2.0 | 2026-10-15 | BB
// v1.2.0 (Devin on PR #42): a mint naming another session moves the scope and
//   hands this caller null.
// rc.27 (COOKIE_BEARER_MINT_SPEC §5) — token-manager half of the cookie mint:
//   a cookie session with no refresh token mints, once, under the refresh lock;
//   a refusal reports no_refresh_token and is not retried in that generation;
//   a 429 blocks for retry_after; a sign-in / sign-out during the mint wins;
//   a bad body and a throw are marked isCookieMintFailure; off = no mint.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setSession,
  clearSession,
  getAccessToken,
  getSessionScope,
  hasLiveAccessToken,
  isCookieMintFailure,
  noteCookieSession,
  onSessionChange,
  onTokenUnavailable,
  registerMintCallback,
  registerRefreshCallback,
  type MintResponse,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

function minted(id = 'sess-cookie-1', token = 'at-minted'): MintResponse {
  return {
    access_token: token,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    session_id: id,
  };
}

describe('token-manager — rc.27 cookie mint', () => {
  beforeEach(async () => {
    __resetTokenManagerForTests();
    await __resetDbForTests();
    if (typeof localStorage !== 'undefined') localStorage.clear();
    registerRefreshCallback(async () => {
      throw new Error('refresh must not run without a refresh token');
    });
  });

  it('a cookie session with no refresh token mints, stores the token and notifies listeners', async () => {
    const mint = vi.fn(async () => minted());
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');
    const listener = vi.fn();
    onSessionChange(listener);

    expect(await getAccessToken()).toBe('at-minted');
    expect(mint).toHaveBeenCalledTimes(1);
    expect(hasLiveAccessToken()).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-cookie-1', source: 'cookie' });

    // Cached: a second read does not mint again.
    expect(await getAccessToken()).toBe('at-minted');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers share one mint (single-flight)', async () => {
    let release!: (v: MintResponse) => void;
    const mint = vi.fn(() => new Promise<MintResponse>((r) => { release = r; }));
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');

    const a = getAccessToken();
    const b = getAccessToken();
    const c = getAccessToken();
    await vi.waitFor(() => expect(mint).toHaveBeenCalledTimes(1));
    release(minted());
    expect(await Promise.all([a, b, c])).toEqual(['at-minted', 'at-minted', 'at-minted']);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('a session not learned from the cookie is never minted for', async () => {
    const mint = vi.fn(async () => minted());
    registerMintCallback(mint);
    // No cookie note at all: source is null.
    expect(await getAccessToken()).toBeNull();
    expect(mint).not.toHaveBeenCalled();
  });

  it('with no mint callback (flag off) it reports no_refresh_token and does not mint', async () => {
    registerMintCallback(null);
    noteCookieSession('sess-cookie-1');
    const seen = vi.fn();
    onTokenUnavailable(seen);
    expect(await getAccessToken()).toBeNull();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ reason: 'no_refresh_token' });
  });

  it('a refusal (null) reports no_refresh_token once and is not retried in the same generation', async () => {
    const mint = vi.fn(async (): Promise<MintResponse | null> => null);
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');
    const seen = vi.fn();
    onTokenUnavailable(seen);
    const listener = vi.fn();
    onSessionChange(listener);

    expect(await getAccessToken()).toBeNull();
    expect(await getAccessToken()).toBeNull();
    expect(mint).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ reason: 'no_refresh_token', source: 'cookie' });
    // A refusal must not mark the cookie session anonymous.
    expect(listener).not.toHaveBeenCalled();

    // A new cookie session (new generation) may mint again.
    mint.mockResolvedValueOnce(minted('sess-cookie-2', 'at-2'));
    noteCookieSession('sess-cookie-2');
    expect(await getAccessToken()).toBe('at-2');
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('a throw is marked isCookieMintFailure and the next call tries again', async () => {
    const boom = new Error('network down');
    const mint = vi.fn(async (): Promise<MintResponse | null> => { throw boom; });
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');

    const err = await getAccessToken().catch((e: unknown) => e);
    expect(err).toBe(boom);
    expect(isCookieMintFailure(err)).toBe(true);
    expect(isCookieMintFailure(new Error('other'))).toBe(false);

    mint.mockResolvedValueOnce(minted());
    expect(await getAccessToken()).toBe('at-minted');
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('a 429 with retryAfterSeconds blocks further mints until it passes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const limited = Object.assign(new Error('rate limited'), { retryAfterSeconds: 60 });
      const mint = vi.fn(async (): Promise<MintResponse | null> => { throw limited; });
      registerMintCallback(mint);
      noteCookieSession('sess-cookie-1');

      expect(await getAccessToken().catch((e: unknown) => e)).toBe(limited);
      const again = await getAccessToken().catch((e: unknown) => e);
      expect(again).toBe(limited);
      expect(isCookieMintFailure(again)).toBe(true);
      expect(mint).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 61_000);
      mint.mockResolvedValueOnce(minted());
      expect(await getAccessToken()).toBe('at-minted');
      expect(mint).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an unusable response throws a mint failure and stores nothing', async () => {
    const mint = vi.fn(async () => ({ access_token: '', expires_at: 'nope', session_id: 's' }) as MintResponse);
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');
    const err = await getAccessToken().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(isCookieMintFailure(err)).toBe(true);
    expect(hasLiveAccessToken()).toBe(false);
  });

  it.each([
    ['empty access_token', { access_token: '' }],
    ['unparseable expires_at', { expires_at: 'nope' }],
    ['empty session_id', { session_id: '' }],
  ])('a response with only an %s is rejected', async (_label, bad) => {
    registerMintCallback(async () => ({ ...minted(), ...bad }) as MintResponse);
    noteCookieSession('sess-cookie-1');
    const err = await getAccessToken().catch((e: unknown) => e);
    expect(isCookieMintFailure(err)).toBe(true);
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('a mint naming another session moves the scope there; the caller gets null, the next one its token', async () => {
    const mint = vi.fn(async () => minted('sess-other', 'at-other'));
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');
    const before = getSessionScope();
    const listener = vi.fn();
    onSessionChange(listener);

    expect(await getAccessToken()).toBeNull();
    const after = getSessionScope();
    expect(after).toMatchObject({ sessionId: 'sess-other', source: 'cookie' });
    expect(after.generation).not.toBe(before.generation);
    expect(listener).toHaveBeenCalled();

    // The token belongs to the new session: the next caller gets it, no new mint.
    expect(await getAccessToken()).toBe('at-other');
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('a 429 block belongs to its session: a new cookie session mints at once', async () => {
    const limited = Object.assign(new Error('rate limited'), { retryAfterSeconds: 120 });
    const mint = vi.fn(async (): Promise<MintResponse | null> => { throw limited; });
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');
    expect(await getAccessToken().catch((e: unknown) => e)).toBe(limited);

    await clearSession();
    mint.mockResolvedValueOnce(minted('sess-cookie-2', 'at-2'));
    noteCookieSession('sess-cookie-2');
    expect(await getAccessToken()).toBe('at-2');
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('a 429 that lands after a sign-out sets no block', async () => {
    let fail: ((e: unknown) => void) | undefined;
    const mint = vi.fn(() => new Promise<MintResponse | null>((_r, rej) => { fail = rej; }));
    registerMintCallback(mint);
    noteCookieSession('sess-cookie-1');
    const pending = getAccessToken().catch((e: unknown) => e);
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'));
    await clearSession();
    fail?.(Object.assign(new Error('late 429'), { retryAfterSeconds: 120 }));
    await pending;

    mint.mockResolvedValueOnce(minted('sess-cookie-2', 'at-2'));
    noteCookieSession('sess-cookie-2');
    expect(await getAccessToken()).toBe('at-2');
  });

  it('a huge retry_after blocks for 10 minutes at most', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const limited = Object.assign(new Error('rate limited'), { retryAfterSeconds: 1e9 });
      const mint = vi.fn(async (): Promise<MintResponse | null> => { throw limited; });
      registerMintCallback(mint);
      noteCookieSession('sess-cookie-1');
      await getAccessToken().catch(() => undefined);
      vi.setSystemTime(Date.now() + 9 * 60_000);
      await getAccessToken().catch(() => undefined);
      expect(mint).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 2 * 60_000);
      mint.mockResolvedValueOnce(minted());
      expect(await getAccessToken()).toBe('at-minted');
    } finally {
      vi.useRealTimers();
    }
  });

  it('an expiry already past is rejected and holds mints back 60 s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const mint = vi.fn(async () => ({ ...minted(), expires_at: new Date(Date.now() - 1000).toISOString() }));
      registerMintCallback(mint);
      noteCookieSession('sess-cookie-1');
      expect(isCookieMintFailure(await getAccessToken().catch((e: unknown) => e))).toBe(true);
      expect(hasLiveAccessToken()).toBe(false);
      await getAccessToken().catch(() => undefined);
      expect(mint).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 61_000);
      mint.mockResolvedValueOnce(minted());
      expect(await getAccessToken()).toBe('at-minted');
      expect(mint).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a far-future expiry is kept for 1 hour at most', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const mint = vi.fn(async () => ({ ...minted(), expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() }));
      registerMintCallback(mint);
      noteCookieSession('sess-cookie-1');
      expect(await getAccessToken()).toBe('at-minted');
      vi.setSystemTime(Date.now() + 61 * 60_000);
      expect(hasLiveAccessToken()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a sign-out during the mint wins: the minted token is dropped', async () => {
    let release: ((v: MintResponse) => void) | undefined;
    registerMintCallback(() => new Promise<MintResponse>((r) => { release = r; }));
    noteCookieSession('sess-cookie-1');

    const pending = getAccessToken();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await clearSession();
    release?.(minted());
    expect(await pending).toBeNull();
    expect(hasLiveAccessToken()).toBe(false);
  });

  it('a sign-in during the mint wins: its token is kept, the minted one is dropped', async () => {
    let release: ((v: MintResponse) => void) | undefined;
    registerMintCallback(() => new Promise<MintResponse>((r) => { release = r; }));
    noteCookieSession('sess-cookie-1');

    const pending = getAccessToken();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await setSession({
      accessToken: 'at-signed-in',
      refreshToken: 'rt-signed-in',
      expiresAt: Date.now() + 10 * 60_000,
      sessionId: 'sess-token-9',
    });
    release?.(minted());
    expect(await pending).toBe('at-signed-in');
    expect(await getAccessToken()).toBe('at-signed-in');
    expect(getSessionScope()).toMatchObject({ sessionId: 'sess-token-9', source: 'token' });
  });
});
