// @bb/universal-auth | src/flows/permission-grants.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Browser/device permission-grant recording.
//
// Per spec:
//   §3.3   POST /identity/v1/permission-grants — records grant/deny/revoke
//   §6.1   Emits permission.granted / .denied / .revoked
//
// Wire: CalExp5 FirstLaunchScreen.jsx migrates here per §13.5.2.

import { post } from '../core/client.js';
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
