// @bb/universal-auth | src/flows/consent.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Consent endpoint client (§3.4 + §D2.6).
//
// Wired by <ConsentScreen> at enrollment time + the Wizard's audit-replay UI.
// Hard-gate: missing required consent on the next API call → CONSENT_REQUIRED.

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
