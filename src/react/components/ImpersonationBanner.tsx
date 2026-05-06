// @samjonaidi-ship-it/universal-auth | src/react/components/ImpersonationBanner.tsx | v1.1.0 | 2026-05-06 | BB
// Banner shown when an admin is acting as another user (§D2.2 + §11.10).
// Persists across in-app navigations because it's rendered ONCE in the layout
// shell, NOT per route. Reads `actingAs` from useImpersonation() — populated
// by flows/impersonation when startImpersonation succeeds.
//
// v1.1.0 (P1-A/B): + style + forwardRef<HTMLDivElement>

import { forwardRef, type CSSProperties } from 'react';
import { useImpersonation } from '../useImpersonation.js';

export interface ImpersonationBannerProps {
  /** Optional label override (i18n). */
  label?: (targetName: string) => string;
  /** Optional style override — pass `null` to suppress the default banner. */
  className?: string;
  /** Inline style for the root <div>. */
  style?: CSSProperties;
}

export const ImpersonationBanner = forwardRef<HTMLDivElement, ImpersonationBannerProps>(
  function ImpersonationBanner(
    {
      label = (target) => `Acting as ${target}. Every action is audited.`,
      className,
      style,
    },
    ref
  ) {
    const { actingAs, end } = useImpersonation();
    if (actingAs === null) return null;

    return (
      <div
        ref={ref}
        className={className ?? 'bb-auth-impersonation-banner'}
        style={style}
        role="status"
        aria-live="polite"
      >
        <span className="bb-auth-impersonation-text">{label(actingAs.display_name)}</span>
        <button
          type="button"
          className="bb-auth-button bb-auth-button-link"
          onClick={() => void end()}
        >
          Stop
        </button>
      </div>
    );
  }
);
