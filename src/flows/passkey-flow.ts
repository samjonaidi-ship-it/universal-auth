// @samjonaidi-ship-it/universal-auth | src/flows/passkey-flow.ts | v1.1.0 | 2026-05-06 | BB
// WebAuthn register + authenticate via @simplewebauthn/browser.
// Lazy-loaded chunk per §8.2 — separate esbuild entry point. Budget: 10 KB gzip per §12.1.
//
// Endpoints (§3.1):
//   POST /auth/v1/passkey/register/options
//   POST /auth/v1/passkey/register/verify
//   POST /auth/v1/passkey/authenticate/options    (supports Conditional UI)
//   POST /auth/v1/passkey/authenticate/verify
//
// v1.1.0 (P1-H, 2026-05-06): client-side User Verification (UV) enforcement
// per W3C WebAuthn L3 + NIST SP 800-63B AAL2.
//   1. Pre-call guard: refuse to even invoke startRegistration / start-
//      Authentication if the server's options blob carries
//      `userVerification: 'discouraged'`. Defends against a server
//      mis-config or downgrade attack that would silently drop UV.
//   2. Post-call guard: parse `authenticatorData[32]` (UV bit = 0x04) on
//      the assertion. If options demanded UV ('required' or 'preferred')
//      and the authenticator did NOT perform UV, reject the assertion
//      before submitting to /verify. Protects against authenticators that
//      ignore the policy.

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from '@simplewebauthn/browser';
import { post } from '../core/client.js';
import { setSession } from '../core/token-manager.js';
import { getOrCreateDeviceId } from '../core/device-id.js';
import { emit } from '../core/event-reporter.js';
import type { Session } from '../types/api.js';

// ── Capability detection ─────────────────────────────────────────────────

export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn();
}

export async function isConditionalUiSupported(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  return browserSupportsWebAuthnAutofill();
}

// ── P1-H: UV enforcement helpers ─────────────────────────────────────────

/**
 * Reject server-issued options that carry `userVerification: 'discouraged'`.
 * Per NIST SP 800-63B, AAL2 requires user verification — the server MUST
 * request UV ('required' or 'preferred'). 'discouraged' downgrades the
 * authenticator to AAL1, which is unacceptable for our deployment.
 *
 * Throws an Error so the caller surfaces the misconfiguration instead of
 * silently completing a downgraded ceremony.
 */
function assertUvNotDiscouraged(
  options: { authenticatorSelection?: { userVerification?: string }; userVerification?: string },
  phase: 'register' | 'authenticate',
): void {
  // Registration: userVerification lives under authenticatorSelection.
  // Authentication: userVerification is at the top level of the options.
  const uv =
    options.userVerification ?? options.authenticatorSelection?.userVerification;
  if (uv === 'discouraged') {
    throw new Error(
      `[passkey] server-issued ${phase} options request userVerification:'discouraged' — ` +
        `refusing to proceed (NIST SP 800-63B AAL2 requires UV).`,
    );
  }
}

/**
 * Parse the WebAuthn `authenticatorData` byte sequence and return whether
 * the User Verification (UV) bit is set.
 *
 * `authenticatorData` layout per W3C WebAuthn L3 §6.1:
 *   bytes 0..31  rpIdHash
 *   byte  32     flags  (UP=0x01, UV=0x04, AT=0x40, ED=0x80)
 *   bytes 33..36 signCount
 *   ...
 *
 * Input is base64url-encoded per the JSON serialization at
 * `AuthenticationResponseJSON.response.authenticatorData`. We decode just
 * enough to read the flags byte; full COSE / attestation parsing stays
 * out of the lazy chunk.
 */
