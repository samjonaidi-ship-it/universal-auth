// @samjonaidi-ship-it/universal-auth | src/react/AuthProvider.tsx | v1.2.0 | 2026-10-14 | BB
// v1.2.0 (rc.23, issue #32): the mint is scoped to the session it started
//   under. A sign-in that lands during a failed mint reports 'live' (its own
//   token), and a mint that a sign-in or sign-out overtook sets nothing; its
//   own terminal refresh clear still reports 'cookie_only'. The initialSession
//   note runs only with no live token, so it cannot relabel a newer token
//   sign-in. The initialSession effect is keyed on the session id, so a new
//   object with the same session does not re-run the mint.
// v1.1.0 (rc.22): status 'authenticated' no longer hides a missing token.
//   - StatusContext adds `tokenState`: 'live' | 'cookie_only' | 'none'.
//   - After /me succeeds with no in-memory token, hydrate tries ONE mint
//     (getAccessToken()); if that yields nothing the session is reported
//     'cookie_only' instead of passing for a token session.
//   - hydrate records the cookie session's id (session_meta.session_id) via
//     noteCookieSession(), so cookie-only sessions have a scope too.
//   status stays 'authenticated' for a cookie-only session: the cookie is a
//   real session (D10 cross-subdomain SSO) and existing consumers rely on it.
//   Devin round 1 (PR #31): tokenState 'refresh_error' when the mint throws
//   (transient, not "no refresh token"); online/offline no longer flips a
//   cookie session to anonymous; an initialSession with no bearer reports
//   'cookie_only' and records its session id.
//   Pre-push review (PR #31): /me's session id is recorded only if no session
//   change overtook the request; a terminal mint error reports 'cookie_only'
//   (not the retryable 'refresh_error'); an initialSession with no bearer
//   tries one mint too.
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
  useRef,
  type ReactNode,
} from 'react';
import {
  onSessionChange,
  hasLiveAccessToken,
  getAccessToken,
  getSessionScope,
  isTerminalRefreshError,
  isRefreshClearCurrent,
  isSessionScopeCurrent,
  noteCookieSession,
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
import { invalidateAccessCache } from '../core/abac.js';
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

/**
 * v1.1.0: whether the SDK holds an access token for this session.
 *   live        — a bearer token is in memory (or was just minted);
 *   cookie_only — /me succeeded on the session cookie, but no token could be
 *                 minted (no refresh token on this origin). Cookie-authed
 *                 calls work; bearer-only calls will not;
 *   refresh_error — /me succeeded on the cookie, but the mint attempt failed
 *                 (network, 5xx, a non-terminal refresh error). Transient: the
 *                 next getAccessToken() retries;
 *   none        — no session, or not hydrated yet.
 */
export type TokenState = 'live' | 'cookie_only' | 'refresh_error' | 'none';

export interface StatusContextValue {
  status: AuthStatus;
  /** v1.1.0 — see TokenState. */
  tokenState: TokenState;
}

/**
 * One mint attempt for a session that has no bearer token yet. Null from
 * getAccessToken() means no refresh token on this origin (onTokenUnavailable
 * has fired). A terminal refresh error means the refresh token is dead, so
 * retrying cannot help; any other throw is transient.
 *
 * v1.2.0 (issue #32): returns null when a sign-in or sign-out overtook the
 * mint; the caller then sets nothing (the session listener owns that change).
 * A live token after the mint is 'live' whatever the mint did: it is the
 * token of a sign-in that landed meanwhile. The mint's own terminal refresh
 * clear moves the session too; that move still reports 'cookie_only'.
 */
async function mintTokenState(): Promise<TokenState | null> {
  if (hasLiveAccessToken()) return 'live';
  const scope = getSessionScope();
  let failed = false;
  let failure: unknown = null;
  try {
    await getAccessToken();
  } catch (err) {
    failed = true;
    failure = err;
  }
  if (hasLiveAccessToken()) return 'live';
  if (!isSessionScopeCurrent(scope) && !isRefreshClearCurrent()) return null;
  if (!failed) return 'cookie_only';
  return isTerminalRefreshError(failure) ? 'cookie_only' : 'refresh_error';
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

  const [tokenState, setTokenStateRaw] = useState<TokenState>(() => {
    if (hasLiveAccessToken()) return 'live';
    // An SSR session with no bearer is a cookie session (Devin, PR #31).
    return initialSession !== undefined ? 'cookie_only' : 'none';
  });
  // The online/offline handler reads the latest value without re-binding.
  const tokenStateRef = useRef<TokenState>(tokenState);
  const setTokenState = useCallback((next: TokenState): void => {
    tokenStateRef.current = next;
    setTokenStateRaw(next);
  }, []);

  // ── Hydration ──────────────────────────────────────────────────────────

  // v1.2.0: keyed on the session id, not the object. A parent that passes a
  // new initialSession object each render must not re-run the mint.
  const hasInitialSession = initialSession !== undefined;
  const initialSessionId = initialSession?.session_meta?.session_id;

  useEffect(() => {
    if (hasInitialSession) {
      // A live token is a newer token sign-in: the SSR snapshot must not
      // relabel it with its own id, and there is nothing to mint (issue #32).
      if (hasLiveAccessToken()) return;
      // No /me round-trip: scope the SSR session from its own metadata.
      noteCookieSession(initialSessionId);
      let cancelledMint = false;
      void mintTokenState().then((next) => {
        if (!cancelledMint && next !== null) setTokenState(next);
      });
      return () => {
        cancelledMint = true;
      };
    }
    let cancelled = false;

    async function hydrate(): Promise<void> {
      // ALWAYS attempt /me. The session may live in the cross-subdomain
      // cookie (D10 / §5.0) without an in-memory access token — typical when
      // the user just hopped from controltower.bb.com to express.bb.com.
      // The client sends `credentials: 'include'`, so the cookie travels.
      try {
        const scopeAtRequest = getSessionScope();
        const { data } = await get<Session>('/auth/v1/me');
        if (cancelled) return;
        // v1.1.0: give a cookie session an id + generation. Dropped if a
        // sign-in or sign-out happened while /me was in flight.
        noteCookieSession(data.session_meta?.session_id, scopeAtRequest);
        // Cookie alive, no local token: try to mint one, once.
        const next = await mintTokenState();
        if (cancelled) return;
        // v1.2.0: a sign-in or sign-out overtook the mint. This /me reply
        // is about the old session; the session listener owns the new one.
        if (next === null) return;
        setTokenState(next);
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
  }, [hasInitialSession, initialSessionId, setTokenState]);

  // ── Session-change subscription ────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onSessionChange(() => {
      // ABAC cache is identity-scoped; flush on every session change so
      // a sign-out → sign-in as a different identity can't surface a
      // stale `permit` from the previous session.
      invalidateAccessCache();
      if (!hasLiveAccessToken()) {
        // Session cleared
        setTokenState('none');
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
      setTokenState('live');
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
  }, [setTokenState]);

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
      const cookieSession =
        tokenStateRef.current === 'cookie_only' || tokenStateRef.current === 'refresh_error';
      // A cookie session has no bearer token by design; going on/offline
      // must not sign it out (Devin, PR #31).
      if (!hasLiveAccessToken() && !cookieSession) {
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

  const statusValue = useMemo<StatusContextValue>(
    () => ({ status, tokenState }),
    [status, tokenState]
  );

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
