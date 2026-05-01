// @bainbridgebuilders/universal-auth | src/react/AuthProvider.tsx | v1.0.1 | 2026-05-01 | BB
// React provider with 3-context split per §8.4.
//
// Why split:
//   * Identity changes are rare (login / logout)
//   * Entitlements change rarely (plan upgrade, admin grant)
//   * Status changes more often (loading → ready → offline → ready)
// Splitting prevents `useEntitlements()` consumers from re-rendering on every
// status flip and vice-versa. Subscribers get exactly one context's slice.

import {
  createContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useReducer,
  type ReactNode,
} from 'react';
import {
  onSessionChange,
  hasLiveAccessToken,
} from '../core/token-manager.js';
import {
  AuthSessionExpired,
  AuthSessionRevoked,
  AuthSdkError,
} from '../errors.js';
import {
  getEntitlementsSnapshot,
  refreshEntitlements,
  onEntitlementsChange,
} from '../core/entitlements.js';
import { get } from '../core/client.js';
import type { Session, Identity, Persona, AgentContext } from '../types/api.js';

// ── Context shapes ────────────────────────────────────────────────────────

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated' | 'offline';

export interface IdentityContextValue {
  identity: Identity | null;
  primary_persona: string | null;
  personas: readonly Persona[];
  agent: AgentContext | null;
  /** Active persona for the current tab — driven by URL or last-set. */
  activePersona: Persona | null;
  setActivePersona: (personaType: string) => void;
}

export interface EntitlementsContextValue {
  features: readonly string[];
  app_access: readonly string[];
  hasFeature: (key: string) => boolean;
  hasAppAccess: (appId: string) => boolean;
}

export interface StatusContextValue {
  status: AuthStatus;
}

// ── Contexts ──────────────────────────────────────────────────────────────

export const IdentityContext = createContext<IdentityContextValue | null>(null);
IdentityContext.displayName = 'BBAuthIdentityContext';

export const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);
EntitlementsContext.displayName = 'BBAuthEntitlementsContext';

export const StatusContext = createContext<StatusContextValue | null>(null);
StatusContext.displayName = 'BBAuthStatusContext';

// ── Provider ──────────────────────────────────────────────────────────────

export interface AuthProviderProps {
  children: ReactNode;
  /**
   * Optional initial session — useful for SSR hydration. If omitted the
   * provider hydrates async via `/auth/v1/me`.
   */
  initialSession?: Session;
  /**
   * Optional explicit active-persona resolver. Default reads from the URL
   * pathname's first segment (e.g. `/crew/...` → `crew`).
   */
  resolveActivePersona?: (personas: readonly Persona[]) => Persona | null;
}

