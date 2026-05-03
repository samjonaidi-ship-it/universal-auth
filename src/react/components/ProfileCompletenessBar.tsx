// @samjonaidi-ship-it/universal-auth | src/react/components/ProfileCompletenessBar.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Visual progress bar with a11y-friendly progressbar role + missing-required hint.
// Per §5.4.3.

import type { ReactNode } from 'react';
import { useProfile } from '../useProfile.js';

export interface ProfileCompletenessBarProps {
  /** Show "X of Y required" detail under the bar. */
  showMissing?: boolean;
}

export function ProfileCompletenessBar({
  showMissing = true,
}: ProfileCompletenessBarProps): ReactNode {
  const { completeness, missingRequired } = useProfile();

  return (
    <div className="bb-auth-completeness">
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
