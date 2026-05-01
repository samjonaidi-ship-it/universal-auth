// @bainbridgebuilders/universal-auth | src/react/components/CodeEntry.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// 6-digit code entry. Single text input (avoids the per-digit anti-pattern
// that breaks paste, screen readers, and autofill).

import { useState, type FormEvent, type ReactNode } from 'react';
import { AuthSdkError } from '../../errors.js';

export interface CodeEntryProps {
  destination: string;
  onSubmit: (code: string) => Promise<void>;
  onResend?: () => Promise<void>;
  onBack?: () => void;
  labels?: Partial<{
    heading: string;
    description: string;
    codeLabel: string;
    submitLabel: string;
    resendLabel: string;
    backLabel: string;
  }>;
}

const DEFAULTS = {
  heading: 'Enter your code',
  description: 'We sent a 6-digit code to',
  codeLabel: '6-digit code',
  submitLabel: 'Verify',
  resendLabel: 'Send another',
  backLabel: 'Back',
};

export function CodeEntry({
  destination,
  onSubmit,
  onResend,
  onBack,
  labels = {},
}: CodeEntryProps): ReactNode {
  const L = { ...DEFAULTS, ...labels };
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(code);
    } catch (err) {
      if (err instanceof AuthSdkError) {
        setError(err.message);
      } else {
        setError('Verification failed. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      className="bb-auth-code-entry"
      aria-label={L.heading}
      onSubmit={handleSubmit}
      noValidate
    >
      <h2 className="bb-auth-heading">{L.heading}</h2>
      <p className="bb-auth-description">
        {L.description} <strong>{destination}</strong>.
      </p>

      <label className="bb-auth-field">
        <span className="bb-auth-field-label">{L.codeLabel}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-invalid={error !== null}
          aria-describedby={error !== null ? 'bb-auth-code-error' : undefined}
        />
      </label>

      {error !== null ? (
        <div
          id="bb-auth-code-error"
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
        disabled={submitting || code.length !== 6}
      >
        {submitting ? '…' : L.submitLabel}
      </button>

      <div className="bb-auth-actions">
        {onResend !== undefined ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={() => void onResend()}
          >
            {L.resendLabel}
          </button>
        ) : null}
        {onBack !== undefined ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={onBack}
          >
            {L.backLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
