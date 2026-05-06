// @samjonaidi-ship-it/universal-auth | src/react/useAuth.ts | v1.0.1 | 2026-05-08 | BB
// Public useAuth hook — subscribes to IdentityContext + StatusContext only.
// Per §D2.4: personas / activePersona / hasPersona / switchActivePersona / allFeatures / agent.
// allFeatures() reads entitlements module directly (so useAuth doesn't subscribe
// to EntitlementsContext and re-render when features change — see §8.4 split rule).
//
// v1.0.1 (rc.5 audit D2 + D8): signOut/signOutEverywhere now accept
// { signal?: AbortSignal } at the type boundary (the underlying flows
// already did, the React surface was hiding it). useAuth() throws
// AuthProviderMissingError instead of generic Error when called outside
// AuthProvider — gives consumers an instanceof check.

import { useContext, useCallback } from 'react';
import {
  IdentityContext,
  StatusContext,
  type AuthStatus,
} from './AuthProvider.js';
import type { Identity, Persona, AgentContext } from '../types/api.js';
import { getEntitlementsSnapshot } from '../core/entitlements.js';
import { signOut as signOutFlow, signOutEverywhere as signOutAllFlow } from '../flows/recovery.js';
import { requestCode as requestCodeFlow, verifyCode as verifyCodeFlow } from '../flows/code-flow.js';
import { AuthProviderMissingError } from '../errors.js';

export interface UseAuthReturn {
  // Core identity
  identity: Identity | null;
  status: AuthStatus;

  // D8 — multi-persona
  personas: readonly Persona[];
  activePersona: Persona | null;
  primary_persona: string | null;
  hasPersona: (personaType: string) => boolean;
  switchActivePersona: (personaType: string) => Promise<void>;
  allFeatures: () => readonly string[];

  // D13 — agent context (null for non-agent identities)
  agent: AgentContext | null;

  // Sign-in / sign-out
  signIn: typeof verifyCodeFlow;
  requestCode: typeof requestCodeFlow;
  // D2 (rc.5): signal? plumbed through. The underlying recovery.ts flows
  // already accepted AbortSignal; the React surface was hiding it.
  signOut: (options?: { signal?: AbortSignal }) => Promise<void>;
  signOutEverywhere: (options?: { signal?: AbortSignal }) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const id = useContext(IdentityContext);
  const st = useContext(StatusContext);
  if (id === null || st === null) {
    throw new AuthProviderMissingError('useAuth');
  }

  const hasPersona = useCallback(
    (personaType: string): boolean =>
      id.personas.some((p) => p.persona_type === personaType),
    [id.personas]
  );

  const switchActivePersona = useCallback(
    async (personaType: string): Promise<void> => {
      if (!id.personas.some((p) => p.persona_type === personaType)) {
        throw new Error(`Persona '${personaType}' not in this identity's personas`);
      }
      id.setActivePersona(personaType);
    },
    [id]
  );

  const allFeatures = useCallback((): readonly string[] => {
    // Pull from entitlements module — does NOT subscribe to changes
    // (callers who want reactive updates should use useEntitlements()).
    const snap = getEntitlementsSnapshot();
    return snap?.features ?? [];
  }, []);

  return {
    identity: id.identity,
    status: st.status,
    personas: id.personas,
    activePersona: id.activePersona,
    primary_persona: id.primary_persona,
    hasPersona,
    switchActivePersona,
    allFeatures,
    agent: id.agent,
    signIn: verifyCodeFlow,
    requestCode: requestCodeFlow,
    signOut: signOutFlow,
    signOutEverywhere: signOutAllFlow,
  };
}
