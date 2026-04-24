// @bb/universal-auth | src/flows/recovery.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Session/credential recovery flows — logout-all, passkey removal, device revoke.
// Full identity-recovery (IDV) is Phase 2+ per §Out-of-scope.
//
// Endpoints (§3.1):
//   POST /auth/v1/session/revoke       — this session
//   POST /auth/v1/session/revoke-all   — all sessions for identity (5/hr/identity)
//   GET  /auth/v1/sessions             — list active sessions (device UI)

import { post, get } from '../core/client.js';
import { clearSession } from '../core/token-manager.js';
import { emit } from '../core/event-reporter.js';
import { clearEntitlements } from '../core/entitlements.js';

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
 */
export async function signOut(): Promise<void> {
  try {
    await post('/auth/v1/session/revoke', {});
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
export async function signOutEverywhere(): Promise<void> {
  try {
    await post('/auth/v1/session/revoke-all', {});
  } finally {
    void emit('logout', { forced: false, scope: 'all_devices' });
    clearEntitlements();
    await clearSession();
  }
}

/**
 * List active sessions for `/me/devices` device-management UI.
 */
export async function listSessions(): Promise<readonly ActiveSession[]> {
  const { data } = await get<{ sessions: readonly ActiveSession[] }>('/auth/v1/sessions');
  return data.sessions;
}

/**
 * Revoke a specific session by id (kicks another device).
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await post('/auth/v1/sessions/revoke', { session_id: sessionId });
  void emit('session.revoked', { reason: 'user_initiated', target_session: sessionId });
}
