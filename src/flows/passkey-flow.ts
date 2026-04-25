// @bb/universal-auth | src/flows/passkey-flow.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// WebAuthn register + authenticate via @simplewebauthn/browser.
// Lazy-loaded chunk per §8.2 — separate esbuild entry point. Budget: 10 KB gzip per §12.1.
//
// Endpoints (§3.1):
//   POST /auth/v1/passkey/register/options
//   POST /auth/v1/passkey/register/verify
//   POST /auth/v1/passkey/authenticate/options    (supports Conditional UI)
//   POST /auth/v1/passkey/authenticate/verify

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

  let attestation: RegistrationResponseJSON;
  try {
    attestation = await startRegistration({ optionsJSON: options });
  } catch (err) {
    void emit('passkey.cancelled', { phase: 'register' });
    throw err;
  }

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
    credential_id_hash: assertion.id.slice(0, 8),  // partial hash for privacy
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
