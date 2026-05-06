// @samjonaidi-ship-it/universal-auth | src/react/useEntitlements.ts | v1.0.1 | 2026-05-08 | BB
// Public useEntitlements hook — subscribes to EntitlementsContext only.
// Components using only this hook DO NOT re-render on identity or status changes
// (the §8.4 context-split invariant).
//
// v1.0.1 (rc.5 audit D8): throws AuthProviderMissingError instead of plain Error
// so consumers can `instanceof AuthProviderMissingError` instead of regex-
// matching the message string.

import { useContext } from 'react';
import { EntitlementsContext } from './AuthProvider.js';
import { AuthProviderMissingError } from '../errors.js';

export interface UseEntitlementsReturn {
  features: readonly string[];
  app_access: readonly string[];
  hasFeature: (key: string) => boolean;
  hasAppAccess: (appId: string) => boolean;
}

export function useEntitlements(): UseEntitlementsReturn {
  const e = useContext(EntitlementsContext);
  if (e === null) {
    throw new AuthProviderMissingError('useEntitlements');
  }
  return e;
}
