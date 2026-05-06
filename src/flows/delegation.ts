// @samjonaidi-ship-it/universal-auth | src/flows/delegation.ts | v0.1.0 | 2026-05-06 | BB
// Delegated grants — list/create/revoke/export.
//
// Per DELEGATION_CENTER_DESIGN_v1.0.md (LOCKED 2026-05-05):
//   §3   Component API surface
//   §4   Backend endpoints (live in v1.0 via migration 070)
//   §10  D1-D5 locked decisions
//
// Endpoints (CT BFF identity-v1.js):
//   GET    /identity/v1/delegated-grants
//          → { grants_from_me, grants_to_me, protocol_version }
//   POST   /identity/v1/delegated-grants
//          → { grant, protocol_version }
//   DELETE /identity/v1/delegated-grants/:id
//          → { ok: true, protocol_version }
//
// `exportGrantsAsJson()` is implemented client-side for v1.1
// (server-side /export endpoint is deferred per spec §4 NEW; not yet shipped).

import { get, post, del } from '../core/client.js';
import { emit } from '../core/event-reporter.js';

// ── Public types ──────────────────────────────────────────────────────────

export type GranteeKind =
  | 'identity'
  | 'agent'
  | 'iot_device'
  | 'app'
  | 'api_key'
  | 'external_email';

export type GrantedVia =
  | 'user_consent'
  | 'admin_provision'
  | 'contract'
  | 'automation';

export interface DelegatedGrant {
  id: string;
  grantor_id: string;
  grantee_kind: GranteeKind;
  grantee_id: string;
  scopes: readonly string[];
  resource_match: Record<string, unknown> | null;
  effective_from: string;
  effective_until: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_reason: string | null;
  granted_via: GrantedVia;
  audit_metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ScopeMeta {
  label: string;
  danger?: boolean;
  explanation?: string;
}

export interface Grantee {
  kind: GranteeKind;
  id: string;
  display_name: string;
  avatar_url?: string;
}

export interface CreateDelegatedGrantInput {
  grantee_kind: GranteeKind;
  grantee_id: string;
  granted_via: GrantedVia;
  scopes: readonly string[];
  resource_match?: Record<string, unknown>;
  effective_until?: string;
}

export interface ListDelegatedGrantsResult {
  grants_from_me: readonly DelegatedGrant[];
  grants_to_me: readonly DelegatedGrant[];
}

// ── Wire shapes ───────────────────────────────────────────────────────────

interface ListResponse {
  grants_from_me: DelegatedGrant[];
  grants_to_me: DelegatedGrant[];
  protocol_version: string;
}

interface CreateResponse {
  grant: DelegatedGrant;
  protocol_version: string;
}

interface DeleteResponse {
  ok: true;
  protocol_version: string;
}

// ── API ───────────────────────────────────────────────────────────────────

/**
 * List delegated grants for the current identity. Splits the response into
 * "from me" (where I am the grantor) and "to me" (where I am the grantee).
 * The CT BFF returns BOTH arrays in one round-trip.
 *
 * v1.1.0-rc.3 (P1-D fixup): accepts `signal` to align with the rest of the
 * public surface.
 */
export async function listDelegatedGrants(
  options: { signal?: AbortSignal } = {},
): Promise<ListDelegatedGrantsResult> {
  const { data } = await get<ListResponse>(
    '/identity/v1/delegated-grants',
    options.signal !== undefined ? { signal: options.signal } : {},
  );
  return {
    grants_from_me: data.grants_from_me ?? [],
    grants_to_me: data.grants_to_me ?? [],
  };
}

/**
 * Create a new delegated grant. Returns the canonical grant row.
 * Emits `delegation.granted` event.
 *
 * v1.1.0-rc.3 (P1-D fixup): accepts `signal`.
 */
export async function createDelegatedGrant(
  input: CreateDelegatedGrantInput,
  options: { signal?: AbortSignal } = {},
): Promise<DelegatedGrant> {
  const body: Record<string, unknown> = {
    grantee_kind: input.grantee_kind,
    grantee_id: input.grantee_id,
    granted_via: input.granted_via,
    scopes: input.scopes,
  };
  if (input.resource_match !== undefined) body.resource_match = input.resource_match;
  if (input.effective_until !== undefined) body.effective_until = input.effective_until;

  const { data } = await post<CreateResponse>(
    '/identity/v1/delegated-grants',
    body,
    options.signal !== undefined ? { signal: options.signal } : {},
  );

  void emit('delegation.granted', {
    grant_id: data.grant.id,
    grantee_kind: data.grant.grantee_kind,
    scope_count: data.grant.scopes.length,
  });

  return data.grant;
}

/**
 * Revoke a delegated grant. Server marks `revoked_at = now()`.
 * Emits `delegation.revoked` event.
 *
 * v1.1.0-rc.3 (P1-D fixup): accepts `signal`.
 */
export async function revokeDelegatedGrant(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  await del<DeleteResponse>(
    `/identity/v1/delegated-grants/${encodeURIComponent(id)}`,
    options.signal !== undefined ? { signal: options.signal } : {},
  );
  void emit('delegation.revoked', { grant_id: id });
}

/**
 * GDPR Article 20 export — client-side until server `/export` endpoint ships
 * (see DELEGATION_CENTER_DESIGN_v1.0.md §4 NEW).
 *
 * Returns a JSON Blob with the full set of grants visible to the caller.
 *
 * v1.1.0-rc.3 (P1-D fixup): accepts `signal` (passed through to the
 * underlying listDelegatedGrants call).
 */
export async function exportGrantsAsJson(
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const { grants_from_me, grants_to_me } = await listDelegatedGrants(options);
  const payload = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    grants_from_me,
    grants_to_me,
  };
  const json = JSON.stringify(payload, null, 2);
  return new Blob([json], { type: 'application/json' });
}
