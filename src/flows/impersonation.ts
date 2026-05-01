// @bainbridgebuilders/universal-auth | src/flows/impersonation.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Admin impersonation — "act as" another identity for support/debugging.
//
// Invariants per spec:
//   §3.1 + §D2.2  Admin-only; requires existing admin session + entitlement
//   §9.2          Blocked offline — always requires live server verification
//   §6.1          Emits impersonation.started / .ended / .action events
//   §11.10        <ImpersonationBanner> must persist across navigations
//
// The server issues a distinct "acting_as" session id; the SDK swaps it in
// for the lifetime of the impersonation and restores the admin session on end.

import { post } from '../core/client.js';
import { setSession } from '../core/token-manager.js';
import { emit } from '../core/event-reporter.js';
import type { Session } from '../types/api.js';

export interface StartImpersonationInput {
  target_identity_id: string;
  reason: string;
  /** Optional expiry override; server enforces hard max (e.g., 30 min). */
  max_duration_minutes?: number;
}

export interface ActingAs {
  identity_id: string;
  display_name: string;
  expires_at: string;
}

interface StartResponse {
  access_token: string;
  refresh_token: string;
  session_id: string;
  expires_at: string;
  acting_as: ActingAs;
  identity: Session['identity'];
  aggregate: Session['aggregate'];
  session_meta: Session['session_meta'];
}

// ── Impersonation state (module-level pub-sub) ───────────────────────────
//
// /auth/v1/me does NOT carry acting_as (spec §D2.1). The session payload
// shows the impersonated identity, not the admin behind it. We track the
// admin → target relationship in module state so <ImpersonationBanner> can
// surface it across navigations (§11.10).

let currentActingAs: ActingAs | null = null;
const listeners = new Set<() => void>();

export function getCurrentActingAs(): ActingAs | null {
  return currentActingAs;
}

export function onActingAsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setActingAs(next: ActingAs | null): void {
  currentActingAs = next;
  for (const l of listeners) {
    try {
      l();
    } catch {
      // listener bugs must not crash the flow
    }
  }
}

// ── Public flow API ──────────────────────────────────────────────────────

export async function startImpersonation(input: StartImpersonationInput): Promise<StartResponse> {
  const { data } = await post<StartResponse>('/auth/v1/impersonation/start', {
    target_identity_id: input.target_identity_id,
    reason: input.reason,
    max_duration_minutes: input.max_duration_minutes,
  });

  await setSession({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at).getTime(),
    sessionId: data.session_id,
  });

  setActingAs(data.acting_as);

  void emit('impersonation.started', {
    admin_id: data.identity.identity_id,
    target_id: input.target_identity_id,
    reason: input.reason,
  });

  return data;
}

export async function endImpersonation(): Promise<void> {
  try {
    await post('/auth/v1/impersonation/end', {});
  } finally {
    setActingAs(null);
    // Regardless of server response, event always fires so audit trail is complete.
    void emit('impersonation.ended', {});
  }
}

/**
 * Record one action taken while impersonating, for the audit log.
 * Called by consumer apps on every state-changing operation under an
 * acting_as session.
 */
export function recordImpersonationAction(action: string, targetId: string): void {
  void emit('impersonation.action', { action, target_id: targetId });
}

/** Test-only reset of module state. */
export function __resetImpersonationForTests(): void {
  currentActingAs = null;
  listeners.clear();
}
