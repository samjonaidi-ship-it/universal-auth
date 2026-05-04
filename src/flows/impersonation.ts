// @samjonaidi-ship-it/universal-auth | src/flows/impersonation.ts | v1.0.4 | 2026-05-04 | BB
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
//
// v1.0.1 (C9): when `endImpersonation`'s server call fails, we still clear
// local state (better UX — UI returns to admin view immediately) but emit
// `impersonation.local_clear_drift` so the audit log captures the
// inconsistency. Sam approved this trade-off in the 2026-05-01 audit triage.
//
// v1.0.4 (L2.18): expose `onLocalClearDrift` so the React layer
// (useImpersonation) can surface "audit drift" to admins via UI banner. The
// drift event still flows to the audit log as before — this is purely an
// additional in-process pub-sub channel for UI consumers.

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

// ── Drift event pub-sub (v1.0.4 L2.18) ───────────────────────────────────
//
// Mirrors the audit-log event `impersonation.local_clear_drift` onto an
// in-process channel so React consumers can render a "audit drift" banner.
// The audit-log emit still happens — this is additive.

/**
 * Drift event fired when `endImpersonation` clears local state but the
 * server-side end call did not succeed. Audit log already captures this
 * (see `impersonation.local_clear_drift` event); this in-process channel
 * lets UI surface it to admins.
 */
export interface ImpersonationDriftEvent {
  reason: 'server_call_failed';
  error_message: string;
  error_name: string;
  /** epoch ms — when the drift happened in this tab */
  timestamp: number;
}

const driftListeners = new Set<(event: ImpersonationDriftEvent) => void>();

/**
 * Subscribe to local-clear-drift events. Returns an unsubscribe function.
 * Used by `useImpersonation` to drive a `lastDriftEvent` state slice.
 */
export function onLocalClearDrift(
  listener: (event: ImpersonationDriftEvent) => void
): () => void {
  driftListeners.add(listener);
  return () => {
    driftListeners.delete(listener);
  };
}

function fireDrift(event: ImpersonationDriftEvent): void {
  for (const l of driftListeners) {
    try {
      l(event);
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
  let serverError: unknown = null;
  try {
    await post('/auth/v1/impersonation/end', {});
  } catch (err) {
    // v1.0.1 C9 — capture for the drift event below; do NOT rethrow. UI
    // reverts to admin view immediately; audit log catches the drift.
    serverError = err;
  } finally {
    setActingAs(null);
    if (serverError !== null) {
      // Local-clear-drift signal: client cleared acting_as without the server
      // confirming the end. Audit log + ops dashboards should treat this as a
      // soft-anomaly (not a security incident, but worth a follow-up reconciliation).
      const driftEvent: ImpersonationDriftEvent = {
        reason: 'server_call_failed',
        error_message:
          serverError instanceof Error ? serverError.message : String(serverError),
        error_name: serverError instanceof Error ? serverError.name : 'Unknown',
        timestamp: Date.now(),
      };
      void emit('impersonation.local_clear_drift', {
        reason: driftEvent.reason,
        error_message: driftEvent.error_message,
        error_name: driftEvent.error_name,
      });
      // v1.0.4 (L2.18): notify in-process subscribers (useImpersonation hook)
      // so UIs can render a drift banner.
      fireDrift(driftEvent);
    }
    // Regardless of server response, the canonical "ended" event always fires
    // so audit trail records the local termination point.
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
  driftListeners.clear();
}
