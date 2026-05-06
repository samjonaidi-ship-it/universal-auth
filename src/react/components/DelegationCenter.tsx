// @samjonaidi-ship-it/universal-auth | src/react/components/DelegationCenter.tsx | v0.2.0 | 2026-05-06 | BB
// Persistent UI for delegated grants — DELEGATION_CENTER_DESIGN_v1.0.md (LOCKED 2026-05-05).
//
// Tabs:
//   1. Active           = grants_from_me where revoked_at IS NULL
//   2. Granted to me    = grants_to_me where revoked_at IS NULL
//   3. History          = revoked grants from BOTH arrays + GDPR export
//   4. Effective access = real ABAC checks via useAccessBulk (v0.2 — wired to L3.3
//                         SDK now that the useAccess hook shipped). Per the
//                         design intent: shows what the CURRENT USER can actually
//                         do under each grant they've been GRANTED (grants_to_me).
//                         Grants the user authored (grants_from_me) are not checked
//                         here — that would require a per-grantee impersonation
//                         API which is Phase 2+.
//
// Locked decisions implemented:
//   D1 — bare component, NO grant flow templates (consumer plugs custom UI via onGrantCreated)
//   D2 — showEffectiveAccess defaults false; opt-in
//   D3 — persona-keyed catalogs ship in scope-catalogs.ts
//   D4 — 60s cache lives in useDelegatedGrants
//   D5 — revoke is button + confirm dialog, NOT swipe
//
// WCAG 2.2 AA: aria-labels, focus management on dialog open, keyboard reachable.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  useDelegatedGrants,
} from '../useDelegatedGrants.js';
import { useAccessBulk } from '../useAccessBulk.js';
import type { AccessCheck } from '../../core/abac.js';
import type {
  DelegatedGrant,
  Grantee,
  GranteeKind,
  ScopeMeta,
} from '../../flows/delegation.js';
import type { Identity } from '../../types/api.js';

export interface DelegationCenterProps {
  identity: Identity;
  onGrantCreated?: (grant: DelegatedGrant) => void;
  onGrantRevoked?: (grant: DelegatedGrant) => void;
  scopeCatalog: Record<string, ScopeMeta>;
  granteeLookup?: (query: string) => Promise<readonly Grantee[]>;
  /** D2: Effective-access tab (opt-in). Defaults false → tab hidden. */
  showEffectiveAccess?: boolean;
  /** GDPR export format. Only `'json'` is implemented client-side in v1.1. */
  exportFormat?: 'json' | 'csv';
  heading?: string;
}

type TabKey = 'active' | 'granted_to_me' | 'history' | 'effective_access';

// granteeLookup is part of the spec API surface (DELEGATION_CENTER_DESIGN_v1.0
// §3) and consumers pass it for the create-flow they own. The bare v1.1
// component (D1) doesn't render a built-in create flow, so the prop is
// re-exported for consumers but not consumed inside this file. Reference it
// with a type cast to keep the unused-import lint clean.
type _GranteeLookup = NonNullable<DelegationCenterProps['granteeLookup']>;
const _UNUSED_GRANTEE_LOOKUP: _GranteeLookup | undefined = undefined;

