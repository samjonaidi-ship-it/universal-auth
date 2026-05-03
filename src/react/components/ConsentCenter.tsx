// @samjonaidi-ship-it/universal-auth | src/react/components/ConsentCenter.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Persistent settings UI for the user's consents — per PERSONA_PCP_DESIGN.md §10
// (UX/UI implications) and BB_UNIVERSAL_AUTH_SDK_SPEC.md §3.4.
//
// DIFFERENT from <ConsentScreen>:
//   - <ConsentScreen>     = initial gate during enrollment (hard-block until accept)
//   - <ConsentCenter>     = persistent post-auth UI for review/withdraw + opt-in
//
// Renders three sections:
//   1. Active consents       — accepted, with "Withdraw" + "View policy"
//   2. Available optional    — required=false consent_documents not yet accepted
//   3. History (read-only)   — withdrawn / superseded
//
// Re-uses flows/consent.ts helpers (no duplicated client logic).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  bulkAcceptConsents,
  getConsentDocuments,
  listAllConsents,
  revokeConsent,
  type ListedConsent,
} from '../../flows/consent.js';
import type { ConsentDocumentRef } from '../../flows/enroll-flow.js';

export interface ConsentCenterProps {
  /** Persona audience — drives `GET /consent-documents?audience=`. */
  audience: string;
  /** Fired after any successful accept or withdraw. Receives the acted-on consent record. */
  onConsentChanged?: (consent: ListedConsent) => void;
  /** Heading override. */
  heading?: string;
}

interface ViewState {
  loading: boolean;
  error: string | null;
  documents: readonly ConsentDocumentRef[];
  active: readonly ListedConsent[];
  history: readonly ListedConsent[];
}

const INITIAL: ViewState = {
  loading: true,
  error: null,
  documents: [],
  active: [],
  history: [],
};

