// @bainbridgebuilders/universal-auth | src/react/components/CompletenessBar.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// PCP-aware completeness bar with color bands + clickable missing-required list.
// Implements PERSONA_PCP_DESIGN.md §10 (SDK component map: completeness driven
// by persona_registry.profile_schema.required[]) + SDK_SPEC §5.4.3.
//
// Distinct from the legacy <ProfileCompletenessBar>: that one is a minimal
// progress indicator. This one adds a per-band visual cue (red < 50,
// yellow < 80, green ≥ 80) and an interactive missing-field list with an
// optional onFieldClick affordance for "jump to that field" UX.

import type { ReactNode } from 'react';
import { useProfile } from '../useProfile.js';

export interface CompletenessBarProps {
  /** Custom human label for a field key. Receives the raw key, returns the label. */
  fieldLabels?: Readonly<Record<string, string>>;
  /** Hide the missing-required-fields list. */
  hideMissing?: boolean;
  /** Click handler — receives the raw missing field key. */
  onFieldClick?: (fieldKey: string) => void;
  /** ARIA label override. */
  label?: string;
}

type Band = 'red' | 'yellow' | 'green';

function bandFor(score: number): Band {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

const DEFAULT_LABELS: Readonly<Record<string, string>> = {
  display_name: 'Display name',
  phone_e164: 'Phone number',
  email: 'Email address',
  emergency_contact: 'Emergency contact',
  avatar: 'Avatar',
  'addresses.residence': 'Residence address',
  'addresses.billing': 'Billing address',
  'addresses.business': 'Business address',
  'addresses.property': 'Property address',
  'addresses.mailing': 'Mailing address',
  'resources.property': 'At least one property',
  'resources.vehicle': 'Vehicle',
  'resources.license': 'License',
  'resources.insurance': 'Insurance',
  'resources.compliance_doc': 'Compliance document',
  'persona_extensions.crew.trade': 'Trade',
  'persona_extensions.subcontractor.company': 'Company',
  'persona_extensions.subcontractor.specialty': 'Specialty',
};

function humanLabel(
  key: string,
  overrides?: Readonly<Record<string, string>>
): string {
  return overrides?.[key] ?? DEFAULT_LABELS[key] ?? key;
}

export function CompletenessBar({
  fieldLabels,
  hideMissing = false,
  onFieldClick,
  label = 'Profile completeness',
}: CompletenessBarProps): ReactNode {
  const { completeness, missingRequired } = useProfile();
  const band = bandFor(completeness);

  return (
    <div className="bb-auth-completeness-pcp" data-band={band}>
      <div
        className="bb-auth-completeness-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completeness}
        aria-label={label}
      >
        <div
          className="bb-auth-completeness-fill"
          data-band={band}
          style={{ width: `${completeness}%` }}
        />
      </div>
      <span className="bb-auth-completeness-label">
        {completeness}% complete
      </span>
      {!hideMissing && missingRequired.length > 0 ? (
        <div className="bb-auth-completeness-missing">
          <p className="bb-auth-description">
            {missingRequired.length} required field
            {missingRequired.length === 1 ? '' : 's'} remaining
          </p>
          <ul role="list" className="bb-auth-completeness-missing-list">
            {missingRequired.map((key) => {
              const label = humanLabel(key, fieldLabels);
              return (
                <li key={key}>
                  {onFieldClick !== undefined ? (
                    <button
                      type="button"
                      className="bb-auth-button bb-auth-button-link"
                      onClick={() => onFieldClick(key)}
                    >
                      {label}
                    </button>
                  ) : (
                    <span>{label}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
