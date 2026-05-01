// @bainbridgebuilders/universal-auth | src/react/components/AppChooser.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Per §D2.5 — shown at app root, persona-mismatch fallback, or in user menu
// when an identity has access to multiple BB apps (D10).
//
// Default `apps` falls back to `useEntitlements().app_access` — i.e., the
// session's aggregate.app_access[]. Consumers can override with explicit list
// (e.g., to reorder or filter to whitelisted apps).

import type { ReactNode } from 'react';
import { useEntitlements } from '../useEntitlements.js';

export interface AppChooserProps {
  /**
   * App ids to offer. Defaults to `useEntitlements().app_access` from session
   * — the canonical "apps this user can reach" set per §D2.1.
   */
  apps?: readonly string[];
  /** Required: turn an app id into a click target. */
  onSelect: (appId: string) => void;
  /** Optional label override per appId. */
  appLabels?: Record<string, string>;
  /** Heading text. */
  heading?: string;
}

const DEFAULT_LABELS: Record<string, string> = {
  bb_express: 'BB Express',
  controltower: 'ControlTower',
  buddy_console: 'Buddy Console',
};

export function AppChooser({
  apps,
  onSelect,
  appLabels = {},
  heading = 'Choose an app',
}: AppChooserProps): ReactNode {
  const { app_access } = useEntitlements();
  const list = apps ?? app_access;
  if (list.length === 0) return null;

  return (
    <section className="bb-auth-app-chooser" aria-label={heading}>
      <h2 className="bb-auth-heading">{heading}</h2>
      <ul className="bb-auth-app-chooser-list" role="list">
        {list.map((id) => (
          <li key={id}>
            <button
              type="button"
              className="bb-auth-button bb-auth-app-chooser-card"
              onClick={() => onSelect(id)}
            >
              {appLabels[id] ?? DEFAULT_LABELS[id] ?? id}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
