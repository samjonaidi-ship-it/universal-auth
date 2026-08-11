// @samjonaidi-ship-it/universal-auth | src/flows/pin-flow.ts | v1.0.0 | 2026-08-10 | BB
// PIN sign-in flow — the crew's PRIMARY path back into BB Express:
//   POST /auth/v1/pin/verify   anonymous  { email, pin } → session
//   POST /auth/v1/pin/set      Bearer     store a hashed PIN
//   POST /auth/v1/pin/clear    Bearer     forget it (forces OTP next time)
//   GET  /auth/v1/pin/status   either     has_pin?
//
// P4.1 — why these exist at all.
//
// CalExp5 called all four with raw `fetch()`, hand-rolling the Authorization
// header from getCurrentToken(). That worked, but it meant PIN sign-in skipped
// every guarantee the SDK client provides, and one of them turned out to
// matter a great deal: `/auth/v1/pin/verify` never carried a DPoP proof, so
// the CT BFF stored `cnf_jkt = NULL` for it. PIN is how most of the crew sign
// in, so in practice almost no session was DPoP-bound — which in turn meant
// P4.10's device-scoped revoke could never narrow for them (it falls back to
// identity-wide when cnf_jkt is null) and M1 survived for exactly the people
// it was written to protect.
//
// Routing through the client also picks up, for free and consistently:
//   * the protocol/app/SDK-version headers the BFF logs and correlates on
//   * X-Device-Id on the authenticated calls
//   * Idempotency-Key on mutations
//   * the P2.5 default request timeout
//   * typed AuthSdkError envelopes instead of ad-hoc `resp.ok` branching
//
// CSRF is unaffected: /auth/v1/pin/verify is on the exemption list, and
// set/clear are token-authenticated, which the CSRF middleware skips by
// design ("the universal-auth SDK calls /auth/v1/* with Authorization:
// Bearer/DPoP from a different subdomain" — bff/middleware/csrf.js).

import { get, post, getClientConfig } from '../core/client.js';
import { setSession } from '../core/token-manager.js';
import { getOrCreateDeviceId } from '../core/device-id.js';
import { emit } from '../core/event-reporter.js';
import type { Session } from '../types/api.js';

// ── Public types ──────────────────────────────────────────────────────────

export interface VerifyPinInput {
  /** The identity's email — the PIN's per-user salt server-side. */
  email: string;
  /** 4-8 digits. */
  pin: string;
}

export interface VerifyPinResult {
  session: Session;
}

export interface SetPinInput {
  /** 4-8 digits. */
  pin: string;
}

export interface PinStatus {
  has_pin: boolean;
}

interface VerifyPinResponse {
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

// ── Flow ──────────────────────────────────────────────────────────────────

/**
 * Verify a PIN. On success the SDK installs the session (access token in
 * memory + encrypted refresh token in IDB), exactly as verifyCode() does, so
 * `useAuth()` consumers see it immediately.
 *
 * Anonymous by design — this is pre-identity. It is nonetheless a
 * DPoP-protected endpoint: the proof sent here is what binds the new session
 * to this device's key.
 */
export async function verifyPin(
  input: VerifyPinInput,
  options: { signal?: AbortSignal } = {},
): Promise<VerifyPinResult> {
  const cfg = getClientConfig();
  const device_id = await getOrCreateDeviceId();

  const { data } = await post<VerifyPinResponse>(
    '/auth/v1/pin/verify',
    {
      email: input.email,
      pin: input.pin,
      device_id,
      app_id: cfg?.appId,
    },
    {
      anonymous: true,
      ...(options.signal !== undefined && { signal: options.signal }),
    },
  );

  await setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at).getTime(),
    sessionId: data.session_id,
  });

  void emit('login.success', { method: 'pin', device_id });

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
 * Store (or rotate) the caller's PIN. Requires a live session — the client
 * attaches the bearer token, so callers no longer hand-roll it.
 */
export async function setPin(
  input: SetPinInput,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await post<{ ok: boolean }>(
    '/auth/v1/pin/set',
    { pin: input.pin },
    { ...(options.signal !== undefined && { signal: options.signal }) },
  );
  void emit('pin.set', {});
}

/**
 * Forget the caller's PIN — the next sign-in falls back to email OTP.
 * Idempotent server-side.
 */
export async function clearPin(
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await post<{ ok: boolean }>(
    '/auth/v1/pin/clear',
    {},
    { ...(options.signal !== undefined && { signal: options.signal }) },
  );
  void emit('pin.cleared', {});
}

/**
 * Does this identity have a PIN set?
 *
 * Two shapes, matching the BFF:
 *   - pass `email` → anonymous probe, used pre-sign-in to decide whether to
 *     show the PIN pad. Separately rate-limited server-side against
 *     enumeration.
 *   - pass nothing → authenticated, asks about the current session's identity.
 */
export async function getPinStatus(
  input: { email?: string } = {},
  options: { signal?: AbortSignal } = {},
): Promise<PinStatus> {
  const anonymous = typeof input.email === 'string' && input.email.length > 0;
  const path = anonymous
    ? `/auth/v1/pin/status?email=${encodeURIComponent(input.email as string)}`
    : '/auth/v1/pin/status';

  const { data } = await get<{ has_pin?: boolean }>(path, {
    ...(anonymous && { anonymous: true }),
    ...(options.signal !== undefined && { signal: options.signal }),
  });

  return { has_pin: data?.has_pin === true };
}
