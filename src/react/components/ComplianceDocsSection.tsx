// @samjonaidi-ship-it/universal-auth | src/react/components/ComplianceDocsSection.tsx | v1.1.0 | 2026-05-06 | BB
// Compliance documents (compliance_doc | license | insurance) — for crew,
// subcontractor, architect personas.
// Implements PERSONA_PCP_DESIGN.md §3.3 (resource_type compliance_doc/license/
// insurance with effective_until expiry) + §6 persona matrix +
// SDK_SPEC §5.4.1 (ProfileResource).

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useIdentity } from '../useIdentity.js';
import type { ProfileResource, ResourceType } from '../../types/pcp.js';

export interface ComplianceDocsSectionProps {
  heading?: string;
  readonly?: boolean;
  /** Filter to a subset of types. Defaults to all three. */
  resourceTypes?: ReadonlyArray<'compliance_doc' | 'license' | 'insurance'>;
  /** Optional class for the root <section>. */
  className?: string;
  /** Inline style for the root <section>. */
  style?: CSSProperties;
}

const DEFAULT_TYPES: ReadonlyArray<'compliance_doc' | 'license' | 'insurance'> = [
  'compliance_doc',
  'license',
  'insurance',
];

const EXPIRY_WARNING_DAYS = 30;

type DocStatus = 'verified' | 'pending' | 'expired' | 'expiring' | 'rejected' | 'active';

interface DocView {
  resource: ProfileResource;
  docType: string;
  status: DocStatus;
  expiresAt: Date | null;
}

function classify(r: ProfileResource): DocView {
  const docType =
    typeof r.attributes.doc_type === 'string'
      ? r.attributes.doc_type
      : typeof r.attributes.license_type === 'string'
        ? r.attributes.license_type
        : r.resource_type;

  const expiresAt =
    typeof r.effective_until === 'string'
      ? new Date(r.effective_until)
      : null;

  let status: DocStatus = 'active';
  if (r.status === 'pending_verification') status = 'pending';
  else if (r.status === 'rejected') status = 'rejected';
  else if (r.status === 'expired') status = 'expired';
  else if (r.verified) status = 'verified';

  if (expiresAt !== null && status !== 'expired' && status !== 'rejected') {
    const now = Date.now();
    const ms = expiresAt.getTime() - now;
    if (ms <= 0) status = 'expired';
    else if (ms <= EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000) status = 'expiring';
  }

  return { resource: r, docType, status, expiresAt };
}

export function ComplianceDocsSection({
  heading = 'Compliance & licenses',
  readonly = false,
  resourceTypes = DEFAULT_TYPES,
  className,
  style,
}: ComplianceDocsSectionProps): ReactNode {
  const { resources, archiveResource, mediaForResource } = useIdentity();

  const docs = useMemo(() => {
    const allowed = new Set<ResourceType>(resourceTypes);
    return resources
      .filter((r) => allowed.has(r.resource_type) && r.status !== 'archived')
      .map(classify);
  }, [resources, resourceTypes]);

  return (
    <section
      className={className ?? 'bb-auth-resource-section'}
      style={style}
      aria-label={heading}
    >
      <h3 className="bb-auth-heading">{heading}</h3>

      {docs.length === 0 ? (
        <p className="bb-auth-description">No documents on file.</p>
      ) : (
        <ul role="list" className="bb-auth-resource-list">
          {docs.map((d) => {
            const m = mediaForResource(d.resource.id);
            const primary = m[0];
            return (
              <li key={d.resource.id} className="bb-auth-resource-card">
                <article aria-label={d.resource.name ?? d.docType}>
                  <header className="bb-auth-resource-card-header">
                    <h4>{d.resource.name ?? d.docType}</h4>
                    <StatusBadge status={d.status} />
                  </header>
                  <dl className="bb-auth-resource-attrs">
                    <dt>Type</dt>
                    <dd>{d.docType}</dd>
                    {d.expiresAt !== null ? (
                      <>
                        <dt>Expires</dt>
                        <dd>
                          <time dateTime={d.expiresAt.toISOString()}>
                            {d.expiresAt.toLocaleDateString()}
                          </time>
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  {primary !== undefined ? (
                    <a
                      href={primary.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bb-auth-resource-doc-link"
                      download={primary.file_name}
                    >
                      {primary.file_name ?? 'Download'}
                    </a>
                  ) : null}
                  {!readonly ? (
                    <button
                      type="button"
                      className="bb-auth-button bb-auth-button-link"
                      onClick={() => void archiveResource(d.resource.id)}
                      aria-label={`Archive ${d.resource.name ?? d.docType}`}
                    >
                      Archive
                    </button>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: DocStatus }): ReactNode {
  const labelMap: Record<DocStatus, string> = {
    verified: 'Verified',
    pending: 'Pending review',
    expired: 'Expired',
    expiring: 'Expiring soon',
    rejected: 'Rejected',
    active: 'Active',
  };
  return (
    <span
      className="bb-auth-status-badge"
      data-status={status}
      role="status"
      aria-label={`Status: ${labelMap[status]}`}
    >
      {labelMap[status]}
    </span>
  );
}
