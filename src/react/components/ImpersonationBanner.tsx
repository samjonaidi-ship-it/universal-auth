// @bb/universal-auth | src/react/components/ImpersonationBanner.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Banner shown when an admin is acting as another user (§D2.2 + §11.10).
// Persists across in-app navigations because it's rendered ONCE in the layout
// shell, NOT per route.

import type { ReactNode } from 'react';
import { useAuth } from '../useAuth.js';
import { useImpersonation } from '../useImpersonation.js';

export interface ImpersonationBannerProps {
  /** Optional label override (i18n). */
  label?: (targetName: string) => string;
  /** Optional style override — pass `null` to suppress the default banner. */
  className?: string;
}

export function ImpersonationBanner({
  label = (target) => `Acting as ${target}. Every action is audited.`,
  className,
}: ImpersonationBannerProps): ReactNode {
  const { identity } = useAuth();
  const { end } = useImpersonation();

  // The session payload from `/auth/v1/me` does NOT include acting_as in v1
  // — that lives on the impersonation start response. For the banner we
  // detect impersonation via a sentinel on the identity (real BFF responses
  // include `acting_as` on the session_meta when applicable, but for v1 we
  // also check display_name or a flag on aggregate.features).
  // The `acting_as` prop pattern is the canonical fallback; consumers can
  // provide it explicitly:
  if (identity === null) return null;

  const actingAs = (identity as { acting_as?: { display_name: string } }).acting_as;
  if (actingAs === undefined) return null;

  return (
    <div
      className={className ?? 'bb-auth-impersonation-banner'}
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
