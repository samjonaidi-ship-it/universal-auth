// @samjonaidi-ship-it/universal-auth | src/react/components/SignInForm.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Code-first sign-in form. Two-screen flow:
//   1. Destination entry (phone or email) → POST /auth/v1/code/request
//   2. Code entry → POST /auth/v1/code/verify
//
// a11y per §11.10 Appendix F:
//   * Form has accessible name (aria-label / heading)
//   * Inputs have label association
//   * Submit button is the form's default
//   * Errors announced via aria-live region

import { useState, type FormEvent, type ReactNode } from 'react';
import { CodeEntry } from './CodeEntry.js';
import { useAuth } from '../useAuth.js';
import { AuthSdkError } from '../../errors.js';

export interface SignInFormProps {
  /** Render passkey CTA above the destination input. Default true. */
  passkeyEnabled?: boolean;
  /** Optional label override (i18n). */
  labels?: Partial<{
    heading: string;
    destinationLabel: string;
    submitLabel: string;
    or: string;
    passkeyButtonLabel: string;
  }>;
  /** Called when sign-in succeeds. */
  onSignedIn?: () => void;
  /** Allow the consumer to override how passkey is invoked. */
  onPasskeyClick?: () => void;
}

const DEFAULTS = {
  heading: 'Sign in',
  destinationLabel: 'Phone or email',
  submitLabel: 'Send code',
  or: 'or',
  passkeyButtonLabel: 'Sign in with passkey',
};

export function SignInForm({
  passkeyEnabled = true,
  labels = {},
  onSignedIn,
  onPasskeyClick,
}: SignInFormProps): ReactNode {
  const L = { ...DEFAULTS, ...labels };
  const { requestCode, signIn } = useAuth();
  const [destination, setDestination] = useState('');
  const [stage, setStage] = useState<'destination' | 'code'>('destination');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (destination.trim().length === 0) {
      setError('Enter a phone number or email.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await requestCode({ destination: destination.trim() });
      setStage('code');
    } catch (err) {
      if (err instanceof AuthSdkError) {
        setError(err.message);
      } else {
        setError('Could not send code. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCode(code: string): Promise<void> {
    await signIn({ destination: destination.trim(), code });
    onSignedIn?.();
  }

  if (stage === 'code') {
    return (
      <CodeEntry
        destination={destination}
        onSubmit={handleCode}
        onResend={async () => {
          await requestCode({ destination: destination.trim() });
        }}
        onBack={() => setStage('destination')}
      />
    );
  }

  return (
    <form
      className="bb-auth-signin-form"
      aria-label={L.heading}
      onSubmit={handleSubmit}
      noValidate
    >
      <h2 className="bb-auth-heading">{L.heading}</h2>

      {passkeyEnabled && onPasskeyClick !== undefined ? (
        <>
          <button
            type="button"
            className="bb-auth-button bb-auth-button-secondary"
            onClick={onPasskeyClick}
          >
            {L.passkeyButtonLabel}
          </button>
          <div className="bb-auth-divider" role="separator">
            {L.or}
          </div>
        </>
      ) : null}

      <label className="bb-auth-field">
        <span className="bb-auth-field-label">{L.destinationLabel}</span>
        <input
          type="text"
          inputMode="email"
          autoComplete="username"
          required
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? 'bb-auth-signin-error' : undefined}
        />
      </label>

      {error !== null ? (
        <div
          id="bb-auth-signin-error"
          role="alert"
          aria-live="assertive"
          className="bb-auth-error"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        className="bb-auth-button bb-auth-button-primary"
        disabled={submitting}
      >
        {submitting ? '…' : L.submitLabel}
      </button>
    </form>
  );
}
