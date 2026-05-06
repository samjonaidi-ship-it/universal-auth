// @samjonaidi-ship-it/universal-auth | src/core/dpop/proof.ts | v0.2.0 | 2026-05-06 | BB
// Build + sign DPoP proof JWS per RFC 9449 §4.2.
//
// Header:    { typ: 'dpop+jwt', alg: 'ES256', jwk: <publicKeyAsJwk> }
// Payload:   { jti, htm, htu, iat, [ath], [nonce] }
// Signature: ES256 over `base64url(header) + '.' + base64url(payload)` using
//            crypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, privateKey, ...).
//
// JWS-compact output: `${b64hdr}.${b64payload}.${b64sig}`.
//
// v0.2.0 (P0-3, 2026-05-06): + `ath` claim per RFC 9449 §4.2 when an access
// token is presented. `ath = base64url(SHA-256(accessToken))` binds the proof
// to the specific token in use, preventing a captured proof from being paired
// with a different access token issued to the same client key.
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
   * The access token currently in use. When provided, the proof carries
   * `ath = base64url(SHA-256(accessToken))` per RFC 9449 §4.2, binding the
   * proof to that specific token. Server-side verifiers compare `ath` against
   * the hash of the bearer token presented in the same request — a captured
   * proof cannot be paired with a different access token bound to the same
   * client key.
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
  /** RFC 9449 §4.2 — base64url(SHA-256(accessToken)). Present iff an access token accompanies the request. */
  ath?: string;
  nonce?: string;
}

/**
 * Build a single DPoP proof for the given request. Loads or generates the
 * keypair on demand. Each call mints a fresh `jti` so two concurrent calls
 * produce non-colliding proofs.
 */
export async function buildDpopProof(input: BuildDpopProofInput): Promise<string> {
  const { url, method, accessToken, nonce } = input;
  const pair = await getOrCreateKeypair();
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);

  // RFC 9449 §4.2 — if an access token is present, bind the proof to it via `ath`.
  let ath: string | undefined;
  if (accessToken !== undefined && accessToken.length > 0) {
    const tokenBytes = new TextEncoder().encode(accessToken);
    const digest = await crypto.subtle.digest('SHA-256', tokenBytes);
    ath = base64UrlEncode(new Uint8Array(digest));
  }

  const header: DpopHeader = { typ: 'dpop+jwt', alg: 'ES256', jwk };
  const payload: DpopPayload = {
    jti: nanoid(),
    htm: method.toUpperCase(),
    htu: url,
    iat: Math.floor(Date.now() / 1000),
    ...(ath !== undefined ? { ath } : {}),
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
