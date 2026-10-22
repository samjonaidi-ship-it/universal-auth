// @samjonaidi-ship-it/universal-auth | test/unit/core/client-dpop.test.ts | v1.1.1 | 2026-10-22 | BB
// v1.1.1: pins v1.6.1 (Devin on PR #46) — a repeated challenge surfaces
// USE_DPOP_NONCE without a silent refresh, while a non-challenge 401
// still refreshes.
// v1.1.0: + v1.6.0 coverage — the flat {code: USE_DPOP_NONCE} wire shape the
// BFF actually sends, and the nonce retry on anonymous mint endpoints
// (anonymous only gates Authorization, not the proof).
//
// L3.1 SDK wire-up coverage — DPoP fetch wrapper + nonce-challenge retry +
// soft/hard fallback semantics + clearSession() keypair tear-down. Mirrors
// DPOP_DESIGN_v1.0.md §5.3 + §10 Q3.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  configureClient,
  post,
  isDpopRequiredFor,
  __resetClientForTests,
} from '../../../src/core/client.js';
import {
  setSession,
  clearSession,
  __resetTokenManagerForTests,
} from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { clearDeviceIdCache } from '../../../src/core/device-id.js';
import {
  loadKeypair,
  generateAndStoreKeypair,
} from '../../../src/core/dpop/keypair.js';
import { __resetNonceCacheForTests } from '../../../src/core/dpop/nonce-cache.js';
import * as proofMod from '../../../src/core/dpop/proof.js';
import * as eventReporter from '../../../src/core/event-reporter.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function b64urlDecodeToString(seg: string): string {
  const pad = seg.length % 4 === 0 ? 0 : 4 - (seg.length % 4);
  const b64 = (seg + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') return atob(b64);
  return Buffer.from(b64, 'base64').toString('binary');
}

interface DpopProofPayload {
  jti: string;
  htm: string;
  htu: string;
  iat: number;
  nonce?: string;
}

function decodeDpopPayload(proof: string): DpopProofPayload {
  const parts = proof.split('.');
  if (parts.length !== 3) throw new Error('not a JWS-compact');
  return JSON.parse(b64urlDecodeToString(parts[1]!)) as DpopProofPayload;
}