export function ConsentCenter({
  audience,
  onConsentChanged,
  heading = 'Consents',
}: ConsentCenterProps): ReactNode {
  const [view, setView] = useState<ViewState>(INITIAL);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setView((v) => ({ ...v, loading: true, error: null }));
    try {
      const [docs, all] = await Promise.all([
        getConsentDocuments(audience),
        listAllConsents(),
      ]);
      const active = all.filter((c) => c.revoked_at === null);
      const history = all.filter((c) => c.revoked_at !== null);
      setView({ loading: false, error: null, documents: docs, active, history });
    } catch (err) {
      setView({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load consents.',
        documents: [],
        active: [],
        history: [],
      });
    }
  }, [audience]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleWithdraw = useCallback(
    async (consent: ListedConsent): Promise<void> => {
      setBusyId(consent.id);
      try {
        await revokeConsent(consent.id);
        if (onConsentChanged !== undefined) {
          onConsentChanged({ ...consent, revoked_at: new Date().toISOString() });
        }
        await reload();
      } catch (err) {
        setView((v) => ({
          ...v,
          error: err instanceof Error ? err.message : 'Could not withdraw consent.',
        }));
      } finally {
        setBusyId(null);
      }
    },
    [onConsentChanged, reload]
  );

  const handleAcceptOptional = useCallback(
    async (doc: ConsentDocumentRef): Promise<void> => {
      const tempId = `pending:${doc.consent_type}:${doc.policy_version}`;
      setBusyId(tempId);
      try {
        await bulkAcceptConsents([
          { consent_type: doc.consent_type, policy_version: doc.policy_version },
        ]);
        if (onConsentChanged !== undefined) {
          onConsentChanged({
            id: tempId,
            consent_type: doc.consent_type,
            policy_version: doc.policy_version,
            granted_at: new Date().toISOString(),
            revoked_at: null,
          });
        }
        await reload();
      } catch (err) {
        setView((v) => ({
          ...v,
          error: err instanceof Error ? err.message : 'Could not record consent.',
        }));
      } finally {
        setBusyId(null);
      }
    },
    [onConsentChanged, reload]
  );

  if (view.loading) {
    return (
      <section className="bb-auth-consent-center" aria-label={heading} aria-busy="true">
        <h2 className="bb-auth-heading">{heading}</h2>
        <p className="bb-auth-description">Loading…</p>
      </section>
    );
  }

  // Build lookup so active rows can show titles + body_url from the doc registry
  const docByType = new Map<string, ConsentDocumentRef>();
  for (const d of view.documents) docByType.set(d.consent_type, d);

  // "Available optional" = optional documents the user has not yet accepted
  const acceptedTypes = new Set(view.active.map((c) => c.consent_type));
  const availableOptional = view.documents.filter(
    (d) => !d.required && !acceptedTypes.has(d.consent_type)
  );

  return (
    <section className="bb-auth-consent-center" aria-label={heading}>
      <h2 className="bb-auth-heading">{heading}</h2>

      {view.error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {view.error}
        </div>
      ) : null}

      {/* ── Active ───────────────────────────────────────────────────────── */}
      <section
        className="bb-auth-consent-center-section"
        aria-labelledby="bb-auth-consent-active-heading"
      >
        <h3 id="bb-auth-consent-active-heading">Active consents</h3>
        {view.active.length === 0 ? (
          <p className="bb-auth-description">You haven't accepted any consents yet.</p>
        ) : (
          <ul className="bb-auth-consent-center-list" role="list">
            {view.active.map((c) => {
              const doc = docByType.get(c.consent_type);
              const title = doc?.title ?? humanize(c.consent_type);
              const isRequired = doc?.required ?? false;
              const busy = busyId === c.id;
              return (
                <li key={c.id} className="bb-auth-consent-center-row">
                  <div className="bb-auth-consent-center-row-main">
                    <span className="bb-auth-consent-center-row-title">{title}</span>
                    <span className="bb-auth-consent-center-row-meta">
                      v{c.policy_version} · accepted {formatDate(c.granted_at)}
                    </span>
                  </div>
                  <div className="bb-auth-consent-center-row-actions">
                    {doc !== undefined && doc.body_url !== '#' ? (
                      <a
                        className="bb-auth-button bb-auth-button-link"
                        href={doc.body_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View policy
                      </a>
                    ) : null}
                    {isRequired ? (
                      <span className="bb-auth-consent-center-required">Required</span>
                    ) : (
                      <button
                        type="button"
                        className="bb-auth-button bb-auth-button-link"
                        onClick={() => void handleWithdraw(c)}
                        disabled={busy}
                        aria-label={`Withdraw ${title}`}
                      >
                        {busy ? '…' : 'Withdraw'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Available optional ──────────────────────────────────────────── */}
      <section
        className="bb-auth-consent-center-section"
        aria-labelledby="bb-auth-consent-optional-heading"
      >
        <h3 id="bb-auth-consent-optional-heading">Optional consents</h3>
        {availableOptional.length === 0 ? (
          <p className="bb-auth-description">No optional consents available.</p>
        ) : (
          <ul className="bb-auth-consent-center-list" role="list">
            {availableOptional.map((doc) => {
              const tempId = `pending:${doc.consent_type}:${doc.policy_version}`;
              const busy = busyId === tempId;
              return (
                <li
                  key={`${doc.consent_type}:${doc.policy_version}`}
                  className="bb-auth-consent-center-row"
                >
                  <div className="bb-auth-consent-center-row-main">
                    <span className="bb-auth-consent-center-row-title">{doc.title}</span>
                    <span className="bb-auth-consent-center-row-meta">
                      v{doc.policy_version}
                    </span>
                  </div>
                  <div className="bb-auth-consent-center-row-actions">
                    {doc.body_url !== '#' ? (
                      <a
                        className="bb-auth-button bb-auth-button-link"
                        href={doc.body_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View policy
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="bb-auth-button bb-auth-button-primary"
                      onClick={() => void handleAcceptOptional(doc)}
                      disabled={busy}
                      aria-label={`Accept ${doc.title}`}
                    >
                      {busy ? '…' : 'Accept'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── History ─────────────────────────────────────────────────────── */}
      {view.history.length > 0 ? (
        <section
          className="bb-auth-consent-center-section"
          aria-labelledby="bb-auth-consent-history-heading"
        >
          <h3 id="bb-auth-consent-history-heading">History</h3>
          <ul className="bb-auth-consent-center-list" role="list">
            {view.history.map((c) => {
              const doc = docByType.get(c.consent_type);
              const title = doc?.title ?? humanize(c.consent_type);
              return (
                <li
                  key={c.id}
                  className="bb-auth-consent-center-row bb-auth-consent-center-row-revoked"
                >
                  <div className="bb-auth-consent-center-row-main">
                    <span className="bb-auth-consent-center-row-title">{title}</span>
                    <span className="bb-auth-consent-center-row-meta">
                      v{c.policy_version} · withdrawn{' '}
                      {c.revoked_at !== null ? formatDate(c.revoked_at) : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function humanize(consentType: string): string {
  return consentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string): string {
  if (iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}
