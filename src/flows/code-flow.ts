// @bb/universal-auth | src/flows/code-flow.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Code-first sign-in flow — §3.1:
//   POST /auth/v1/code/request  (rate-limited 3/hr/destination)
//   POST /auth/v1/code/verify   (rate-limited 10/min/IP)
//
// Wire: <SignInForm> → requestCode() → <CodeEntry> → verifyCode() → session issued.

import { post, getClientConfig } from '../core/client.js';
import { setSession } from '../core/token-manager.js';
import { getOrCreateDeviceId } from '../core/device-id.js';
import { emit } from '../core/event-reporter.js';
import type { Session } from '../types/api.js';

// ── Public types ──────────────────────────────────────────────────────────

export type CodeChannel = 'sms' | 'email';

export interface RequestCodeInput {
  /** Phone (E.164) or email. */
  destination: string;
  /** Explicit channel; if omitted server infers from destination format. */
  channel?: CodeChannel;
}

export interface VerifyCodeInput {
  code: string;
  /** The same destination that was passed to requestCode. */
  destination: string;
}

export interface VerifyCodeResult {
  session: Session;
}

interface VerifyResponse {
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
 * Request a one-time code. Always returns ok (server returns generic success
 * to prevent account enumeration per §3.1 "enumeration-safe").
 */
export async function requestCode(input: RequestCodeInput): Promise<void> {
  const cfg = getClientConfig();
  const body: Record<string, unknown> = {
    destination: input.destination,
    app_id: cfg?.appId,
  };
  if (input.channel !== undefined) body.channel = input.channel;

  await post<{ ok: true }>('/auth/v1/code/request', body, { anonymous: true });

  void emit('enrollment.code_sent', {
    channel: input.channel ?? 'auto',
    masked_destination: maskDestination(input.destination),
  });
}

/**
 * Verify a one-time code. On success, the SDK installs the session (access
 * token in memory + encrypted refresh token in IDB) and the returned Session
 * is ready for `useAuth()` consumers.
 */
export async function verifyCode(input: VerifyCodeInput): Promise<VerifyCodeResult> {
  const cfg = getClientConfig();
  const device_id = await getOrCreateDeviceId();

  const { data } = await post<VerifyResponse>(
    '/auth/v1/code/verify',
    {
      code: input.code,
      device_id,
      app_id: cfg?.appId,
      destination: input.destination,
    },
    { anonymous: true }
  );

  await setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at).getTime(),
    sessionId: data.session_id,
  });

  void emit('login.success', {
    method: 'code',
    channel: inferChannel(input.destination),
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

// ── Helpers ───────────────────────────────────────────────────────────────

function maskDestination(d: string): string {
  if (d.includes('@')) {
    const [local, domain] = d.split('@');
    if (local === undefined || domain === undefined) return '***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
  // Phone: keep country code + last 2 digits
  return d.length > 4 ? `${d.slice(0, 2)}***${d.slice(-2)}` : '***';
}

function inferChannel(destination: string): CodeChannel {
  return destination.includes('@') ? 'email' : 'sms';
}