export function DelegationCenter({
  identity,
  onGrantCreated: _onGrantCreated,
  onGrantRevoked,
  scopeCatalog,
  granteeLookup: _granteeLookup,
  showEffectiveAccess = false,
  exportFormat = 'json',
  heading = 'Delegations',
}: DelegationCenterProps): ReactNode {
  void _onGrantCreated; // D1: bare component — consumer plugs its own create flow
  void _granteeLookup;
  void _UNUSED_GRANTEE_LOOKUP;
  void identity; // identity is required by the API surface but not used in v1.1 view-only paths

  const {
    grants_from_me,
    grants_to_me,
    loading,
    error,
    revoke,
    exportJson,
  } = useDelegatedGrants();

  const [tab, setTab] = useState<TabKey>('active');
  const [confirmGrant, setConfirmGrant] = useState<DelegatedGrant | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeGrants = useMemo(
    () => grants_from_me.filter((g) => g.revoked_at === null),
    [grants_from_me]
  );
  const grantedToMe = useMemo(
    () => grants_to_me.filter((g) => g.revoked_at === null),
    [grants_to_me]
  );
  const history = useMemo(
    () =>
      [...grants_from_me, ...grants_to_me]
        .filter((g) => g.revoked_at !== null)
        .sort((a, b) => (b.revoked_at ?? '').localeCompare(a.revoked_at ?? '')),
    [grants_from_me, grants_to_me]
  );

  const handleRevokeRequest = useCallback((g: DelegatedGrant) => {
    setConfirmGrant(g);
  }, []);

  const handleRevokeCancel = useCallback(() => {
    setConfirmGrant(null);
  }, []);

  const handleRevokeConfirm = useCallback(async () => {
    if (confirmGrant === null) return;
    setBusyId(confirmGrant.id);
    setLocalError(null);
    try {
      await revoke(confirmGrant.id);
      if (onGrantRevoked !== undefined) {
        onGrantRevoked({
          ...confirmGrant,
          revoked_at: new Date().toISOString(),
        });
      }
      setConfirmGrant(null);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not revoke grant.'
      );
    } finally {
      setBusyId(null);
    }
  }, [confirmGrant, onGrantRevoked, revoke]);

  const handleExport = useCallback(async () => {
    if (exportFormat !== 'json') {
      setLocalError(
        'CSV export is not yet implemented; falling back to JSON.'
      );
    }
    setExporting(true);
    try {
      const blob = await exportJson();
      triggerDownload(blob, `bb-delegated-grants-${dateStamp()}.json`);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Could not export grants.'
      );
    } finally {
      setExporting(false);
    }
  }, [exportFormat, exportJson]);

  if (loading) {
    return (
      <section
        className="bb-delegation-center"
        aria-label={heading}
        aria-busy="true"
      >
        <h2 className="bb-auth-heading">{heading}</h2>
        <p className="bb-auth-description">Loading…</p>
      </section>
    );
  }

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'active', label: 'Active', count: activeGrants.length },
    { key: 'granted_to_me', label: 'Granted to me', count: grantedToMe.length },
    { key: 'history', label: 'History', count: history.length },
  ];
  if (showEffectiveAccess) {
    tabs.push({ key: 'effective_access', label: 'Effective access' });
  }

  const errMsg = error ?? localError;

  return (
    <section className="bb-delegation-center" aria-label={heading}>
      <h2 className="bb-auth-heading">{heading}</h2>

      {errMsg !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {errMsg}
        </div>
      ) : null}

      <div className="bb-delegation-tabs" role="tablist" aria-label={heading}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`bb-delegation-panel-${t.key}`}
            id={`bb-delegation-tab-${t.key}`}
            className={
              tab === t.key
                ? 'bb-delegation-tab bb-delegation-tab-active'
                : 'bb-delegation-tab'
            }
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="bb-delegation-tab-count">{t.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`bb-delegation-panel-${tab}`}
        aria-labelledby={`bb-delegation-tab-${tab}`}
        className="bb-delegation-panel"
      >
        {tab === 'active' ? (
          <GrantList
            grants={activeGrants}
            scopeCatalog={scopeCatalog}
            onRevoke={handleRevokeRequest}
            busyId={busyId}
            emptyMessage="You haven't granted access to anyone."
            mode="from_me"
          />
        ) : null}

        {tab === 'granted_to_me' ? (
          <GrantList
            grants={grantedToMe}
            scopeCatalog={scopeCatalog}
            onRevoke={null}
            busyId={busyId}
            emptyMessage="No one has granted you delegated access yet."
            mode="to_me"
          />
        ) : null}

        {tab === 'history' ? (
          <>
            <div className="bb-delegation-history-toolbar">
              <button
                type="button"
                className="bb-auth-button bb-auth-button-link"
                onClick={() => void handleExport()}
                disabled={exporting}
                aria-label="Export delegated grants as JSON"
              >
                {exporting ? 'Exporting…' : 'Export as JSON'}
              </button>
            </div>
            <GrantList
              grants={history}
              scopeCatalog={scopeCatalog}
              onRevoke={null}
              busyId={busyId}
              emptyMessage="No revoked grants in your history."
              mode="history"
            />
          </>
        ) : null}

        {tab === 'effective_access' ? (
          <EffectiveAccessPanel
            grants={grantedToMe}
            scopeCatalog={scopeCatalog}
          />
        ) : null}
      </div>

      {confirmGrant !== null ? (
        <ConfirmRevokeDialog
          grant={confirmGrant}
          scopeCatalog={scopeCatalog}
          onCancel={handleRevokeCancel}
          onConfirm={() => void handleRevokeConfirm()}
          busy={busyId === confirmGrant.id}
        />
      ) : null}
    </section>
  );
}