describe('core/client — DPoP wire-up (L3.1)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetNonceCacheForTests();
    await __resetDbForTests();
    clearDeviceIdCache();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('isDpopRequiredFor()', () => {
    it('returns true for the 6 protected endpoints (POST)', () => {
      const protectedPaths = [
        '/auth/v1/code/verify',
        '/auth/v1/passkey/authenticate/verify',
        '/auth/v1/enroll/activate',
        '/auth/v1/session/refresh',
        '/auth/v1/session/revoke',
        '/auth/v1/session/revoke-all',
      ];
      for (const path of protectedPaths) {
        expect(isDpopRequiredFor(path, 'POST')).toBe(true);
      }
    });

    it('returns false for non-POST methods on the same paths', () => {
      expect(isDpopRequiredFor('/auth/v1/session/refresh', 'GET')).toBe(false);
    });

    it('returns false for unrelated endpoints', () => {
      expect(isDpopRequiredFor('/identity/v1/profile', 'POST')).toBe(false);
      expect(isDpopRequiredFor('/auth/v1/me', 'GET')).toBe(false);
    });
  });

  describe('useDpop: "auto" (default)', () => {
    beforeEach(async () => {
      configureClient({
        apiBaseUrl: BASE,
        appId: 'bb_express',
        sdkVersion: '1.1.0-rc.1',
        useDpop: 'auto',
      });
      await setSession({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });
    });

    it('attaches Authorization: DPoP + DPoP header on /auth/v1/session/refresh', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { access_token: 'at-2', expires_at: new Date(Date.now() + 60_000).toISOString(), session_id: 's1' }));
      await post('/auth/v1/session/refresh', { refresh_token: 'rt-1' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('DPoP at-1');
      expect(typeof headers.DPoP).toBe('string');
      expect(headers.DPoP!.split('.').length).toBe(3); // JWS-compact
    });

    it('does NOT attach DPoP for unprotected endpoints', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await post('/identity/v1/profile', { name: 'x' });

      const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer at-1');
      expect(headers.DPoP).toBeUndefined();
    });

    it('retries once on 401 USE_DPOP_NONCE with nonce in proof', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: 'USE_DPOP_NONCE', message: 'use this nonce' } }),
            {
              status: 401,
              headers: {
                'content-type': 'application/json',
                'DPoP-Nonce': 'nonce-from-server',
              },
            }
          )
        )
        .mockResolvedValueOnce(jsonResp(200, { ok: true, retried: true }));

      await post('/auth/v1/session/revoke', {});

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const firstHeaders = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      const secondHeaders = (fetchSpy.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;

      // First proof has no nonce
      const firstPayload = decodeDpopPayload(firstHeaders.DPoP!);
      expect(firstPayload.nonce).toBeUndefined();

      // Second proof has the server-issued nonce
      const secondPayload = decodeDpopPayload(secondHeaders.DPoP!);
      expect(secondPayload.nonce).toBe('nonce-from-server');
    });

    it('retries once on a FLAT {code: USE_DPOP_NONCE} challenge — the shape the BFF sends', async () => {
      // routes/auth-v1.js answers a DpopError as
      // `reply.code(401).send({ code, message, protocol_version })` — flat,
      // not the `{error:{code}}` envelope the earlier test uses.
      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 'USE_DPOP_NONCE',
              message: 'DPoP nonce required — retry with nonce',
              protocol_version: 'v1',
            }),
            {
              status: 401,
              headers: {
                'content-type': 'application/json',
                'DPoP-Nonce': 'flat-nonce',
              },
            }
          )
        )
        .mockResolvedValueOnce(jsonResp(200, { ok: true }));

      await post('/auth/v1/session/revoke', {});

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const secondHeaders = (fetchSpy.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
      expect(decodeDpopPayload(secondHeaders.DPoP!).nonce).toBe('flat-nonce');
    });

    it('caps the nonce retry at one — a second challenge surfaces USE_DPOP_NONCE, no loop', async () => {
      // v1.6.1 (Devin on PR #46): the second challenge must reach the caller
      // directly — a silent token refresh cannot fix a missing nonce and
      // only added a doomed third request.
      const challenge = () =>
        new Response(
          JSON.stringify({ code: 'USE_DPOP_NONCE', message: 'again', protocol_version: 'v1' }),
          {
            status: 401,
            headers: { 'content-type': 'application/json', 'DPoP-Nonce': 'another-nonce' },
          }
        );
      fetchSpy
        .mockResolvedValueOnce(challenge())
        .mockResolvedValueOnce(challenge());

      await expect(post('/auth/v1/session/revoke', {})).rejects.toMatchObject({
        code: 'USE_DPOP_NONCE',
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2); // initial + one retry, no refresh burned
      expect(
        fetchSpy.mock.calls.every((c) => String(c[0]).endsWith('/auth/v1/session/revoke')),
        'a repeated nonce challenge must not trigger a silent refresh'
      ).toBe(true);
    });

    it('still silent-refreshes a second 401 that carries a DPoP-Nonce header but is NOT a challenge', async () => {
      // The v1.6.1 short-circuit keys on the body, not the header: a genuine
      // AUTH_SESSION_EXPIRED after the nonce retry keeps the normal refresh
      // path (which here fails terminally → AuthSessionExpired).
      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: 'USE_DPOP_NONCE', message: 'first', protocol_version: 'v1' }),
            { status: 401, headers: { 'content-type': 'application/json', 'DPoP-Nonce': 'n1' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ code: 'AUTH_SESSION_EXPIRED', message: 'expired', protocol_version: 'v1' }),
            { status: 401, headers: { 'content-type': 'application/json', 'DPoP-Nonce': 'stray' } }
          )
        )
        // The silent refresh attempt itself fails terminally.
        .mockResolvedValueOnce(
          jsonResp(401, { code: 'AUTH_SESSION_EXPIRED', message: 'expired', protocol_version: 'v1' })
        );

      await expect(post('/auth/v1/session/revoke', {})).rejects.toMatchObject({
        code: 'AUTH_SESSION_EXPIRED',
      });
      const refreshCalls = fetchSpy.mock.calls.filter((c) =>
        String(c[0]).endsWith('/auth/v1/session/refresh')
      );
      expect(refreshCalls.length).toBe(1); // refresh WAS attempted for a non-challenge 401
    });

    it('retries an ANONYMOUS DPoP mint call on a nonce challenge (anonymous gates auth, not the proof)', async () => {
      // v1.6.0: the mint endpoints are called anonymous:true yet still carry
      // a DPoP proof (P4.6). A USE_DPOP_NONCE challenge on them is answerable
      // — the old `anonymous !== true` gate skipped the retry entirely.
      fetchSpy
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 'USE_DPOP_NONCE',
              message: 'DPoP nonce required — retry with nonce',
              protocol_version: 'v1',
            }),
            {
              status: 401,
              headers: { 'content-type': 'application/json', 'DPoP-Nonce': 'mint-nonce' },
            }
          )
        )
        .mockResolvedValueOnce(jsonResp(200, { ok: true }));

      await post('/auth/v1/code/verify', { code: '000000' }, { anonymous: true });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const secondHeaders = (fetchSpy.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
      expect(decodeDpopPayload(secondHeaders.DPoP!).nonce).toBe('mint-nonce');
      expect(secondHeaders.Authorization).toBeUndefined(); // still anonymous
    });

    it('caps the nonce retry at one on an anonymous mint call too', async () => {
      const challenge = () =>
        new Response(
          JSON.stringify({ code: 'USE_DPOP_NONCE', message: 'again', protocol_version: 'v1' }),
          {
            status: 401,
            headers: { 'content-type': 'application/json', 'DPoP-Nonce': 'nonce-x' },
          }
        );
      fetchSpy.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge());

      // anonymous:true → no silent-refresh fallthrough; the second challenge
      // surfaces as the typed error after exactly one retry.
      await expect(
        post('/auth/v1/code/verify', { code: '000000' }, { anonymous: true })
      ).rejects.toMatchObject({ code: 'USE_DPOP_NONCE' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('falls back to plain Bearer when DPoP build fails + emits dpop.fallback_used', async () => {
      const emitSpy = vi.spyOn(eventReporter, 'emit').mockResolvedValue(undefined);
      const buildSpy = vi
        .spyOn(proofMod, 'buildDpopProof')
        .mockRejectedValueOnce(new Error('mock keypair failure'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* swallow */
      });

      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await post('/auth/v1/session/refresh', { refresh_token: 'rt-1' });

      const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer at-1'); // fell back
      expect(headers.DPoP).toBeUndefined();
      expect(emitSpy).toHaveBeenCalledWith(
        'dpop.fallback_used',
        expect.objectContaining({
          endpoint: '/auth/v1/session/refresh',
          method: 'POST',
          reason: 'mock keypair failure',
        })
      );

      buildSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe('useDpop: "never"', () => {
    beforeEach(async () => {
      configureClient({
        apiBaseUrl: BASE,
        appId: 'bb_express',
        sdkVersion: '1.1.0-rc.1',
        useDpop: 'never',
      });
      await setSession({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });
    });

    it('sends Authorization: Bearer with NO DPoP header on protected endpoints', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResp(200, { ok: true }));
      await post('/auth/v1/session/refresh', { refresh_token: 'rt-1' });

      const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer at-1');
      expect(headers.DPoP).toBeUndefined();
    });
  });

  describe('useDpop: "always"', () => {
    beforeEach(async () => {
      configureClient({
        apiBaseUrl: BASE,
        appId: 'bb_express',
        sdkVersion: '1.1.0-rc.1',
        useDpop: 'always',
      });
      await setSession({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });
    });

    it('rejects when DPoP build fails (no Bearer fallback)', async () => {
      const buildSpy = vi
        .spyOn(proofMod, 'buildDpopProof')
        .mockRejectedValueOnce(new Error('mock crypto failure'));

      // The request should never hit fetch — DPoP build throws first.
      await expect(post('/auth/v1/session/refresh', { refresh_token: 'rt-1' })).rejects.toThrow(
        'mock crypto failure'
      );
      expect(fetchSpy).not.toHaveBeenCalled();

      buildSpy.mockRestore();
    });
  });

  describe('clearSession() lifecycle (L3.1 + DPOP §5.3)', () => {
    it('deleteKeypair runs on clearSession()', async () => {
      configureClient({
        apiBaseUrl: BASE,
        appId: 'bb_express',
        sdkVersion: '1.1.0-rc.1',
        useDpop: 'auto',
      });
      await setSession({
        accessToken: 'at-1',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 15 * 60_000,
        sessionId: 's1',
      });

      // Pre-seed a keypair so we can verify it's gone after clearSession
      await generateAndStoreKeypair();
      const before = await loadKeypair();
      expect(before).not.toBeNull();

      await clearSession();

      const after = await loadKeypair();
      expect(after).toBeNull();
    });
  });
});
