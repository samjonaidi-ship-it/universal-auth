// @samjonaidi-ship-it/universal-auth | src/react/components/OfflineIndicator.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Subtle banner shown while the SDK is in 'offline' status (§9.3 state machine).

import type { ReactNode } from 'react';
import { useAuth } from '../useAuth.js';

export interface OfflineIndicatorProps {
  label?: string;
}

export function OfflineIndicator({
  label = "You're offline. Changes will sync when you reconnect.",
}: OfflineIndicatorProps): ReactNode {
  const { status } = useAuth();
  if (status !== 'offline') return null;
  return (
    <div
      className="bb-auth-offline-indicator"
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
}
