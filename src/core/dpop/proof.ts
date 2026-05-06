// @samjonaidi-ship-it/universal-auth | src/core/dpop/proof.ts | v0.1.0 | 2026-05-06 | BB
// Build + sign DPoP proof JWS per RFC 9449 §4.2.
//
// Header:    { typ: 'dpop+jwt', alg: 'ES256', jwk: <publicKeyAsJwk> }
// Payload:   { jti, htm, htu, iat, [nonce] }
// Signature: ES256 over `base64url(header) + '.' + base64url(payload)` using
//            crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, privateKey, ...).
//
// JWS-compact output: `${b64hdr}.${b64payload}.${b64sig}`.
//
// Hand-rolled rather than via `jsonwebtoken` because that lib is Node-only
// (uses Buffer + node:crypto). The server (bff/services/dpop.js) verifies
// these proofs via `jwt.verify(proof, jwk)` — it accepts any standards-
// compliant ECDSA JWS.

import { nanoid } from 'nanoid';
import { getOrCreateKeypair } from './keypair.js';
import { base64UrlEncode } from './thumbprint.js';

export interface BuildDpopProofInput {
  /** Full target URL — used for the `htu` claim. */
  url: string;
  /** Uppercase HTTP method — used for the `htm` claim. */
  method: string;
  /**
   * The access token currently in use. Reserved for forward-compat with
   * RFC 9449's `ath` claim binding; in DPOP_DESIGN v1.1 first cut the
   * `cnf` is bound to the refresh token, not the access token, so this
   * parameter is accepted but not yet placed in the payload.
   */
  accessToken?: string;
  /** Server-issued nonce from a prior `USE_DPOP_NONCE` challenge. */
  nonce?: string;
}

interface DpopHeader {
  typ: 'dpop+jwt';
  alg: 'ES256';
  jwk: JsonWebKey;
}

interface DpopPayload {
  jti: string;
  htm: string;
  htu: string;
  iat: number;
  nonce?: string;
}

/**
 * Build a single DPoP proof for the given request. Loads or generates the
 * keypair on demand. Each call mints a fresh `jti` so two concurrent calls
 * produce non-colliding proofs.
 */
export async function buildDpopProof(input: BuildDpopProofInput): Promise<string> {
  const { url, method, nonce } = input;
  const pair = await getOrCreateKeypair();
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);

  const header: DpopHeader = { typ: 'dpop+jwt', alg: 'ES256', jwk };
  const payload: DpopPayload = {
    jti: nanoid(),
    htm: method.toUpperCase(),
    htu: url,
    iat: Math.floor(Date.now() / 1000),
    ...(nonce !== undefined ? { nonce } : {}),
  };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // crypto.subtle.sign for ECDSA returns the raw r||s big-endian concatenation
  // (64 bytes for P-256) — exactly the JWS signature shape per RFC 7515 §3.4.
  const sigBytes = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  const encodedSig = base64UrlEncode(new Uint8Array(sigBytes));

  return `${signingInput}.${encodedSig}`;
}