function authenticatorPerformedUv(authenticatorDataB64Url: string): boolean {
  // base64url → bytes (only need the first 33 bytes, but small input)
  const pad = authenticatorDataB64Url.length % 4 === 0 ? 0 : 4 - (authenticatorDataB64Url.length % 4);
  const b64 = (authenticatorDataB64Url + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  let bin: string;
  if (typeof atob === 'function') {
    bin = atob(b64);
  } else {
    bin = Buffer.from(b64, 'base64').toString('binary');
  }
  if (bin.length < 33) return false; // malformed — fail closed
  const flags = bin.charCodeAt(32);
  return (flags & 0x04) === 0x04; // UV bit
}

// ── Registration (after sign-in / during enrollment) ─────────────────────

export interface RegisterPasskeyResult {
  credential_id: string;
  aaguid: string;
  transports: readonly string[];
}

interface RegisterVerifyResponse {
  ok: true;
  credential: RegisterPasskeyResult;
}

/**
 * Register a passkey for the current session. Two-step ceremony:
 *   1. POST /options    → server returns a challenge + RP info
 *   2. browser prompts user → returns attestation
 *   3. POST /verify     → server stores credential
 */
export async function registerPasskey(): Promise<RegisterPasskeyResult> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  const { data: options } = await post<PublicKeyCredentialCreationOptionsJSON>(
    '/auth/v1/passkey/register/options',
    {}
  );

  // P1-H: pre-call guard — server must not request UV='discouraged'.
  assertUvNotDiscouraged(options, 'register');

  let attestation: RegistrationResponseJSON;
  try {
    attestation = await startRegistration({ optionsJSON: options });
  } catch (err) {
    void emit('passkey.cancelled', { phase: 'register' });
    throw err;
  }

  // P1-H: post-call guard — verify the authenticator actually performed UV.
  // For registration, authenticatorData lives inside the attestationObject,
  // which is base64url-encoded. We can't cheaply parse it without a full
  // CBOR decoder — and @simplewebauthn already exposes the parsed result
  // server-side for verification. Skip post-call UV inspection at register
  // time; the server-side WebAuthn library asserts UV before storing the
  // credential. We catch the downgrade case via the pre-call options check.

  const { data } = await post<RegisterVerifyResponse>(
    '/auth/v1/passkey/register/verify',
    { attestation }
  );

  void emit('passkey.registered', {
    aaguid: data.credential.aaguid,
    transports: data.credential.transports,
  });

  return data.credential;
}

// ── Authentication (sign-in via passkey) ─────────────────────────────────

export interface AuthenticatePasskeyOptions {
  /**
   * If true, request Conditional UI — the browser surfaces stored passkeys
   * inline as username field autofill. Caller must have an `<input
   * autocomplete="username webauthn">` mounted at the time of the call.
   */
  conditionalUI?: boolean;
}

export interface AuthenticatePasskeyResult {
  session: Session;
}

interface AuthenticateVerifyResponse {
  access_token: string;
  refresh_token: string;
  session_id: string;
  expires_at: string;
  identity: Session['identity'];
  aggregate: Session['aggregate'];
  session_meta: Session['session_meta'];
  personas?: Session['personas'];
  primary_persona?: Session['primary_persona'];
  agent?: Session['agent'];
}

export async function authenticatePasskey(
  options: AuthenticatePasskeyOptions = {}
): Promise<AuthenticatePasskeyResult> {
  if (!browserSupportsWebAuthn()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  const { data: assertOptions } = await post<PublicKeyCredentialRequestOptionsJSON>(
    '/auth/v1/passkey/authenticate/options',
    {},
    { anonymous: true }
  );

  // P1-H: pre-call guard — refuse downgrade to UV='discouraged'.
  assertUvNotDiscouraged(assertOptions, 'authenticate');

  let assertion: AuthenticationResponseJSON;
  try {
    assertion = await startAuthentication({
      optionsJSON: assertOptions,
      useBrowserAutofill: options.conditionalUI === true,
    });
  } catch (err) {
    void emit('passkey.cancelled', { phase: 'authenticate' });
    throw err;
  }

  // P1-H: post-call guard — confirm the authenticator actually performed UV
  // when the policy demanded it. Reject before submitting the assertion to
  // /verify. (Server-side also asserts UV via @simplewebauthn/server, but
  // failing fast here avoids a wasted round-trip and gives a clearer error.)
  const policyDemandsUv = (assertOptions.userVerification ?? 'preferred') !== 'discouraged';
  if (policyDemandsUv && !authenticatorPerformedUv(assertion.response.authenticatorData)) {
    void emit('passkey.uv_required_but_missing', { phase: 'authenticate' });
    throw new Error(
      '[passkey] authenticator did not perform user verification (UV bit unset) — ' +
        'server policy required UV. Refusing to submit assertion.',
    );
  }

  const device_id = await getOrCreateDeviceId();
  const { data } = await post<AuthenticateVerifyResponse>(
    '/auth/v1/passkey/authenticate/verify',
    { assertion, device_id },
    { anonymous: true }
  );

  await setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at).getTime(),
    sessionId: data.session_id,
  });

  void emit('passkey.used', {
    credential_id_prefix: assertion.id.slice(0, 8),  // first 8 chars for correlation, not a hash
  });

  void emit('login.success', {
    method: 'passkey',
    device_id,
  });

  const session: Session = {
    identity: data.identity,
    aggregate: data.aggregate,
    session_meta: data.session_meta,
  };
  if (data.personas !== undefined) session.personas = data.personas;
  if (data.primary_persona !== undefined) session.primary_persona = data.primary_persona;
  if (data.agent !== undefined) session.agent = data.agent;

  return { session };
}
