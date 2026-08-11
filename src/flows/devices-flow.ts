// @samjonaidi-ship-it/universal-auth | src/flows/devices-flow.ts | v1.0.0 | 2026-08-10 | BB
// "Your devices" — see where you are signed in, and sign a device out.
//   GET  /auth/v1/devices          list one entry per device
//   POST /auth/v1/sessions/revoke  { device_id } → cut that device
//
// P4.11. Goes through the SDK client rather than a raw fetch for the reason
// P4.1 established: an /auth/v1/* call made outside the client silently skips
// the protocol/app/version headers, X-Device-Id, Idempotency-Key, the default
// timeout and typed error envelopes. Adding a new raw fetch here would undo
// the cleanup that just landed.
//
// WHY A DEVICE IS NOT A SESSION. A session row lives 8 hours; a refresh token
// lives 90 days. A phone left in a truck overnight has no live session and is
// still signed in — it mints a fresh session the moment it is opened. The BFF
// therefore builds this list from live refresh-token chains grouped by
// refresh_family_id, and `device_id` here IS that family id.

import { get, post } from '../core/client.js';

// ── Public types ──────────────────────────────────────────────────────────

export interface AuthDevice {
  /** Refresh-token family id — the stable identifier for one physical device. */
  device_id: string;
  /**
   * False for legacy tokens issued before the family id existed. Those cannot
   * be reached by the family sweep, so the UI must not offer a sign-out button
   * that would quietly do nothing.
   */
  revocable: boolean;
  /** The device making this request. */
  is_current: boolean;
  /** DPoP-bound (P4.6). An unbound device predates binding or fell back. */
  is_bound: boolean;
  ip: string | null;
  user_agent: string | null;
  /**
   * When the device last checked in — the issue time of its newest live
   * refresh token. NOT `last_used_at`, which the BFF only stamps on the
   * PREVIOUS token as it rotates and is therefore always null on a live one.
   */
  last_seen_at: string | null;
  expires_at: string | null;
}

interface DevicesResponse {
  devices?: AuthDevice[];
}

// ── Flow ──────────────────────────────────────────────────────────────────

/**
 * List the devices that can still sign in as this identity, current device
 * first then most recently seen.
 *
 * Requires a live session; the client attaches the bearer.
 */
export async function listDevices(
  options: { signal?: AbortSignal } = {},
): Promise<AuthDevice[]> {
  const { data } = await get<DevicesResponse>('/auth/v1/devices', {
    ...(options.signal !== undefined && { signal: options.signal }),
  });
  return Array.isArray(data?.devices) ? data.devices : [];
}

/**
 * Sign out one device: revokes its refresh-token family, every session rolled
 * from it, and notifies any live stream that device holds.
 *
 * Revoking the CURRENT device is allowed and signs this client out too — the
 * caller decides whether to warn first; that is a UI question, not an API one.
 */
export async function revokeDevice(
  input: { deviceId: string },
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await post<{ ok: boolean }>(
    '/auth/v1/sessions/revoke',
    { device_id: input.deviceId },
    { ...(options.signal !== undefined && { signal: options.signal }) },
  );
  // No event emitted here. The BFF already writes a durable `session.revoked`
  // for the affected identity, and a client-side duplicate would double-count
  // it — the mistake the P4.1 audit caught with pin.set/pin.cleared.
}
