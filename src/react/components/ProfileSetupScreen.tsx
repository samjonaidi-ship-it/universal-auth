// @bb/universal-auth | src/react/components/ProfileSetupScreen.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Drop-in profile setup per §5.5.1 — three render modes (automatic / guided /
// deferred). Composes <AvatarPicker>, <ContactInfoForm>, <PersonaFieldsForm>,
// <ProfileCompletenessBar>.

import type { ReactNode } from 'react';
import { useAuth } from '../useAuth.js';
import { useProfile } from '../useProfile.js';
import { AvatarPicker } from './AvatarPicker.js';
import { ContactInfoForm } from './ContactInfoForm.js';
import { PersonaFieldsForm } from './PersonaFieldsForm.js';
import { ProfileCompletenessBar } from './ProfileCompletenessBar.js';

export type ProfileSetupMode = 'automatic' | 'guided' | 'deferred';

export interface ProfileSetupScreenProps {
  /**
   * - 'automatic': SDK renders the full sequence (avatar → contact → persona fields)
   *                with progress bar; calls onComplete when needsSetup goes false
   * - 'guided':    SDK renders progress bar + heading; consumer composes the rest
   * - 'deferred':  SDK renders nothing; consumer-controlled
   */
  mode?: ProfileSetupMode;
  heading?: string;
  /** Called when completeness reaches 100 OR needsSetup transitions to false. */
  onComplete?: () => void;
  /** Optional consumer override children (used by 'guided' mode). */
  children?: ReactNode;
}

export function ProfileSetupScreen({
  mode = 'automatic',
  heading = 'Complete your profile',
  onComplete,
  children,
}: ProfileSetupScreenProps): ReactNode {
  const { activePersona } = useAuth();
  const { profile, completeness, needsSetup, state } = useProfile();

  if (mode === 'deferred') return null;
  if (state === 'loading' || profile === null) {
    return (
      <div role="status" aria-live="polite" className="bb-auth-skeleton">
        Loading…
      </div>
    );
  }

  // Trigger onComplete when the user crosses the auto-prompt threshold OR hits 100
  if (!needsSetup && onComplete !== undefined) {
    queueMicrotask(() => onComplete());
  }

  const personaType = activePersona?.persona_type ?? 'crew';

  if (mode === 'guided') {
    return (
      <section className="bb-auth-profile-setup" aria-label={heading}>
        <h2 className="bb-auth-heading">{heading}</h2>
        <ProfileCompletenessBar />
        {children}
      </section>
    );
  }

  // automatic
  return (
    <section className="bb-auth-profile-setup" aria-label={heading}>
      <h2 className="bb-auth-heading">{heading}</h2>
      <ProfileCompletenessBar />
      <AvatarPicker />
      <ContactInfoForm />
      <PersonaFieldsForm persona={personaType} hideOptional />
      {completeness === 100 ? (
        <p className="bb-auth-description bb-auth-success">
          Profile complete!
        </p>
      ) : null}
    </section>
  );
}
