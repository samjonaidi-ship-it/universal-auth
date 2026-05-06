// @samjonaidi-ship-it/universal-auth | src/flows/enroll-flow.ts | v1.1.0 | 2026-05-06 | BB
// Magic-link enrollment flow (v1.4.0 §3.1bis).
//
// Endpoints:
//   POST /auth/v1/enroll/verify/:token   — 10/hr/token
//   POST /auth/v1/enroll/activate        — 5/hr/token
//
// Sequence (§3.1bis):
//   1. Admin finalizes Wizard → token stored in ct_bff.identities
//   2. User lands on BB_Express /enroll#<token> (POST-only per D3)
//   3. SDK verifies token → renders <ConsentScreen required={documents[]}>
//   4. User accepts consents + credential → SDK calls /enroll/activate
//   5. Session issued; identity.employee_linked emitted for crew (D14);
//      enrollment.completed emitted; redirect to landing_route.

import { post } from '../core/client.js';
import { setSession } from '../core/token-manager.js';
import { getOrCreateDeviceId } from '../core/device-id.js';
import { emit } from '../core/event-reporter.js';
import type { Session } from '../types/api.js';

// ── Public types ──────────────────────────────────────────────────────────

export interface EnrollVerifyResult {
  identity: {
    id: string;
    display_name: string;
    email_masked: string | null;
    persona_type: string;
    consent_documents_required: readonly ConsentDocumentRef[];
  };
  invite: {
    expires_at: string;
    dispatched_to: string;
  };
}

export interface ConsentDocumentRef {
  consent_type: string;
  policy_version: string;
  title: string;
  body_url: string;
  required: boolean;
  group: 'legal' | 'device' | 'ai_assistant' | 'optional';
}

export type EnrollMethod = 'webauthn' | 'pin';

export interface WebAuthnCredentialPayload {
  attestationObject: string;       // base64url
  clientDataJSON: string;          // base64url
}

export interface EnrollActivateInput {
  token: string;
  method: EnrollMethod;
  credential: WebAuthnCredentialPayload | { pin: string };
  consents: readonly { consent_type: string; policy_version: string }[];
}

export interface EnrollActivateResult {
  session: Session;
}

interface ActivateResponse {
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

// ── API ───────────────────────────────────────────────────────────────────

/**
 * Step 1 (after URL-fragment parse) — POST-only verify so Safe Links + link
 * preview crawlers can't consume the token (D3). Returns the identity stub
 * and required consents for the `<ConsentScreen>`.
 */
export async function verifyEnrollmentToken(
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<EnrollVerifyResult> {
  const { data } = await post<EnrollVerifyResult>(
    `/auth/v1/enroll/verify/${encodeURIComponent(token)}`,
    {},
    {
      anonymous: true,
      ...(options.signal !== undefined && { signal: options.signal }),
    }
  );
  void emit('enrollment.started', { dispatched_to: data.invite.dispatched_to });
  return data;
}

/**
 * Step 2 — atomic activate. Single-use: the token is consumed server-side
 * on success. Caller wires this to the <ConsentScreen> onAccept handler
 * after the user provides a passkey (or PIN during CalExp5 migration window).
 */
export async function activateEnrollment(
  input: EnrollActivateInput,
  options: { signal?: AbortSignal } = {},
): Promise<EnrollActivateResult> {
  const device_id = await getOrCreateDeviceId();

  const { data } = await post<ActivateResponse>(
    '/auth/v1/enroll/activate',
    {
      token: input.token,
      method: input.method,
      credential: input.credential,
      device_id,
      consents: input.consents,
    },
    {
      anonymous: true,
      ...(options.signal !== undefined && { signal: options.signal }),
    }
  );

  await setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at).getTime(),
    sessionId: data.session_id,
  });

  void emit('enrollment.consent_recorded', {
    count: input.consents.length,
  });

  // D14 — server emits identity.employee_linked when the identity is a
  // crew identity (persona_type='crew'). Mirror it client-side for analytics.
  if (data.identity.identity_kind === 'human') {
    const hasCrew = data.personas?.some((p) => p.persona_type === 'crew') ?? false;
    if (hasCrew && data.identity.employee_id !== undefined && data.identity.employee_id !== null) {
      void emit('identity.employee_linked', {
        employee_id: data.identity.employee_id,
      });
    }
  }

  void emit('enrollment.completed', {
    method: input.method,
    passkey_enrolled: input.method === 'webauthn',
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

/**
 * Parse the enrollment token from a URL fragment — e.g.,
 *   https://express.bainbridgebuilders.com/enroll#abc123
 * Returns the token string or null.
 *
 * v1.0.1 (B5): when reading from `window.location` (i.e. the caller didn't
 * pass an explicit URL), the token is stripped from the address bar AND the
 * browser history entry via `history.replaceState`. Prevents the token
 * leaking via Referer headers, screen-share recordings, or "share this URL"
 * UI. Server consumes the token server-side on activate; the client never
 * needs the fragment again.
 */
export function parseEnrollmentTokenFromUrl(url: string = ''): string | null {
  const readingFromLiveLocation = url.length === 0;
  const source = url.length > 0 ? url : typeof window !== 'undefined' ? window.location.href : '';
  const hashIdx = source.indexOf('#');
  if (hashIdx === -1) return null;
  const token = source.slice(hashIdx + 1);
  if (token.length === 0) return null;

  // Strip the fragment from the live URL + history entry. Skip for explicit
  // URL inputs (the caller already controls history).
  if (
    readingFromLiveLocation &&
    typeof history !== 'undefined' &&
    typeof location !== 'undefined' &&
    typeof history.replaceState === 'function'
  ) {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      // Some sandboxed iframes throw on replaceState — non-fatal, the token
      // simply remains in the bar. Activate still works.
    }
  }

  return token;
}
