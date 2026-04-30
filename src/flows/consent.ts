// @bainbridgebuilders/universal-auth | src/flows/consent.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// Consent endpoint client (§3.4 + §D2.6).
//
// Wired by <ConsentScreen> at enrollment time + the Wizard's audit-replay UI.
// Hard-gate: missing required consent on the next API call → CONSENT_REQUIRED.
//
// v1.0.0-rc.4 (2026-04-30): added `listAllConsents()` for <ConsentCenter>'s
// history section (revoked consents). Hits CT BFF `/consents/all` which
// returns the full audit trail including revoked_at. See PERSONA_PCP_DESIGN.md
// §4 (FHIR-grade consents) and §10 (UX/UI implications).

import { get, post } from '../core/client.js';
import { emit } from '../core/event-reporter.js';
import type { ConsentDocumentRef } from './enroll-flow.js';

export interface ConsentDocumentsResponse {
  documents: readonly ConsentDocumentRef[];
}

export interface ConsentRecord {
  consent_type: string;
  policy_version: string;
}

/**
 * Fetch current required + optional consent documents for an audience.
 * Used by `<ConsentScreen>` at enrollment to render the right checkboxes.
 */
export async function getConsentDocuments(
  audience: 'crew' | 'supplier' | 'subcontractor' | 'client' | 'architect' | 'admin' | string
): Promise<readonly ConsentDocumentRef[]> {
  const { data } = await get<ConsentDocumentsResponse>(
    `/identity/v1/consent-documents?audience=${encodeURIComponent(audience)}`,
    { anonymous: true }
  );
  return data.documents;
}

/**
 * Atomic bulk accept (§3.4). All-or-nothing — server rejects with
 * CONSENT_REQUIRED if any required consent for the audience is missing.
 */
export async function bulkAcceptConsents(consents: readonly ConsentRecord[]): Promise<void> {
  await post('/identity/v1/consents/bulk', { consents });
  void emit('enrollment.consent_recorded', { count: consents.length });
}

/** Record a single consent (post-enrollment, e.g., adding optional consents). */
export async function recordConsent(
  consentType: string,
  policyVersion: string
): Promise<void> {
  await post('/identity/v1/consents', {
    consent_type: consentType,
    policy_version: policyVersion,
  });
}

/** Revoke a previously-granted consent. */
export async function revokeConsent(consentId: string): Promise<void> {
  await post(`/identity/v1/consents/${encodeURIComponent(consentId)}/revoke`, {});
}

export interface ListedConsent {
  id: string;
  consent_type: string;
  policy_version: string;
  granted_at: string;
  revoked_at: string | null;
}

/** List active consents for the current identity (used by /me/consent UI). */
export async function listConsents(): Promise<readonly ListedConsent[]> {
  const { data } = await get<{ consents: readonly ListedConsent[] }>('/identity/v1/consents');
  return data.consents;
}

/**
 * List ALL consents (active + revoked + superseded) for the current identity.
 * Used by `<ConsentCenter>` to render the "History" section.
 *
 * NOTE: CT BFF `/consents/all` returns `accepted_at` instead of `granted_at`.
 * We normalize to `granted_at` here so the UI types stay consistent.
 */
export async function listAllConsents(): Promise<readonly ListedConsent[]> {
  interface RawAllResponse {
    consents: readonly {
      id: string;
      consent_type: string;
      policy_version: string;
      accepted_at?: string;
      granted_at?: string;
      revoked_at: string | null;
    }[];
  }
  const { data } = await get<RawAllResponse>('/identity/v1/consents/all');
  return data.consents.map((c) => ({
    id: c.id,
    consent_type: c.consent_type,
    policy_version: c.policy_version,
    granted_at: c.granted_at ?? c.accepted_at ?? '',
    revoked_at: c.revoked_at,
  }));
}
