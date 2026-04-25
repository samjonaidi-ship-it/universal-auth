// @bb/universal-auth | src/react/useEntitlements.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Public useEntitlements hook — subscribes to EntitlementsContext only.
// Components using only this hook DO NOT re-render on identity or status changes
// (the §8.4 context-split invariant).

import { useContext } from 'react';
import { EntitlementsContext } from './AuthProvider.js';

export interface UseEntitlementsReturn {
  features: readonly string[];
  app_access: readonly string[];
  hasFeature: (key: string) => boolean;
  hasAppAccess: (appId: string) => boolean;
}

export function useEntitlements(): UseEntitlementsReturn {
  const e = useContext(EntitlementsContext);
  if (e === null) {
    throw new Error(
      '[@bb/universal-auth] useEntitlements() called outside <AuthProvider>.'
    );
  }
  return e;
}
