// @samjonaidi-ship-it/universal-auth | src/flows/recovery.ts | v1.3.0 | 2026-09-17 | BB
//
// v1.3.0 (P4.7): signOut() accepts an optional `expectedSessionId`. Consumers
//   use signOut() for two different intents — an explicit user-initiated
//   sign-out (act on "current session", always correct) and cleanup fired by
//   a stale signal that believes SOME session died (a background
//   /session/refresh that finally 401'd, a liveness probe, an offline-queue
//   401 mid-drain) but was not necessarily this app's CURRENT session by the
//   time it runs. Without scoping, cleanup blindly revoked+cleared whatever
//   session was current at call time — which, if the user had re-authed in
//   the interim, was a brand-new, live session unrelated to the original
//   failure. Passing the session id captured at the moment the stale signal
//   fired makes this a no-op when the session has since moved on. See
//   core/token-manager.ts v1.3.2 for the matching guard on the refresh side.
//
// v1.2.0 (2026-09-06): the sign-out event is `session.logout`, not `logout`.
// It was the ONLY dotless name in this SDK's 28-event vocabulary — every other
// one is `{feature}.{suffix}` (login.success, session.revoked,
// session.refreshed, session.heartbeat). BB_ControlTower's /events/v1/ingest
// validates against an exact-match allowlist that holds no dotless type, so
// every `logout` this SDK has ever emitted was dropped at the door as
// UNKNOWN_EVENT_TYPE and never reached ct_bff.app_events. Measured on the
// bb-controltower-bff log source 2026-09-06: 13 events discarded over
// 09-03 13:54 → 09-06 16:56 from bb_express alone.
//
// `session.logout` fits both vocabularies — this SDK already emits
// session.refreshed / session.revoked, and CT already registers
// session.expired / session.revoked. Nothing consumed the old name (it was
// 100% dropped), so this is a rename with no deprecation window; the CT
// registration must land before consumers upgrade.
// Session/credential recovery flows — logout-all, passkey removal, device revoke.
// Full identity-recovery (IDV) is Phase 2+ per §Out-of-scope.
//
// Endpoints (§3.1):
//   POST /auth/v1/session/revoke       — this session
//   POST /auth/v1/session/revoke-all   — all sessions for identity (5/hr/identity)
//   GET  /auth/v1/sessions             — list active sessions (device UI)
//
// v1.0.1 (D7): signOut() flushes pending settings patches BEFORE clearSession()
// so debounced PUTs reach the server. The flush is best-effort — a network
// failure here must not stop the local sign-out.
//
// v1.1.1 (2026-06-02): signOut() now passes the current refresh_token to
// /session/revoke. Previously it sent an empty body, so the server revoked only
// the session row and left the refresh token VALID — a surviving client copy
// could silently re-authenticate on reload (logout appeared to "bypass" the
// PIN pad). Sending the token lets the server revoke it (targeted →
// multi-device safe).

import { post, get } from '../core/client.js';
import { clearSession, getCurrentSessionId } from '../core/token-manager.js';
import { getRefreshToken } from '../core/storage.js';
import { emit } from '../core/event-reporter.js';
import { clearEntitlements } from '../core/entitlements.js';
import { flushSettingsNow } from '../core/settings-sync.js';

export interface ActiveSession {
  session_id: string;
  device_id: string;
  user_agent_summary: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

/**
 * Sign out the current session.
 *
 * v1.0.1 (D7): flushes any debounced settings patch BEFORE clearing the
 * session, so a user toggling a setting and immediately signing out doesn't
 * lose the edit. The flush is best-effort.
 *
 * v1.3.0 (P4.7): `expectedSessionId` scopes this call to a SPECIFIC session.
 * Consumers use signOut() for two different intents: (a) an explicit,
 * user-initiated "log me out", where "current session" is always the right
 * target, and (b) cleanup fired by a stale signal — a background
 * /session/refresh that finally 401'd, a liveness probe, an offline-queue
 * drain hitting 401 — which believes SOME session died but was not
 * necessarily this app's CURRENT one. For (b), the caller should capture
 * getCurrentSessionId() at the moment it detected the failure and pass it
 * here. If the session has since moved on (a race: the user re-authed while
 * the stale signal was still in flight), this is a no-op — there is nothing
 * to revoke or clear, and doing so would tear down a perfectly good newer
 * session for a failure that no longer describes it. Omit the option for
 * intent (a); it is not set by anything here on the caller's behalf.
 */
export async function signOut(
  options: { signal?: AbortSignal; expectedSessionId?: string } = {},
): Promise<void> {
  if (
    options.expectedSessionId !== undefined &&
    options.expectedSessionId !== getCurrentSessionId()
  ) {
    return;
  }
  try {
    // Best-effort flush of pending settings patches before the access token
    // disappears. Failures are non-fatal — local sign-out still proceeds.
    try {
      await flushSettingsNow(
        options.signal !== undefined ? { signal: options.signal } : {},
      );
    } catch {
      // Network / 4xx — we'll lose those patches. Better than blocking sign-out.
    }
    // Read the current refresh token so the server can revoke IT, not just the
    // session row. Best-effort — if it's missing we still revoke the session
    // (and clearSession() below wipes local state regardless).
    let refreshToken: string | null = null;
    try {
      refreshToken = await getRefreshToken();
    } catch {
      // Storage read failure — fall back to a bodyless revoke.
    }
    await post(
      '/auth/v1/session/revoke',
      refreshToken ? { refresh_token: refreshToken } : {},
      options.signal !== undefined ? { signal: options.signal } : {},
    );
  } catch {
    // Even if server call fails (network / already revoked), local cleanup
    // must still happen — `finally` fires.
  } finally {
    void emit('session.logout', { forced: false });
    clearEntitlements();
    await clearSession();
  }
}

/**
 * Sign out on ALL devices + invalidate every session. Use case: lost phone,
 * suspected compromise. Destructive; no confirmation prompt in this API
 * (that's the UI layer's job).
 */
export async function signOutEverywhere(
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  try {
    try {
      await flushSettingsNow(
        options.signal !== undefined ? { signal: options.signal } : {},
      );
    } catch {
      // Same best-effort policy as signOut.
    }
    await post(
      '/auth/v1/session/revoke-all',
      {},
      options.signal !== undefined ? { signal: options.signal } : {},
    );
  } catch {
    // Even if server call fails (network / already revoked), local cleanup
    // must still happen — `finally` fires. Consistent with signOut().
  } finally {
    void emit('session.logout', { forced: false, scope: 'all_devices' });
    clearEntitlements();
    await clearSession();
  }
}

/**
 * List active sessions for `/me/devices` device-management UI.
 */
export async function listSessions(
  options: { signal?: AbortSignal } = {},
): Promise<readonly ActiveSession[]> {
  const { data } = await get<{ sessions: readonly ActiveSession[] }>(
    '/auth/v1/sessions',
    options.signal !== undefined ? { signal: options.signal } : {},
  );
  return data.sessions;
}

/**
 * Revoke a specific session by id (kicks another device).
 */
export async function revokeSession(
  sessionId: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await post(
    '/auth/v1/sessions/revoke',
    { session_id: sessionId },
    options.signal !== undefined ? { signal: options.signal } : {},
  );
  void emit('session.revoked', { reason: 'user_initiated', target_session: sessionId });
}
