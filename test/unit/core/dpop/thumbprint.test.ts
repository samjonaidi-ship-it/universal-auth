// @samjonaidi-ship-it/universal-auth | test/unit/core/dpop/thumbprint.test.ts | v0.1.0 | 2026-05-06 | BB
// RFC 7638 thumbprint — invariant under JWK member reordering, EC-only,
// matches Node-side hash byte-for-byte (server cross-check).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { jwkThumbprint, DpopThumbprintError } from '../../../../src/core/dpop/thumbprint.js';

const SAMPLE_EC: JsonWebKey = {
  kty: 'EC',
  crv: 'P-256',
  x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
  y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
};

describe('jwkThumbprint (RFC 7638)', () => {
  it('matches the canonical SHA-256(b64url) of the four required EC members', async () => {
    const actual = await jwkThumbprint(SAMPLE_EC);

    // Server uses the same canonical form (bff/services/dpop.js v0.1.0).
    const canonical = JSON.stringify({
      crv: SAMPLE_EC.crv,
      kty: 'EC',
      x: SAMPLE_EC.x,
      y: SAMPLE_EC.y,
    });
    const expected = createHash('sha256').update(canonical, 'utf8').digest('base64url');

    expect(actual).toBe(expected);
    // RFC 7638 §3.1 worked example uses RSA, but for our EC vector we just
    // assert determinism against Node's known-good hash.
    expect(actual.length).toBeGreaterThan(40);
    expect(actual).not.toContain('=');
    expect(actual).not.toContain('+');
    expect(actual).not.toContain('/');
  });

  it('is invariant under JWK member key reordering (canonical form discards order)', async () => {
    const reordered: JsonWebKey = {
      y: SAMPLE_EC.y,
      kty: 'EC',
      x: SAMPLE_EC.x,
      crv: SAMPLE_EC.crv,
    };
    const a = await jwkThumbprint(SAMPLE_EC);
    const b = await jwkThumbprint(reordered);
    expect(a).toBe(b);
  });

  it('ignores extra (non-required) JWK members', async () => {
    const withExtras: JsonWebKey = {
      ...SAMPLE_EC,
      // Non-canonical members per RFC 7638 — must NOT contribute to the hash.
      // @ts-expect-error — adding non-standard fields for the test.
      use: 'sig',
      // @ts-expect-error
      kid: 'arbitrary-id-123',
    };
    const a = await jwkThumbprint(SAMPLE_EC);
    const b = await jwkThumbprint(withExtras);
    expect(a).toBe(b);
  });

  it('rejects non-EC kty with a typed error', async () => {
    const rsa: JsonWebKey = { kty: 'RSA', n: 'x', e: 'AQAB' };
    await expect(jwkThumbprint(rsa)).rejects.toBeInstanceOf(DpopThumbprintError);
    await expect(jwkThumbprint(rsa)).rejects.toMatchObject({ code: 'UNSUPPORTED_KTY' });
  });

  it('rejects EC JWK missing required members', async () => {
    const partial: JsonWebKey = { kty: 'EC', crv: 'P-256' };
    await expect(jwkThumbprint(partial)).rejects.toMatchObject({ code: 'INVALID_JWK' });
  });

  it('matches a generated WebCrypto keypair end-to-end (cross-check vs node:crypto)', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    );
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const sdkSide = await jwkThumbprint(jwk);

    const canonical = JSON.stringify({ crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y });
    const nodeSide = createHash('sha256').update(canonical, 'utf8').digest('base64url');

    expect(sdkSide).toBe(nodeSide);
  });
});
