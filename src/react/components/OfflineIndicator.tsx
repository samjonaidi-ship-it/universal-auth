// @samjonaidi-ship-it/universal-auth | src/react/components/OfflineIndicator.tsx | v1.1.0 | 2026-05-06 | BB
// Subtle banner shown while the SDK is in 'offline' status (§9.3 state machine).
//
// v1.1.0 (P1-A/B): + className/style + forwardRef<HTMLDivElement>

import { forwardRef, type CSSProperties } from 'react';
import { useAuth } from '../useAuth.js';

export interface OfflineIndicatorProps {
  label?: string;
  /** Optional class for the root <div>. */
  className?: string;
  /** Inline style for the root <div>. */
  style?: CSSProperties;
}

export const OfflineIndicator = forwardRef<HTMLDivElement, OfflineIndicatorProps>(
  function OfflineIndicator(
    {
      label = "You're offline. Changes will sync when you reconnect.",
      className,
      style,
    },
    ref
  ) {
    const { status } = useAuth();
    if (status !== 'offline') return null;
    return (
      <div
        ref={ref}
        className={className ?? 'bb-auth-offline-indicator'}
        style={style}
        role="status"
        aria-live="polite"
      >
        {label}
      </div>
    );
  }
);
