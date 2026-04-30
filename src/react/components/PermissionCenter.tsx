// @bainbridgebuilders/universal-auth | src/react/components/PermissionCenter.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Persistent UI for browser/device permissions — per PERSONA_PCP_DESIGN.md §5.1
// (L3a) and §10 (UX/UI implications).
//
// Mirrors the W3C Permissions API state but uses the server-side
// `permission_grants` record as the source of truth (for audit + cross-device
// awareness). One row per `permission_key`, deduped to the most recent grant.
//
// Why server-record vs navigator.permissions only:
//   - navigator.permissions can't be revoked programmatically (browser-side
//     limitation). Our server record CAN be marked revoked, which lets the
//     SDK enforce server-side and prompt the user to also visit browser
//     settings if they want to fully revoke OS-level access.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  listPermissionGrants,
  revokePermissionGrant,
  type ListedPermissionGrant,
  type PermissionState,
} from '../../flows/permission-grants.js';

export interface PermissionCenterProps {
  /** If supplied, only render rows for these `permission_key` values. */
  filter?: readonly string[];
  /** Fired after a successful revoke. */
  onRevoked?: (grant: ListedPermissionGrant) => void;
  /**
   * App-pluggable re-request handler. If supplied, "Request" / "Re-request"
   * buttons appear for keys whose state is `denied`, `prompt`, or `revoked`.
   * Implementer is responsible for the underlying browser-prompt logic
   * (see `flows/permission-grants.requestAndRecord` for a default helper).
   */
  onRequest?: (key: string) => Promise<PermissionState>;
  /** Heading override. */
  heading?: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  geolocation: 'Location',
  notifications: 'Notifications',
  camera: 'Camera',
  microphone: 'Microphone',
  storage_persistent: 'Persistent storage',
  background_sync: 'Background sync',
  clipboard: 'Clipboard',
  motion: 'Motion sensors',
  bluetooth: 'Bluetooth',
  usb: 'USB devices',
  midi: 'MIDI devices',
  screen_wake_lock: 'Keep screen on',
  persistent_notification: 'Persistent notifications',
  push: 'Push notifications',
};

interface ViewState {
  loading: boolean;
  error: string | null;
  rows: readonly ListedPermissionGrant[];
}

const INITIAL: ViewState = { loading: true, error: null, rows: [] };

export function PermissionCenter({
  filter,
  onRevoked,
  onRequest,
  heading = 'Device permissions',
}: PermissionCenterProps): ReactNode {
  const [view, setView] = useState<ViewState>(INITIAL);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setView((v) => ({ ...v, loading: true, error: null }));
    try {
      const grants = await listPermissionGrants();
      // Dedupe: keep only the most recent record per permission_key (BFF
      // returns DESC by recorded_at, so first hit wins).
      const seen = new Set<string>();
      const deduped: ListedPermissionGrant[] = [];
      for (const g of grants) {
        if (seen.has(g.permission_key)) continue;
        seen.add(g.permission_key);
        deduped.push(g);
      }
      setView({ loading: false, error: null, rows: deduped });
    } catch (err) {
      setView({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load permissions.',
        rows: [],
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRevoke = useCallback(
    async (grant: ListedPermissionGrant): Promise<void> => {
      setBusyId(grant.id);
      try {
        await revokePermissionGrant(grant.id);
        if (onRevoked !== undefined) {
          onRevoked({ ...grant, revoked_at: new Date().toISOString() });
        }
        await reload();
      } catch (err) {
        setView((v) => ({
          ...v,
          error: err instanceof Error ? err.message : 'Could not revoke permission.',
        }));
      } finally {
        setBusyId(null);
      }
    },
    [onRevoked, reload]
  );

  const handleRequest = useCallback(
    async (key: string): Promise<void> => {
      if (onRequest === undefined) return;
      setBusyId(`req:${key}`);
      try {
        await onRequest(key);
        await reload();
      } catch (err) {
        setView((v) => ({
          ...v,
          error: err instanceof Error ? err.message : 'Could not request permission.',
        }));
      } finally {
        setBusyId(null);
      }
    },
    [onRequest, reload]
  );

  const visibleRows = useMemo(() => {
    if (filter === undefined || filter.length === 0) return view.rows;
    const allow = new Set(filter);
    return view.rows.filter((r) => allow.has(r.permission_key));
  }, [filter, view.rows]);

  if (view.loading) {
    return (
      <section className="bb-auth-permission-center" aria-label={heading} aria-busy="true">
        <h2 className="bb-auth-heading">{heading}</h2>
        <p className="bb-auth-description">Loading…</p>
      </section>
    );
  }

  return (
    <section className="bb-auth-permission-center" aria-label={heading}>
      <h2 className="bb-auth-heading">{heading}</h2>

      {view.error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {view.error}
        </div>
      ) : null}

      {visibleRows.length === 0 ? (
        <p className="bb-auth-description">No permission records yet.</p>
      ) : (
        <ul className="bb-auth-permission-center-list" role="list">
          {visibleRows.map((g) => {
            const label = DEFAULT_LABELS[g.permission_key] ?? humanize(g.permission_key);
            const effectiveState = g.revoked_at !== null ? 'revoked' : g.state;
            const expiresIn =
              g.expires_at !== null ? daysUntil(g.expires_at) : null;
            const reqBusy = busyId === `req:${g.permission_key}`;
            const revBusy = busyId === g.id;
            const canRevoke = g.revoked_at === null && g.state === 'granted';
            const canRequest =
              onRequest !== undefined &&
              (g.revoked_at !== null ||
                g.state === 'denied' ||
                effectiveState === 'prompt');

            return (
              <li
                key={g.id}
                className={`bb-auth-permission-center-row bb-auth-permission-state-${effectiveState}`}
              >
                <div className="bb-auth-permission-center-row-main">
                  <span className="bb-auth-permission-center-row-title">{label}</span>
                  <span className="bb-auth-permission-center-row-meta">
                    <span
                      className={`bb-auth-permission-pill bb-auth-permission-pill-${effectiveState}`}
                      aria-label={`State: ${stateLabel(effectiveState)}`}
                    >
                      {stateLabel(effectiveState)}
                    </span>
                    {g.scope !== null && g.scope !== '' ? (
                      <span> · {g.scope}</span>
                    ) : null}
                    {expiresIn !== null && expiresIn >= 0 ? (
                      <span> · Expires in {expiresIn} days</span>
                    ) : null}
                    {expiresIn !== null && expiresIn < 0 ? (
                      <span> · Expired</span>
                    ) : null}
                  </span>
                </div>
                <div className="bb-auth-permission-center-row-actions">
                  {canRevoke ? (
                    <button
                      type="button"
                      className="bb-auth-button bb-auth-button-link"
                      onClick={() => void handleRevoke(g)}
                      disabled={revBusy}
                      aria-label={`Revoke ${label}`}
                    >
                      {revBusy ? '…' : 'Revoke'}
                    </button>
                  ) : null}
                  {canRequest ? (
                    <button
                      type="button"
                      className="bb-auth-button bb-auth-button-primary"
                      onClick={() => void handleRequest(g.permission_key)}
                      disabled={reqBusy}
                      aria-label={`Re-request ${label}`}
                    >
                      {reqBusy ? '…' : 'Re-request'}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function stateLabel(state: PermissionState | 'prompt' | 'revoked'): string {
  switch (state) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'revoked':
      return 'Revoked';
    case 'prompt':
      return 'Not asked';
  }
}

function daysUntil(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = t - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