// ── Effective Access panel (v0.2 — wires L3.3 ABAC engine) ────────────────
//
// Per ABAC_DESIGN_v1.0.md §5 + DELEGATION_CENTER_DESIGN_v1.0.md §1:
// For each ACTIVE grant in `grants_to_me` (current user is grantee), we run
// the ABAC engine over (scope, resource_match) → (resource_type, resource_id,
// action) tuples to confirm the grant's claimed permits actually decide
// `permit` against current policies + delegations.
//
// The grants_from_me direction can't be checked from the current session
// (would need impersonation API — Phase 2+). Tab focuses on grants_to_me
// because that's what the *current user* is operating under.

interface EffectiveAccessPanelProps {
  grants: readonly DelegatedGrant[];
  scopeCatalog: Record<string, ScopeMeta>;
}

interface ScopeCheckRow {
  grantId: string;
  granteeKind: GranteeKind;
  granteeId: string;
  scope: string;
  scopeLabel: string;
  scopeDanger: boolean;
  resourceType: string;
  resourceId: string;
  action: string;
}

/** Parse `<resource>:<action>` (action may contain colons). */
function parseScope(scope: string): { resource: string; action: string } | null {
  const idx = scope.indexOf(':');
  if (idx <= 0 || idx === scope.length - 1) return null;
  return { resource: scope.slice(0, idx), action: scope.slice(idx + 1) };
}

/** Build the flattened (grant × scope) check rows for active grants. */
function buildCheckRows(
  grants: readonly DelegatedGrant[],
  scopeCatalog: Record<string, ScopeMeta>
): ScopeCheckRow[] {
  const rows: ScopeCheckRow[] = [];
  for (const g of grants) {
    if (g.revoked_at !== null) continue;
    for (const scope of g.scopes) {
      const parsed = parseScope(scope);
      if (parsed === null) continue;
      const meta = scopeCatalog[scope];
      // Resource id: prefer resource_match.id, else '*' (engine treats as wildcard)
      const matchId =
        g.resource_match !== null && typeof g.resource_match === 'object'
          ? (g.resource_match as Record<string, unknown>)['id']
          : undefined;
      rows.push({
        grantId: g.id,
        granteeKind: g.grantee_kind,
        granteeId: g.grantee_id,
        scope,
        scopeLabel: meta?.label ?? scope,
        scopeDanger: meta?.danger === true,
        resourceType: parsed.resource,
        resourceId: typeof matchId === 'string' ? matchId : '*',
        action: parsed.action,
      });
    }
  }
  return rows;
}

