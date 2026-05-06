// @samjonaidi-ship-it/universal-auth | src/react/components/PasskeyPrompt.tsx | v1.1.0 | 2026-05-06 | BB
// Passkey CTA + Conditional UI hook. The actual WebAuthn ceremony lives in
// flows/passkey-flow (lazy-imported per §8.2 to keep the core bundle slim).
//
// This component is intentionally minimal — registration flows live in app
// code (BB_Express enroll screen, ControlTower admin self-service). Here we
// expose the UI primitive: a button + an inline error region.
//
// v1.1.0 (P1-A/B): + className/style + forwardRef<HTMLDivElement>

import { forwardRef, useState, type CSSProperties } from 'react';
import { AuthSdkError } from '../../errors.js';

export interface PasskeyPromptProps {
  /** Called when the user clicks the prompt — caller invokes the WebAuthn API. */
  onAuthenticate: () => Promise<void>;
  labels?: Partial<{
    button: string;
    description: string;
    error: string;
  }>;
  /** Optional class for the root <div>. */
  className?: string;
  /** Inline style for the root <div>. */
  style?: CSSProperties;
}

const DEFAULTS = {
  button: 'Sign in with passkey',
  description: 'Use Face ID, Touch ID, or your security key.',
  error: 'Passkey sign-in failed.',
};

export const PasskeyPrompt = forwardRef<HTMLDivElement, PasskeyPromptProps>(
  function PasskeyPrompt({ onAuthenticate, labels = {}, className, style }, ref) {
    const L = { ...DEFAULTS, ...labels };
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleClick(): Promise<void> {
      setError(null);
      setLoading(true);
      try {
        await onAuthenticate();
      } catch (err) {
        const msg =
          err instanceof AuthSdkError
            ? err.message
            : err instanceof Error
              ? err.message
              : L.error;
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    return (
      <div ref={ref} className={className ?? 'bb-auth-passkey-prompt'} style={style}>
        <button
          type="button"
          className="bb-auth-button bb-auth-button-primary"
          disabled={loading}
          onClick={() => void handleClick()}
        >
          {loading ? '…' : L.button}
        </button>
        <p className="bb-auth-description">{L.description}</p>
        {error !== null ? (
          <div role="alert" aria-live="assertive" className="bb-auth-error">
            {error}
          </div>
        ) : null}
      </div>
    );
  }
);
