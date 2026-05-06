// @samjonaidi-ship-it/universal-auth | src/react/components/ConsentScreen.tsx | v1.1.0 | 2026-05-06 | BB
// Per §D2.5 / §3.4 / Wizard §20 — consent collection screen.
//
// HARD-GATE behavior (§3.4):
//   * `required[]` consents must ALL be checked before submit
//   * Submit fires `onAccept` exactly once, atomically, with the full set
//   * Optional consents are passed through but not enforced
//
// Default `required[]` per spec audience tables (§3.4 v1.4.0):
//   crew: privacy_policy, terms_of_service, employee_data_processing,
//         device_geolocation, device_camera, device_microphone,
//         agent_buddy_crew, agent_data_processing, agent_memory_retention
//   (9 total — Legal 3 + Device 3 + AI 3)

import { useState, type CSSProperties, type ReactNode, type FormEvent } from 'react';
import type { ConsentDocumentRef } from '../../flows/enroll-flow.js';

export type ConsentAudience = 'crew' | 'supplier' | 'subcontractor' | 'client' | 'architect' | 'admin';

export const DEFAULT_REQUIRED_CONSENTS: Record<ConsentAudience, readonly string[]> = {
  crew: [
    'privacy_policy',
    'terms_of_service',
    'employee_data_processing',
    'device_geolocation',
    'device_camera',
    'device_microphone',
    'agent_buddy_crew',
    'agent_data_processing',
    'agent_memory_retention',
  ],
  supplier: ['privacy_policy', 'terms_of_service'],
  subcontractor: ['privacy_policy', 'terms_of_service', 'contractor_agreement'],
  client: ['privacy_policy', 'terms_of_service'],
  architect: ['privacy_policy', 'terms_of_service'],
  admin: ['privacy_policy', 'terms_of_service', 'admin_responsibility_agreement'],
};

export interface ConsentScreenProps {
  /**
   * Required consents — if omitted, derived from `audience` + spec defaults.
   * Provide explicit list to override (e.g., enrollment flow uses the server's
   * consent_documents_required[] from /enroll/verify).
   */
  required?: readonly ConsentDocumentRef[];
  /** Optional consents (rendered but not enforced). */
  optional?: readonly ConsentDocumentRef[];
  /** Persona audience — used for default `required` if not provided. */
  audience?: ConsentAudience;
  /** Submission handler. Called once with all selected consents. */
  onAccept: (
    consents: readonly { consent_type: string; policy_version: string }[]
  ) => Promise<void>;
  /** Optional cancel handler — renders a back button. */
  onCancel?: () => void;
  /** Heading override. */
  heading?: string;
  /** Submit-button label. */
  submitLabel?: string;
  /** Optional class for the root <form>. */
  className?: string;
  /** Inline style for the root <form>. */
  style?: CSSProperties;
}

export function ConsentScreen({
  required,
  optional = [],
  audience,
  onAccept,
  onCancel,
  heading = 'Review and accept',
  submitLabel = 'Accept and continue',
  className,
  style,
}: ConsentScreenProps): ReactNode {
  // Resolve required list — server-provided takes priority over audience defaults
  const requiredDocs: readonly ConsentDocumentRef[] =
    required ??
    (audience !== undefined
      ? DEFAULT_REQUIRED_CONSENTS[audience].map((consent_type) => ({
          consent_type,
          policy_version: 'current',
          title: humanize(consent_type),
          body_url: '#',
          required: true,
          group: groupFor(consent_type),
        }))
      : []);

  const [checkedRequired, setCheckedRequired] = useState<Set<string>>(new Set());
  const [checkedOptional, setCheckedOptional] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRequiredAccepted =
    requiredDocs.length > 0 && requiredDocs.every((d) => checkedRequired.has(d.consent_type));

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!allRequiredAccepted) {
      setError('Please accept all required items to continue.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const all: { consent_type: string; policy_version: string }[] = [];
      for (const doc of requiredDocs) {
        all.push({ consent_type: doc.consent_type, policy_version: doc.policy_version });
      }
      for (const doc of optional) {
        if (checkedOptional.has(doc.consent_type)) {
          all.push({ consent_type: doc.consent_type, policy_version: doc.policy_version });
        }
      }
      await onAccept(all);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not record consents. Try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(setMap: Set<string>, key: string, on: boolean): Set<string> {
    const next = new Set(setMap);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  }

  // Group required by 'group' field for visual organization
  const grouped = groupBy(requiredDocs);

  return (
    <form
      className={className ?? 'bb-auth-consent-screen'}
      style={style}
      aria-label={heading}
      onSubmit={handleSubmit}
      noValidate
    >
      <h2 className="bb-auth-heading">{heading}</h2>

      {(Object.keys(grouped) as Array<keyof typeof grouped>).map((groupKey) => {
        const docs = grouped[groupKey];
        if (docs === undefined || docs.length === 0) return null;
        return (
          <fieldset key={groupKey} className="bb-auth-consent-group">
            <legend>{groupHeading(groupKey)}</legend>
            {docs.map((doc) => (
              <label key={doc.consent_type} className="bb-auth-checkbox">
                <input
                  type="checkbox"
                  checked={checkedRequired.has(doc.consent_type)}
                  onChange={(e) =>
                    setCheckedRequired((s) => toggle(s, doc.consent_type, e.target.checked))
                  }
                  aria-required="true"
                />
                <span className="bb-auth-checkbox-label">
                  {doc.title}
                  {doc.body_url !== '#' ? (
                    <>
                      {' '}
                      <a href={doc.body_url} target="_blank" rel="noopener noreferrer">
                        Read
                      </a>
                    </>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        );
      })}

      {optional.length > 0 ? (
        <fieldset className="bb-auth-consent-group">
          <legend>Optional</legend>
          {optional.map((doc) => (
            <label key={doc.consent_type} className="bb-auth-checkbox">
              <input
                type="checkbox"
                checked={checkedOptional.has(doc.consent_type)}
                onChange={(e) =>
                  setCheckedOptional((s) => toggle(s, doc.consent_type, e.target.checked))
                }
              />
              <span className="bb-auth-checkbox-label">{doc.title}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
        </div>
      ) : null}

      <div className="bb-auth-actions">
        {onCancel !== undefined ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={onCancel}
          >
            Back
          </button>
        ) : null}
        <button
          type="submit"
          className="bb-auth-button bb-auth-button-primary"
          disabled={submitting || !allRequiredAccepted}
        >
          {submitting ? '…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function humanize(consentType: string): string {
  return consentType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupFor(consentType: string): ConsentDocumentRef['group'] {
  if (consentType.startsWith('agent_')) return 'ai_assistant';
  if (consentType.startsWith('device_')) return 'device';
  return 'legal';
}

function groupBy(
  docs: readonly ConsentDocumentRef[]
): Record<ConsentDocumentRef['group'], readonly ConsentDocumentRef[]> {
  const out: Record<ConsentDocumentRef['group'], ConsentDocumentRef[]> = {
    legal: [],
    device: [],
    ai_assistant: [],
    optional: [],
  };
  for (const d of docs) out[d.group].push(d);
  return out;
}

function groupHeading(group: ConsentDocumentRef['group']): string {
  switch (group) {
    case 'legal':
      return 'Legal';
    case 'device':
      return 'Device permissions';
    case 'ai_assistant':
      return 'AI assistant';
    case 'optional':
      return 'Optional';
  }
}
