// @bb/universal-auth | src/react/components/AppChooser.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Per §D2.5 — shown at app root, persona-mismatch fallback, or in user menu
// when an identity has access to multiple BB apps (D10).

import type { ReactNode } from 'react';
import { useAuth } from '../useAuth.js';

export interface AppChooserProps {
  /** App ids to offer. Default: read from session.aggregate.app_access. */
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
  const { identity } = useAuth();
  // Read aggregate.app_access via the entitlements module to keep this
  // component decoupled from EntitlementsContext (avoids re-render coupling).
  const list = apps ?? readAppAccessFromIdentity(identity);
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

function readAppAccessFromIdentity(identity: ReturnType<typeof useAuth>['identity']): readonly string[] {
  // The session's aggregate.app_access is on EntitlementsContext, not on
  // identity; consumers SHOULD pass `apps` explicitly. If omitted we fall
  // back to an empty list so the component renders nothing rather than
  // surfacing stale data.
  void identity;
  return [];
}
