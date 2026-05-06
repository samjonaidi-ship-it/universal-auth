// @samjonaidi-ship-it/universal-auth | test/unit/core/client-dpop.test.ts | v1.0.0 | 2026-05-05 | BB
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