function EffectiveAccessPanel({
  grants,
  scopeCatalog,
}: EffectiveAccessPanelProps): ReactNode {
  const rows = useMemo(
    () => buildCheckRows(grants, scopeCatalog),
    [grants, scopeCatalog]
  );

  // Memoize the bulk-check input so useAccessBulk's structural-key compare
  // doesn't re-fire on every render.
  const checks = useMemo<readonly AccessCheck[]>(
    () =>
      rows.map((r) => ({
        resource_type: r.resourceType,
        resource_id: r.resourceId,
        action: r.action,
      })),
    [rows]
  );

  const { allowed, loading, error } = useAccessBulk(checks);

  if (rows.length === 0) {
    return (
      <div className="bb-delegation-empty-state">
        <p>
          You haven&apos;t been granted any active delegations yet. When
          someone grants you scoped access, this tab will show what you
          can actually do under each grant.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="bb-delegation-empty-state"
        role="status"
        aria-busy="true"
      >
        <p>Checking access against current policies…</p>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div
        className="bb-auth-form-error bb-delegation-error"
        role="alert"
      >
        Could not verify access: {error.message}
      </div>
    );
  }

  return (
    <ul className="bb-delegation-effective-list" aria-label="Effective access">
      {rows.map((r, i) => {
        const ok = allowed?.[i] === true;
        return (
          <li
            key={`${r.grantId}::${r.scope}`}
            className={
              `bb-delegation-effective-row` +
              (ok ? ' bb-delegation-effective-row--permit' : ' bb-delegation-effective-row--deny') +
              (r.scopeDanger ? ' bb-delegation-effective-row--danger' : '')
            }
          >
            <span
              className="bb-delegation-effective-icon"
              aria-hidden="true"
            >
              {ok ? '✓' : '✗'}
            </span>
            <span className="bb-delegation-effective-label">
              {r.scopeLabel}
            </span>
            <span className="bb-delegation-effective-meta">
              {r.resourceType}{r.resourceId !== '*' ? ` #${r.resourceId}` : ''}
              {' · '}
              {r.action}
              {' · from '}
              {r.granteeKind} {r.granteeId.slice(0, 8)}
            </span>
            <span className="sr-only">
              {ok ? 'Permitted' : 'Currently denied by ABAC policy'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Grant list ─────────────────────────────────────────────────────────────

interface GrantListProps {
  grants: readonly DelegatedGrant[];
  scopeCatalog: Record<string, ScopeMeta>;
  onRevoke: ((g: DelegatedGrant) => void) | null;
  busyId: string | null;
  emptyMessage: string;
  mode: 'from_me' | 'to_me' | 'history';
}

function GrantList({
  grants,
  scopeCatalog,
  onRevoke,
  busyId,
  emptyMessage,
  mode,
}: GrantListProps): ReactNode {
  if (grants.length === 0) {
    return (
      <div
        className="bb-delegation-empty-state"
        role="status"
        aria-live="polite"
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="bb-delegation-list" role="list">
      {grants.map((g) => (
        <GrantCard
          key={g.id}
          grant={g}
          scopeCatalog={scopeCatalog}
          onRevoke={onRevoke}
          busy={busyId === g.id}
          mode={mode}
        />
      ))}
    </ul>
  );
}

// ── Grant card ─────────────────────────────────────────────────────────────

interface GrantCardProps {
  grant: DelegatedGrant;
  scopeCatalog: Record<string, ScopeMeta>;
  onRevoke: ((g: DelegatedGrant) => void) | null;
  busy: boolean;
  mode: 'from_me' | 'to_me' | 'history';
}

function GrantCard({
  grant,
  scopeCatalog,
  onRevoke,
  busy,
  mode,
}: GrantCardProps): ReactNode {
  const expiresIn = daysUntil(grant.effective_until);
  const granteeLabel = grant.grantee_id;

  return (
    <li className="bb-delegation-card" data-mode={mode}>
      <div className="bb-delegation-card-header">
        <span
          className="bb-delegation-grantee-icon"
          aria-hidden="true"
        >
          {iconForGrantee(grant.grantee_kind)}
        </span>
        <div className="bb-delegation-card-title-block">
          <span className="bb-delegation-card-title">{granteeLabel}</span>
          <span className="bb-delegation-card-subtitle">
            {humanizeKind(grant.grantee_kind)} · via{' '}
            {humanizeGrantedVia(grant.granted_via)}
          </span>
        </div>
      </div>

      <ul className="bb-delegation-scopes" role="list">
        {grant.scopes.map((scope) => {
          const meta = scopeCatalog[scope];
          const label = meta?.label ?? scope;
          const danger = meta?.danger === true;
          return (
            <li
              key={scope}
              className={
                danger
                  ? 'bb-delegation-scope bb-delegation-scope-danger'
                  : 'bb-delegation-scope'
              }
              title={meta?.explanation ?? scope}
            >
              {label}
            </li>
          );
        })}
      </ul>

      <div className="bb-delegation-card-meta">
        {grant.revoked_at !== null ? (
          <span className="bb-delegation-pill bb-delegation-pill-revoked">
            Revoked {formatDate(grant.revoked_at)}
          </span>
        ) : expiresIn !== null && expiresIn >= 0 ? (
          <span className="bb-delegation-pill bb-delegation-pill-active">
            Expires in {expiresIn} day{expiresIn === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="bb-delegation-pill bb-delegation-pill-expired">
            Expired
          </span>
        )}
      </div>

      {onRevoke !== null && grant.revoked_at === null ? (
        <div className="bb-delegation-card-actions">
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={() => onRevoke(grant)}
            disabled={busy}
            aria-label={`Revoke grant to ${granteeLabel}`}
          >
            {busy ? '…' : 'Revoke'}
          </button>
        </div>
      ) : null}
    </li>
  );
}

// ── Confirm-revoke dialog (D5) ────────────────────────────────────────────

interface ConfirmRevokeDialogProps {
  grant: DelegatedGrant;
  scopeCatalog: Record<string, ScopeMeta>;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}

function ConfirmRevokeDialog({
  grant,
  scopeCatalog,
  onCancel,
  onConfirm,
  busy,
}: ConfirmRevokeDialogProps): ReactNode {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const hasDangerScope = grant.scopes.some(
    (s) => scopeCatalog[s]?.danger === true
  );

  // Focus management on open.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Escape closes dialog (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="bb-delegation-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      <div
        className={
          hasDangerScope
            ? 'bb-delegation-confirm-dialog bb-delegation-confirm-dialog-danger'
            : 'bb-delegation-confirm-dialog'
        }
      >
        <h3 id={titleId} className="bb-delegation-confirm-title">
          Revoke this grant?
        </h3>
        <p id={descId} className="bb-delegation-confirm-body">
          {hasDangerScope
            ? 'This grant includes high-impact scopes. Revoking takes effect immediately.'
            : 'Revoking takes effect immediately. The grantee will lose access right away.'}
        </p>
        <div className="bb-delegation-confirm-actions">
          <button
            type="button"
            ref={cancelRef}
            className="bb-auth-button bb-auth-button-link"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={
              hasDangerScope
                ? 'bb-auth-button bb-auth-button-primary bb-delegation-confirm-danger-action'
                : 'bb-auth-button bb-auth-button-primary'
            }
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '…' : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatDate(iso: string): string {
  if (iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function iconForGrantee(kind: GranteeKind): string {
  switch (kind) {
    case 'identity':
      return '👤';
    case 'agent':
      return '🤖';
    case 'iot_device':
      return '📡';
    case 'app':
      return '🧩';
    case 'api_key':
      return '🔑';
    case 'external_email':
      return '✉';
  }
}

function humanizeKind(kind: GranteeKind): string {
  switch (kind) {
    case 'identity':
      return 'Person';
    case 'agent':
      return 'Agent';
    case 'iot_device':
      return 'IoT device';
    case 'app':
      return 'App';
    case 'api_key':
      return 'API key';
    case 'external_email':
      return 'External email';
  }
}

function humanizeGrantedVia(v: DelegatedGrant['granted_via']): string {
  switch (v) {
    case 'user_consent':
      return 'user consent';
    case 'admin_provision':
      return 'admin provision';
    case 'contract':
      return 'contract';
    case 'automation':
      return 'automation';
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
