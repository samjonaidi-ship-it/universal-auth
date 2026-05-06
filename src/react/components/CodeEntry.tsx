// @samjonaidi-ship-it/universal-auth | src/react/components/CodeEntry.tsx | v1.1.0 | 2026-05-06 | BB
// 6-digit code entry. Single text input (avoids the per-digit anti-pattern
// that breaks paste, screen readers, and autofill).
//
// v1.1.0 (P1-A/B): + className/style/classNames slot map + forwardRef<HTMLFormElement>

import { forwardRef, useState, type CSSProperties, type FormEvent } from 'react';
import { AuthSdkError } from '../../errors.js';

export interface CodeEntryClassNames {
  root?: string;
  label?: string;
  input?: string;
  error?: string;
  button?: string;
}

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
  /** Optional class for the root <form> element (overrides default). */
  className?: string;
  /** Inline style for the root <form> element. */
  style?: CSSProperties;
  /** Per-slot class overrides. */
  classNames?: CodeEntryClassNames;
}

const DEFAULTS = {
  heading: 'Enter your code',
  description: 'We sent a 6-digit code to',
  codeLabel: '6-digit code',
  submitLabel: 'Verify',
  resendLabel: 'Send another',
  backLabel: 'Back',
};

export const CodeEntry = forwardRef<HTMLFormElement, CodeEntryProps>(
  function CodeEntry(
    {
      destination,
      onSubmit,
      onResend,
      onBack,
      labels = {},
      className,
      style,
      classNames,
    },
    ref
  ) {
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
        ref={ref}
        className={className ?? classNames?.root ?? 'bb-auth-code-entry'}
        style={style}
        aria-label={L.heading}
        onSubmit={handleSubmit}
        noValidate
      >
        <h2 className="bb-auth-heading">{L.heading}</h2>
        <p className="bb-auth-description">
          {L.description} <strong>{destination}</strong>.
        </p>

        <label className={classNames?.label ?? 'bb-auth-field'}>
          <span className="bb-auth-field-label">{L.codeLabel}</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className={classNames?.input}
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
            className={classNames?.error ?? 'bb-auth-error'}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          className={classNames?.button ?? 'bb-auth-button bb-auth-button-primary'}
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
);
