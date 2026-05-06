// @samjonaidi-ship-it/universal-auth | test/unit/core/dpop/proof.test.ts | v0.2.0 | 2026-05-06 | BB
// Build a DPoP proof, parse the JWS, verify required claims + signature.
// v0.2.0 (P0-3): + `ath` claim coverage per RFC 9449 §4.2.

import { describe, it, expect, beforeEach } from 'vitest';
import { buildDpopProof } from '../../../../src/core/dpop/proof.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';

function b64urlDecodeToString(seg: string): string {
  const pad = seg.length % 4 === 0 ? 0 : 4 - (seg.length % 4);
  const b64 = (seg + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob === 'function') return atob(b64);
  return Buffer.from(b64, 'base64').toString('binary');
}

function b64urlDecodeToBytes(seg: string): Uint8Array {
  const bin = b64urlDecodeToString(seg);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

describe('dpop/proof.buildDpopProof', () => {
  beforeEach(async () => {
    await __resetDbForTests();
  });

  it('emits a JWS-compact string with three base64url segments', async () => {
    const proof = await buildDpopProof({
      url: 'https://api.buildwithbainbridge.com/auth/v1/session/refresh',
      method: 'POST',
    });
    const parts = proof.split('.');
    expect(parts.length).toBe(3);
    for (const part of parts) {
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('header has typ=dpop+jwt, alg=ES256, and an EC P-256 jwk', async () => {
    const proof = await buildDpopProof({
      url: 'https://api.example.com/x',
      method: 'POST',
    });
    const [hdr] = proof.split('.');
    const header = JSON.parse(b64urlDecodeToString(hdr!)) as {
      typ: string;
      alg: string;
      jwk: JsonWebKey;
    };
    expect(header.typ).toBe('dpop+jwt');
    expect(header.alg).toBe('ES256');
    expect(header.jwk.kty).toBe('EC');
    expect(header.jwk.crv).toBe('P-256');
    expect(typeof header.jwk.x).toBe('string');
    expect(typeof header.jwk.y).toBe('string');
  });

  it('payload contains jti, htm, htu, iat with correct values', async () => {
    const url = 'https://api.example.com/auth/v1/session/refresh';
    const before = Math.floor(Date.now() / 1000);
    const proof = await buildDpopProof({ url, method: 'post' });
    const after = Math.floor(Date.now() / 1000);

    const payload = JSON.parse(b64urlDecodeToString(proof.split('.')[1]!)) as {
      jti: string;
      htm: string;
      htu: string;
      iat: number;
      nonce?: string;
    };
    expect(typeof payload.jti).toBe('string');
    expect(payload.jti.length).toBeGreaterThan(10);
    expect(payload.htm).toBe('POST'); // upper-cased
    expect(payload.htu).toBe(url);
    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(payload.nonce).toBeUndefined();
  });

  it('includes ath claim (base64url SHA-256 of access token) when accessToken is provided', async () => {
    const accessToken = 'eyJhbGciOiJFUzI1NiJ9.test_access_token_payload.test_sig';
    const proof = await buildDpopProof({
      url: 'https://api.example.com/x',
      method: 'POST',
      accessToken,
    });
    const payload = JSON.parse(b64urlDecodeToString(proof.split('.')[1]!)) as {
      ath?: string;
    };
    // Compute expected ath ourselves to confirm value matches RFC 9449 §4.2.
    const expectedDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(accessToken),
    );
    const expectedAth = (() => {
      const bytes = new Uint8Array(expectedDigest);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
      const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    })();
    expect(typeof payload.ath).toBe('string');
    expect(payload.ath).toBe(expectedAth);
    expect(payload.ath).toMatch(/^[A-Za-z0-9_-]+$/); // valid base64url
  });

  it('omits ath claim when accessToken is not provided', async () => {
    const proof = await buildDpopProof({
      url: 'https://api.example.com/auth/v1/session/refresh',
      method: 'POST',
    });
    const payload = JSON.parse(b64urlDecodeToString(proof.split('.')[1]!)) as {
      ath?: string;
    };
    expect(payload.ath).toBeUndefined();
  });

  it('omits ath claim when accessToken is the empty string', async () => {
    // Defensive: zero-length tokens shouldn't produce a useless `ath` of SHA-256("").
    const proof = await buildDpopProof({
      url: 'https://api.example.com/x',
      method: 'POST',
      accessToken: '',
    });
    const payload = JSON.parse(b64urlDecodeToString(proof.split('.')[1]!)) as {
      ath?: string;
    };
    expect(payload.ath).toBeUndefined();
  });

  it('includes nonce claim when supplied', async () => {
    const proof = await buildDpopProof({
      url: 'https://api.example.com/x',
      method: 'POST',
      nonce: 'srv-issued-nonce-abc',
    });
    const payload = JSON.parse(b64urlDecodeToString(proof.split('.')[1]!)) as {
      nonce?: string;
    };
    expect(payload.nonce).toBe('srv-issued-nonce-abc');
  });

  it('mints a unique jti per call', async () => {
    const a = await buildDpopProof({ url: 'https://api.example.com/x', method: 'POST' });
    const b = await buildDpopProof({ url: 'https://api.example.com/x', method: 'POST' });
    const ja = JSON.parse(b64urlDecodeToString(a.split('.')[1]!)) as { jti: string };
    const jb = JSON.parse(b64urlDecodeToString(b.split('.')[1]!)) as { jti: string };
    expect(ja.jti).not.toBe(jb.jti);
  });

  it('signature verifies against the embedded JWK via WebCrypto', async () => {
    const proof = await buildDpopProof({
      url: 'https://api.example.com/auth/v1/session/refresh',
      method: 'POST',
    });
    const [hdr, payload, sig] = proof.split('.');
    const header = JSON.parse(b64urlDecodeToString(hdr!)) as { jwk: JsonWebKey };

    const importedPub = await crypto.subtle.importKey(
      'jwk',
      header.jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const sigBytes = b64urlDecodeToBytes(sig!);
    const signingInput = new TextEncoder().encode(`${hdr}.${payload}`);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      importedPub,
      sigBytes,
      signingInput,
    );
    expect(ok).toBe(true);
  });

  it('signature fails verification if the payload is tampered', async () => {
    const proof = await buildDpopProof({
      url: 'https://api.example.com/x',
      method: 'POST',
    });
    const [hdr, payload, sig] = proof.split('.');
    const header = JSON.parse(b64urlDecodeToString(hdr!)) as { jwk: JsonWebKey };

    // Flip one byte of the payload — verify must fail.
    const tampered = payload!.slice(0, -1) + (payload!.slice(-1) === 'A' ? 'B' : 'A');

    const importedPub = await crypto.subtle.importKey(
      'jwk',
      header.jwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const sigBytes = b64urlDecodeToBytes(sig!);
    const signingInput = new TextEncoder().encode(`${hdr}.${tampered}`);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      importedPub,
      sigBytes,
      signingInput,
    );
    expect(ok).toBe(false);
  });
});
