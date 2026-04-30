// @bainbridgebuilders/universal-auth | src/flows/permission-grants.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// Browser/device permission-grant recording.
//
// Per spec:
//   §3.3   POST /identity/v1/permission-grants — records grant/deny/revoke
//   §5.6.1 Browser/device permissions (L3a)
//   §6.1   Emits permission.granted / .denied / .revoked
//
// Wire: CalExp5 FirstLaunchScreen.jsx migrates here per §13.5.2.
//
// v1.0.0-rc.4 (2026-04-30): added `listPermissionGrants()` and
// `revokePermissionGrant()` for <PermissionCenter>. Endpoints already live
// (CT BFF identity-v1.js v1.4.0). See PERSONA_PCP_DESIGN.md §5.1.

import { get, post } from '../core/client.js';
import { emit } from '../core/event-reporter.js';

export type PermissionKey =
  | 'geolocation'
  | 'notifications'
  | 'camera'
  | 'microphone'
  | 'push'
  | 'background_sync';

export type PermissionState = 'granted' | 'denied' | 'revoked';

export interface RecordGrantInput {
  permission_key: PermissionKey | string;
  state: PermissionState;
  /** True if the browser prompted the user before this state was reached. */
  prompted?: boolean;
}

export async function recordPermissionGrant(input: RecordGrantInput): Promise<void> {
  await post('/identity/v1/permission-grants', input);

  const eventType =
    input.state === 'granted'
      ? 'permission.granted'
      : input.state === 'denied'
        ? 'permission.denied'
        : 'permission.revoked';

  void emit(eventType, {
    permission_key: input.permission_key,
    prompted: input.prompted ?? false,
  });
}

/**
 * Helper for the common "request + record" pattern. Calls `navigator.permissions`
 * where available, falls back to feature-specific APIs (e.g., Notification.requestPermission()).
 * Returns the resulting state.
 */
export async function requestAndRecord(
  permission_key: PermissionKey
): Promise<PermissionState> {
  let state: PermissionState = 'denied';
  let prompted = true;

  try {
    if (permission_key === 'notifications' && typeof Notification !== 'undefined') {
      const result = await Notification.requestPermission();
      state = result === 'granted' ? 'granted' : 'denied';
    } else if (
      typeof navigator !== 'undefined' &&
      'permissions' in navigator &&
      navigator.permissions.query
    ) {
      const status = await navigator.permissions.query({
        name: permission_key as PermissionName,
      });
      state = status.state === 'granted' ? 'granted' : 'denied';
      prompted = status.state !== 'prompt';
    }
  } catch {
    state = 'denied';
  }

  await recordPermissionGrant({ permission_key, state, prompted });
  return state;
}

// ── List + revoke (used by <PermissionCenter>) ─────────────────────────────

export interface ListedPermissionGrant {
  id: string;
  permission_key: string;
  state: PermissionState | 'prompt';
  prompted: boolean;
  device_id: string | null;
  user_agent: string | null;
  recorded_at: string;
  scope: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
}

/**
 * List recorded permission grants for the current identity.
 * The CT BFF returns the full history (up to 500 rows) — typically the UI
 * only cares about the most recent grant per `permission_key`.
 */
export async function listPermissionGrants(
  filterKey?: string
): Promise<readonly ListedPermissionGrant[]> {
  const path =
    filterKey !== undefined && filterKey !== ''
      ? `/identity/v1/permission-grants?key=${encodeURIComponent(filterKey)}`
      : '/identity/v1/permission-grants';
  const { data } = await get<{ grants: readonly ListedPermissionGrant[] }>(path);
  return data.grants;
}

/**
 * Soft-revoke a permission grant.
 * Note: this only marks the SERVER record as revoked; the browser-side
 * permission (e.g., navigator.permissions for `geolocation`) cannot be
 * revoked programmatically — the user must visit browser settings.
 */
export async function revokePermissionGrant(
  grantId: string,
  reason?: string
): Promise<void> {
  await post(`/identity/v1/permission-grants/${encodeURIComponent(grantId)}/revoke`, {
    revoked_reason: reason,
  });
  void emit('permission.revoked', { grant_id: grantId });
}
