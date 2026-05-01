// @bainbridgebuilders/universal-auth | src/react/components/ProfileSetupScreen.tsx | v1.0.1 | 2026-05-01 | BB
// Drop-in profile setup per §5.5.1 — three render modes (automatic / guided /
// deferred). Composes <AvatarPicker>, <ContactInfoForm>, <PersonaFieldsForm>,
// <ProfileCompletenessBar>.

import { useEffect, useRef, type ReactNode } from 'react';
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

  // Fire onComplete exactly once when needsSetup transitions false. Lives in
  // an effect (not render) so it never fires synchronously during render and
  // is not subject to render-side-effect bugs under Strict Mode. The ref
  // guards against double-fire under React 18 Strict Mode (which double-
  // invokes effects in dev) and against parent re-renders.
  const completeFiredRef = useRef<boolean>(false);
  useEffect(() => {
    if (completeFiredRef.current) return;
    if (needsSetup) return;
    if (onComplete === undefined) return;
    completeFiredRef.current = true;
    onComplete();
  }, [needsSetup, onComplete]);

  if (mode === 'deferred') return null;
  if (state === 'loading' || profile === null) {
    return (
      <div role="status" aria-live="polite" className="bb-auth-skeleton">
        Loading…
      </div>
    );
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
