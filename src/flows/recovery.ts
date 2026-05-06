// @samjonaidi-ship-it/universal-auth | src/flows/recovery.ts | v1.1.0 | 2026-05-06 | BB
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

import { post, get } from '../core/client.js';
import { clearSession } from '../core/token-manager.js';
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
 */
export async function signOut(
  options: { signal?: AbortSignal } = {},
): Promise<void> {
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
    await post(
      '/auth/v1/session/revoke',
      {},
      options.signal !== undefined ? { signal: options.signal } : {},
    );
  } catch {
    // Even if server call fails (network / already revoked), local cleanup
    // must still happen — `finally` fires.
  } finally {
    void emit('logout', { forced: false });
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
    void emit('logout', { forced: false, scope: 'all_devices' });
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
