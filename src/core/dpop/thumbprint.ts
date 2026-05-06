// @samjonaidi-ship-it/universal-auth | src/core/dpop/thumbprint.ts | v0.1.0 | 2026-05-06 | BB
// JWK thumbprint per RFC 7638 §3 — SHA-256 over canonical JSON of required members.
//
// For EC keys (P-256/P-384/P-521) the required members are: {crv, kty, x, y}.
// They MUST appear in lexicographic order with no whitespace, then SHA-256
// hashed and base64url-encoded.
//
// This must match the BFF's `jwkThumbprint()` (bff/services/dpop.js v0.1.0)
// byte-for-byte so the `cnf.jkt` claim binds correctly.
//
// Spec: https://www.rfc-editor.org/rfc/rfc7638
// Companion: BB_Platform_Specs/DPOP_DESIGN_v1.0.md §4.3

/** Throwable type so callers can branch on `instanceof DpopThumbprintError`. */
export class DpopThumbprintError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DpopThumbprintError';
    this.code = code;
  }
}

/**
 * Compute the RFC 7638 SHA-256 thumbprint of an EC JWK.
 *
 * @param jwk  Public-key JWK (must be EC). Extra members are ignored — only
 *             the canonical set {crv, kty, x, y} contributes to the hash.
 * @returns    base64url-encoded 32-byte digest.
 * @throws     DpopThumbprintError if the JWK is not EC or is missing members.
 */
export async function jwkThumbprint(jwk: JsonWebKey): Promise<string> {
  if (jwk === null || typeof jwk !== 'object') {
    throw new DpopThumbprintError('INVALID_JWK', 'jwk required');
  }
  if (jwk.kty !== 'EC') {
    throw new DpopThumbprintError(
      'UNSUPPORTED_KTY',
      `unsupported kty: ${String(jwk.kty)} (only EC supported per DPOP_DESIGN §10 Q5)`,
    );
  }
  if (typeof jwk.crv !== 'string' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new DpopThumbprintError('INVALID_JWK', 'EC JWK requires crv, x, y');
  }
  // RFC 7638 §3.2: required members in lex order, no whitespace.
  const canonical = JSON.stringify({ crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return base64UrlEncode(new Uint8Array(digest));
}

/** base64url (RFC 4648 §5) — no padding, +/ → -_. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  // btoa is available in browsers + Node 16+ globals.
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
