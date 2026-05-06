// @samjonaidi-ship-it/universal-auth | src/react/components/ProfileCompletenessBar.tsx | v1.1.0 | 2026-05-06 | BB
// Visual progress bar with a11y-friendly progressbar role + missing-required hint.
// Per §5.4.3.
//
// v1.1.0 (P1-A): + className/style

import type { CSSProperties, ReactNode } from 'react';
import { useProfile } from '../useProfile.js';

export interface ProfileCompletenessBarProps {
  /** Show "X of Y required" detail under the bar. */
  showMissing?: boolean;
  /** Optional class for the root <div>. */
  className?: string;
  /** Inline style for the root <div>. */
  style?: CSSProperties;
}

export function ProfileCompletenessBar({
  showMissing = true,
  className,
  style,
}: ProfileCompletenessBarProps): ReactNode {
  const { completeness, missingRequired } = useProfile();

  return (
    <div className={className ?? 'bb-auth-completeness'} style={style}>
      <div
        className="bb-auth-completeness-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={completeness}
        aria-label="Profile completeness"
      >
        <div
          className="bb-auth-completeness-fill"
          style={{ width: `${completeness}%` }}
        />
      </div>
      <span className="bb-auth-completeness-label">{completeness}% complete</span>
      {showMissing && missingRequired.length > 0 ? (
        <p className="bb-auth-description">
          {missingRequired.length} required field{missingRequired.length === 1 ? '' : 's'} remaining
        </p>
      ) : null}
    </div>
  );
}