export function AuthProvider({
  children,
  initialSession,
  resolveActivePersona,
}: AuthProviderProps): ReactNode {
  const [identity, setIdentity] = useState<Identity | null>(
    initialSession?.identity ?? null
  );
  const [personas, setPersonas] = useState<readonly Persona[]>(
    initialSession?.personas ?? []
  );
  const [primaryPersona, setPrimaryPersona] = useState<string | null>(
    initialSession?.primary_persona ?? null
  );
  const [agent, setAgent] = useState<AgentContext | null>(
    initialSession?.agent ?? null
  );
  const [activeType, setActiveType] = useState<string | null>(null);

  const [features, setFeatures] = useState<readonly string[]>(
    initialSession?.aggregate?.features ?? []
  );
  const [appAccess, setAppAccess] = useState<readonly string[]>(
    initialSession?.aggregate?.app_access ?? []
  );

  // Bump-counter so the entitlementsValue memo re-evaluates when the
  // entitlements cache (offline-grace logic in core/entitlements.ts) emits
  // a change notification. Wired to `onEntitlementsChange` below.
  const [entitlementsTick, bumpEntitlements] = useReducer((x: number) => x + 1, 0);

  const [status, setStatus] = useState<AuthStatus>(() => {
    if (initialSession === undefined) return 'loading';
    // Respect navigator.onLine at mount when an initial session is supplied
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    return 'authenticated';
  });

  // ── Hydration ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (initialSession !== undefined) return;
    let cancelled = false;

    async function hydrate(): Promise<void> {
      // ALWAYS attempt /me. The session may live in the cross-subdomain
      // cookie (D10 / §5.0) without an in-memory access token — typical when
      // the user just hopped from controltower.bb.com to express.bb.com.
      // The client sends `credentials: 'include'`, so the cookie travels.
      try {
        const { data } = await get<Session>('/auth/v1/me');
        if (cancelled) return;
        applySession(data);
        // Backfill entitlements cache
        void refreshEntitlements();
      } catch (err) {
        if (cancelled) return;
        // Only mark anonymous on auth-class failures. Network or 5xx leaves
        // the provider in 'loading' so the app retries naturally and the
        // user doesn't see a logged-out flash on flaky connections.
        if (
          err instanceof AuthSessionExpired ||
          err instanceof AuthSessionRevoked ||
          (err instanceof AuthSdkError && isAnonymousCode(err.code))
        ) {
          setStatus('anonymous');
        }
        // Otherwise: stay 'loading'; session-watcher / next user action retries.
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  // ── Session-change subscription ────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onSessionChange(() => {
      if (!hasLiveAccessToken()) {
        // Session cleared
        setIdentity(null);
        setPersonas([]);
        setPrimaryPersona(null);
        setAgent(null);
        setFeatures([]);
        setAppAccess([]);
        setStatus('anonymous');
        return;
      }
      // Session installed/refreshed — re-fetch /me
      void (async () => {
        try {
          const { data } = await get<Session>('/auth/v1/me');
          applySession(data);
          void refreshEntitlements();
        } catch {
          // Fetch failed but token exists; keep status authenticated and let
          // session-watcher handle future revocations.
        }
      })();
    });
    return unsubscribe;
  }, []);

  // ── Entitlements-cache subscription ────────────────────────────────────
  //
  // The entitlements cache (core/entitlements.ts) holds offline-grace state
  // that can change asynchronously (refresh on focus, grace expiry tick, etc.)
  // without any local state in this provider mutating. Without an explicit
  // subscription the memo below would surface stale entitlements.
  // v1.0.1 (lookback fix): wired to real `onEntitlementsChange` export.
  useEffect(() => {
    return onEntitlementsChange(() => {
      bumpEntitlements();
    });
  }, []);

  // ── Online/offline tracking ────────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    function update(): void {
      if (!hasLiveAccessToken()) {
        setStatus('anonymous');
        return;
      }
      setStatus(navigator.onLine ? 'authenticated' : 'offline');
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // ── Active persona resolution ──────────────────────────────────────────

  useEffect(() => {
    if (personas.length === 0) {
      setActiveType(null);
      return;
    }
    if (resolveActivePersona !== undefined) {
      const p = resolveActivePersona(personas);
      setActiveType(p?.persona_type ?? null);
      return;
    }
    // Default: read the URL's first path segment
    if (typeof window === 'undefined') {
      setActiveType(primaryPersona ?? personas[0]?.persona_type ?? null);
      return;
    }
    const first = window.location.pathname.split('/').filter(Boolean)[0];
    const matched = personas.find((p) => p.persona_type === first);
    setActiveType(
      matched?.persona_type ?? primaryPersona ?? personas[0]?.persona_type ?? null
    );
  }, [personas, primaryPersona, resolveActivePersona]);

  // ── Helpers ────────────────────────────────────────────────────────────

  function applySession(s: Session): void {
    setIdentity(s.identity);
    setPersonas(s.personas ?? []);
    setPrimaryPersona(s.primary_persona ?? null);
    setAgent(s.agent ?? null);
    setFeatures(s.aggregate?.features ?? []);
    setAppAccess(s.aggregate?.app_access ?? []);
    setStatus(
      typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'offline'
        : 'authenticated'
    );
  }

  const setActivePersonaCb = useCallback((personaType: string): void => {
    setActiveType(personaType);
  }, []);

  // ── Memoized context values (stable references) ───────────────────────

  const identityValue = useMemo<IdentityContextValue>(() => {
    const active = personas.find((p) => p.persona_type === activeType) ?? null;
    return {
      identity,
      primary_persona: primaryPersona,
      personas,
      agent,
      activePersona: active,
      setActivePersona: setActivePersonaCb,
    };
  }, [identity, primaryPersona, personas, agent, activeType, setActivePersonaCb]);

  const entitlementsValue = useMemo<EntitlementsContextValue>(() => {
    // Snapshot wins when present (it includes the offline grace logic).
    // Otherwise fall back to the in-memory aggregate from /me.
    // `entitlementsTick` is a subscription bump so this memo re-evaluates on
    // entitlements-cache changes (offline grace expiry, refresh, etc.) — the
    // tick is read here intentionally to participate in dependency tracking.
    void entitlementsTick;
    const snap = getEntitlementsSnapshot();
    const f = snap?.features ?? features;
    const a = snap?.app_access ?? appAccess;
    return {
      features: f,
      app_access: a,
      hasFeature: (k: string) => f.includes(k),
      hasAppAccess: (id: string) => a.includes(id),
    };
  }, [features, appAccess, entitlementsTick]);

  const statusValue = useMemo<StatusContextValue>(() => ({ status }), [status]);

  // 3-context split — components subscribe to whichever they need
  return (
    <IdentityContext.Provider value={identityValue}>
      <EntitlementsContext.Provider value={entitlementsValue}>
        <StatusContext.Provider value={statusValue}>
          {children}
        </StatusContext.Provider>
      </EntitlementsContext.Provider>
    </IdentityContext.Provider>
  );
}

// HTTP-status / error-code helper for hydrate path
function isAnonymousCode(code: string): boolean {
  return (
    code === 'AUTH_SESSION_EXPIRED' ||
    code === 'AUTH_SESSION_REVOKED' ||
    code === 'HTTP_401' ||
    code === 'HTTP_403'
  );
}
