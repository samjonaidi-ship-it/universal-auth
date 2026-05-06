// @samjonaidi-ship-it/universal-auth | src/react/components/PersonaChooser.tsx | v1.1.0 | 2026-05-06 | BB
// Per §D2.5 + BB_EXPRESS_APP_SPEC §2.3 — persona picker for multi-persona users.
// Shown after login when personas.length > 1 and no last_active_persona match.
//
// v1.1.0 (P1-A): + className/style

import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '../useAuth.js';
import type { Persona } from '../../types/api.js';

export interface PersonaChooserProps {
  /** Called when the user picks a persona. Caller routes to landing_route. */
  onSelect: (persona: Persona) => void;
  /** Optional label override per persona_type. */
  personaLabels?: Record<string, string>;
  /** Show "Remember my choice" checkbox. */
  showRememberOption?: boolean;
  onRememberChange?: (remember: boolean) => void;
  heading?: string;
  /** Optional class for the root <section>. */
  className?: string;
  /** Inline style for the root <section>. */
  style?: CSSProperties;
}

const DEFAULT_LABELS: Record<string, string> = {
  crew: 'Crew',
  client: 'Homeowner',
  supplier: 'Supplier',
  subcontractor: 'Subcontractor',
  architect: 'Architect',
  admin: 'Administrator',
  operator: 'Operator',
  viewer: 'Viewer',
};

export function PersonaChooser({
  onSelect,
  personaLabels = {},
  showRememberOption = false,
  onRememberChange,
  heading = 'Which role would you like to use?',
  className,
  style,
}: PersonaChooserProps): ReactNode {
  const { personas, identity } = useAuth();
  if (personas.length === 0) return null;

  return (
    <section
      className={className ?? 'bb-auth-persona-chooser'}
      style={style}
      aria-label={heading}
    >
      <h2 className="bb-auth-heading">{heading}</h2>
      {identity?.display_name !== undefined ? (
        <p className="bb-auth-description">Welcome back, {identity.display_name}.</p>
      ) : null}
      <ul className="bb-auth-persona-chooser-list" role="list">
        {personas.map((p) => (
          <li key={`${p.persona_type}:${p.party_id}`}>
            <button
              type="button"
              className="bb-auth-button bb-auth-persona-chooser-card"
              onClick={() => onSelect(p)}
            >
              <span className="bb-auth-persona-chooser-card-title">
                {personaLabels[p.persona_type] ?? DEFAULT_LABELS[p.persona_type] ?? p.persona_type}
              </span>
              <span className="bb-auth-persona-chooser-card-subtitle">{p.party_name}</span>
            </button>
          </li>
        ))}
      </ul>
      {showRememberOption && onRememberChange !== undefined ? (
        <label className="bb-auth-checkbox">
          <input
            type="checkbox"
            onChange={(e) => onRememberChange(e.target.checked)}
          />
          <span>Remember my choice</span>
        </label>
      ) : null}
    </section>
  );
}
