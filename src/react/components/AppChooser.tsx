// @samjonaidi-ship-it/universal-auth | src/react/components/AppChooser.tsx | v1.1.0 | 2026-05-06 | BB
// Per §D2.5 — shown at app root, persona-mismatch fallback, or in user menu
// when an identity has access to multiple BB apps (D10).
//
// Default `apps` falls back to `useEntitlements().app_access` — i.e., the
// session's aggregate.app_access[]. Consumers can override with explicit list
// (e.g., to reorder or filter to whitelisted apps).
//
// v1.1.0 (P1-A/B): + className/style + forwardRef<HTMLElement>

import { forwardRef, type CSSProperties } from 'react';
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
  /** Optional class for the root <section>. */
  className?: string;
  /** Inline style for the root <section>. */
  style?: CSSProperties;
}

const DEFAULT_LABELS: Record<string, string> = {
  bb_express: 'BB Express',
  controltower: 'ControlTower',
  buddy_console: 'Buddy Console',
};

export const AppChooser = forwardRef<HTMLElement, AppChooserProps>(
  function AppChooser(
    {
      apps,
      onSelect,
      appLabels = {},
      heading = 'Choose an app',
      className,
      style,
    },
    ref
  ) {
    const { app_access } = useEntitlements();
    const list = apps ?? app_access;
    if (list.length === 0) return null;

    return (
      <section
        ref={ref}
        className={className ?? 'bb-auth-app-chooser'}
        style={style}
        aria-label={heading}
      >
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
);
