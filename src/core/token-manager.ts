// @samjonaidi-ship-it/universal-auth | src/core/token-manager.ts | v1.4.0 | 2026-10-14 | BB
// v1.4.0 (rc.22, gaps found by CalExp5 #881's "no session token" loop):
//   - No refresh token is no longer silent. performRefresh() still returns
//     null (getAccessToken() keeps its contract), but it now fires
//     onTokenUnavailable({reason:'no_refresh_token', ...scope}) once per
//     session generation, and getAccessTokenOrThrow() turns the null into a
//     typed AuthNoRefreshToken. Deliberately NOT via notifyListeners():
//     AuthProvider's listener would flip a valid cookie session to anonymous.
//   - Session generation + scope. Every change of session identity bumps a
//     counter; getSessionScope() returns {sessionId, generation, source}.
//     noteCookieSession() lets AuthProvider record the cookie session's id
//     from /me's session_meta, so a cookie-only session has an id and a
//     generation too. isSessionScopeCurrent() is the staleness check a
//     consumer uses to drop a session-expired event from a replaced session.
//   - isTerminalRefreshError() is exported. DEVICE_UNRECOGNIZED is documented
//     as NOT terminal (see the function).
//   - Doc comments corrected: the terminal set is three codes (the v1.2.0
//     notes said two); getAccessToken() re-throws a failed refresh (it said
//     "returns null").
// v1.3.2 (P4.7): performRefresh() now captures the session id it is
//   refreshing FOR before the network round-trip starts. A refresh can sit
//   on the wire for seconds; if a NEW session is installed (setSession(),
//   e.g. a PIN re-auth after the server revoked this very session) while the
//   OLD refresh is still in flight, the stale response — success or terminal
//   failure — must not mutate/clear/broadcast against whatever session is
//   merely current NOW. Production trace (ct_bff.audit_log, 2026-09-17): a
//   session revoked at T+0, a PIN re-auth mints a new session at T+6.8s, and
//   the stale refresh's 401 arrives at T+7.2s — which used to wipe the new
//   session's local state and (via the caller's cleanup signOut()) revoke it
//   server-side too. See flows/recovery.ts v1.3.0 for the matching guard on
//   the revoke side.
// v1.3.0 (P4.6): INVALID_DPOP_BINDING joins the terminal set — once sessions
//   are DPoP-bound, a lost keypair makes the refresh token permanently
//   unusable on that device and retrying would loop forever.
// Access + refresh token lifecycle. Enforces spec invariants:
//
//   §15.1  Access token in memory only, never disk
//   §5.0   v1.4.0       Access TTL 15 min (prod), refresh TTL 90 days
//   §8.2    Mutex-coalesced refresh (navigator.locks across tabs +
//                       in-tab Promise mutex; BroadcastChannel for token
//                       broadcast on success)
//
// v1.0.1 hardening:
//   B7 — refresh_expires_at now reads from the server response. The previous
//        hardcoded `Date.now() + 90d` survived as a fallback for legacy server
//        builds with a one-shot console warning.
//   D8 — BroadcastChannel handler validates message shape (token typeof +
//        bounded length) before adopting state, so a same-origin XSS injection
//        can't smuggle a fake session.
// v1.2.0 (P3.1) — refresh-failure classification. The catch in
//   performRefresh() no longer clears the stored refresh token on EVERY
//   failure. Only AUTH_SESSION_EXPIRED / AUTH_SESSION_REVOKED (and, since
//   v1.3.0, INVALID_DPOP_BINDING) clear; network
//   errors, aborts and 5xx keep the credential so a dead zone no longer signs
//   a crew member out (and, downstream in BB Express, no longer purges their
//   unsynced offline work). See isTerminalRefreshError().
//
// v1.0.1 hardening (cont.):
//   C1 — performRefresh() wraps the network call in navigator.locks
//        ('bb-auth-refresh', exclusive). Inside the lock we double-check
//        token freshness, so a tab that won the lock after another tab
//        already refreshed simply adopts the new token. Polyfill: if
//        navigator.locks is unavailable, falls back to the in-tab mutex
//        with a one-shot console.warn.

import {
  getRefreshToken,
  storeRefreshToken,
  clearRefreshToken,
  clearAllSessionState,
} from './storage.js';
import { deleteKeypair, loadKeypair } from './dpop/keypair.js';
import { jwkThumbprint } from './dpop/thumbprint.js';
import { reportSoftError } from './error-hook.js';
import {
  AuthNoRefreshToken,
  CnfJktMismatchError,
  LegacyRefreshResponseError,
  NoNavigatorLocksError,
} from '../errors.js';

// ── Public types ──────────────────────────────────────────────────────────

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
  /** Epoch ms when the refresh token expires. Default: now + 90 days. */
  refreshExpiresAt?: number;
  sessionId: string;
}

/**
 * Refresh response shape. v1.0.1 (B7): `refresh_expires_at` is REQUIRED
 * (typed `string`); a missing value triggers a fallback warning + 90-day default.
 */
export interface RefreshResponse {
  access_token: string;
  refresh_token?: string; // rotated if server provides a new one
  expires_at: string;     // ISO — access token expiry
  refresh_expires_at?: string; // ISO — refresh token expiry (REQUIRED in v1.0.1)
  session_id: string;
}

export interface RefreshCallback {
  /**
   * Called when the access token needs rotation. Implementation lives in
   * `core/client.ts` (POST /auth/v1/session/refresh). Decoupled so this
   * module has no HTTP dependency.
   */
  (refreshToken: string): Promise<RefreshResponse>;
}

// ── Internal state (memory only) ──────────────────────────────────────────

interface InternalState {
  accessToken: string | null;
  accessExpiresAt: number;  // epoch ms; 0 = unknown/expired
  sessionId: string | null;
  /** Active refresh promise — coalesces concurrent getAccessToken() callers. */
  inFlightRefresh: Promise<string | null> | null;
}

const state: InternalState = {
  accessToken: null,
  accessExpiresAt: 0,
  sessionId: null,
  inFlightRefresh: null,
};

let refreshCallback: RefreshCallback | null = null;

// ── Session generation / scope (v1.4.0) ───────────────────────────────────
//
// `generation` moves every time the session identity changes: setSession(),
// clearSession(), a terminal refresh clear, a broadcast from another tab that
// installs a different session or clears it, a refresh that returns a new
// session id, and noteCookieSession() adopting a cookie session's id. A
// consumer captures getSessionScope() when it starts work and drops the
// result if isSessionScopeCurrent() says the session was replaced meanwhile.

/** Where the current session id came from. */
export type SessionSource = 'token' | 'cookie';

export interface SessionScope {
  /** The session id, or null when there is no session. */
  sessionId: string | null;
  /** Monotonic counter; bumps on every change of session identity. */
  generation: number;
  /** 'token' = installed with tokens; 'cookie' = learned from /me only. */
  source: SessionSource | null;
}

let generation = 0;
let sessionSource: SessionSource | null = null;

function adoptSessionId(id: string | null, source: SessionSource | null): void {
  if (id !== state.sessionId) generation++;
  state.sessionId = id;
  sessionSource = id === null ? null : source;
}

// Safety margin — refresh 30 s before actual expiry to cover clock skew + flight time
const REFRESH_MARGIN_MS = 30_000;

// Default refresh TTL when the server doesn't return refresh_expires_at (legacy fallback).
const DEFAULT_REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Bound for BroadcastChannel-shipped token strings. Real JWTs are typically
// ~1-3 KB; 8 KB is a safe ceiling that still rejects obvious garbage.
const MAX_BROADCAST_TOKEN_LEN = 8192;

let warnedMissingRefreshExpiresAt = false;
let warnedNoNavigatorLocks = false;

// ── Multi-tab coordination (BroadcastChannel + navigator.locks) ───────────

const BROADCAST_CHANNEL_NAME = 'bb-universal-auth-session';
const REFRESH_LOCK_NAME = 'bb-auth-refresh';

type BroadcastMessage =
  | { type: 'session_updated'; accessToken: string; accessExpiresAt: number; sessionId: string }
  | { type: 'session_cleared' };

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (broadcastChannel !== null) return broadcastChannel;
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.addEventListener('message', (e: MessageEvent<unknown>) => {
      handleBroadcast(e.data);
    });
    return broadcastChannel;
  } catch {
    return null;
  }
}

/**
 * v1.0.1 (D8): validate the shape of every BroadcastChannel message before
 * adopting state. Same-origin XSS could inject a forged "session_updated"
 * with a malicious access token; rejecting unexpected shapes containment-walls
 * the SDK against that.
 */
function isValidBroadcastMessage(raw: unknown): raw is BroadcastMessage {
  if (raw === null || typeof raw !== 'object') return false;
  const msg = raw as Record<string, unknown>;
  if (msg.type === 'session_cleared') return true;
  if (msg.type !== 'session_updated') return false;
  if (typeof msg.accessToken !== 'string' || msg.accessToken.length === 0) return false;
  if (msg.accessToken.length > MAX_BROADCAST_TOKEN_LEN) return false;
  if (typeof msg.accessExpiresAt !== 'number' || !Number.isFinite(msg.accessExpiresAt)) return false;
  if (typeof msg.sessionId !== 'string' || msg.sessionId.length === 0) return false;
  if (msg.sessionId.length > MAX_BROADCAST_TOKEN_LEN) return false;
  return true;
}

function handleBroadcast(raw: unknown): void {
  if (!isValidBroadcastMessage(raw)) {
    // Silent reject — don't give an attacker feedback. Real bugs surface in
    // unit tests, not via runtime probing.
    return;
  }
  switch (raw.type) {
    case 'session_updated':
      // Another tab refreshed; adopt its access token without re-fetching
      state.accessToken = raw.accessToken;
      state.accessExpiresAt = raw.accessExpiresAt;
      adoptSessionId(raw.sessionId, 'token');
      notifyListeners();
      break;
    case 'session_cleared':
      state.accessToken = null;
      state.accessExpiresAt = 0;
      adoptSessionId(null, null);
      notifyListeners();
      break;
  }
}

function broadcast(msg: BroadcastMessage): void {
  const ch = getBroadcastChannel();
  if (ch !== null) {
    try {
      ch.postMessage(msg);
    } catch {
      // Channel closed or message non-cloneable — ignore
    }
  }
}

// ── Session-change listeners (for useAuth hook) ───────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // Listener bugs must not crash the token manager
    }
  }
}

// ── Token-unavailable listeners (v1.4.0) ──────────────────────────────────

export interface TokenUnavailableEvent extends SessionScope {
  /** Why no access token could be produced. */
  reason: 'no_refresh_token';
}

type TokenUnavailableListener = (e: TokenUnavailableEvent) => void;
const tokenUnavailableListeners = new Set<TokenUnavailableListener>();
/** Generation we last fired for — fire once per generation, not per call. */
let tokenUnavailableFiredFor: number | null = null;

/**
 * Subscribe to "the SDK could not produce an access token". Today the only
 * reason is `no_refresh_token`: getAccessToken() needed a refresh and found
 * no stored refresh token (a cookie-only session after a subdomain hop, or
 * never signed in). Fires once per session generation, so a consumer that
 * calls getAccessToken() on every request is not flooded. Session state is
 * NOT changed: a cookie-only session stays valid for cookie-authenticated
 * calls.
 */
export function onTokenUnavailable(listener: TokenUnavailableListener): () => void {
  tokenUnavailableListeners.add(listener);
  return () => {
    tokenUnavailableListeners.delete(listener);
  };
}

function notifyTokenUnavailable(reason: TokenUnavailableEvent['reason']): void {
  if (tokenUnavailableFiredFor === generation) return;
  tokenUnavailableFiredFor = generation;
  const event: TokenUnavailableEvent = { reason, ...getSessionScope() };
  for (const l of tokenUnavailableListeners) {
    try {
      l(event);
    } catch {
      // Listener bugs must not crash the token manager
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Register the refresh callback. Called once at SDK init (from client.ts).
 * Decoupling: token-manager has zero HTTP knowledge.
 */
export function registerRefreshCallback(cb: RefreshCallback): void {
  refreshCallback = cb;
}

/**
 * Install a full session after login/enroll/activate success.
 * Stores refresh token encrypted to IDB. Broadcasts to other tabs.
 */
export async function setSession(tokens: SessionTokens): Promise<void> {
  state.accessToken = tokens.accessToken;
  state.accessExpiresAt = tokens.expiresAt;
  // Always a new generation: a fresh install is a new session even when the
  // server re-uses the id.
  generation++;
  state.sessionId = tokens.sessionId;
  sessionSource = 'token';

  const refreshExpiresAt = tokens.refreshExpiresAt ?? Date.now() + DEFAULT_REFRESH_TTL_MS;
  await storeRefreshToken(tokens.refreshToken, refreshExpiresAt);

  broadcast({
    type: 'session_updated',
    accessToken: tokens.accessToken,
    accessExpiresAt: tokens.expiresAt,
    sessionId: tokens.sessionId,
  });
  notifyListeners();
}

/**
 * Clear all session state — memory + IDB + broadcast.
 * Called on session.logout, session.revoked, or 401 during refresh.
 *
 * v1.0.2 (L3.1, DPOP_DESIGN_v1.0.md §5.3): also deletes the DPoP keypair.
 * Sign-out kills the cryptographic identity along with the session — the
 * next sign-in mints a fresh keypair so old proofs can't bind to a new
 * session. `deleteKeypair()` is best-effort and swallows IDB errors.
 *
 * v1.1.0 (L3.2): also closes the SSE stream (idempotent no-op when SSE
 * isn't running). Lazy-imported to avoid a static circular dep with
 * session-events, which calls back into clearSession on session.revoked.
 */
export async function clearSession(): Promise<void> {
  state.accessToken = null;
  state.accessExpiresAt = 0;
  generation++;
  state.sessionId = null;
  sessionSource = null;
  state.inFlightRefresh = null;

  await clearAllSessionState();
  await deleteKeypair();
  broadcast({ type: 'session_cleared' });
  notifyListeners();

  try {
    const { stopSessionEvents } = await import('./session-events.js');
    stopSessionEvents();
  } catch {
    // Module not loaded (e.g., older bundle) — ignore.
  }
}

/**
 * Return a valid access token, refreshing if needed.
 * Concurrent callers coalesce on a single in-flight refresh (§8.2).
 *
 * v1.4.0 — what it really does (the old line said "returns null if no
 * session exists or refresh failed", which was wrong on both counts):
 *   - a live token in memory → that token, no network;
 *   - SDK not initialised (no refresh callback) → whatever token is in
 *     memory, possibly null or stale;
 *   - no stored refresh token → null, and onTokenUnavailable fires once for
 *     this session generation. This is the cookie-only case: the session
 *     may still be valid server-side;
 *   - refresh succeeded → the new token;
 *   - refresh FAILED → it RE-THROWS. Terminal errors (isTerminalRefreshError)
 *     have cleared the session first; transient ones have kept the refresh
 *     token. A failure is never turned into null.
 * Use getAccessTokenOrThrow() to get a typed AuthNoRefreshToken instead of
 * the null.
 */
export async function getAccessToken(): Promise<string | null> {
  // Fast path — valid access token in memory
  if (state.accessToken !== null && !isExpiringSoon(state.accessExpiresAt)) {
    return state.accessToken;
  }

  // Mutex: if a refresh is in flight, wait for it
  if (state.inFlightRefresh !== null) {
    return state.inFlightRefresh;
  }

  // Start a new refresh
  state.inFlightRefresh = performRefresh();
  try {
    const token = await state.inFlightRefresh;
    return token;
  } finally {
    state.inFlightRefresh = null;
  }
}

/**
 * v1.4.0: like getAccessToken(), but never resolves null. When no access
 * token can be produced it throws AuthNoRefreshToken, so a caller can tell
 * "no token to mint from" apart from a transient refresh failure (which
 * re-throws the original error, e.g. a TypeError or HTTP_503).
 */
export async function getAccessTokenOrThrow(): Promise<string> {
  const token = await getAccessToken();
  if (token === null) {
    throw new AuthNoRefreshToken(
      'no access token: no refresh token is stored for this origin (cookie-only session or signed out)',
    );
  }
  return token;
}

// ── Refresh-failure classification (P3.1) ─────────────────────────────────

/**
 * Is this refresh failure TERMINAL — i.e. is the stored refresh token now
 * genuinely dead server-side, so keeping it can only produce more 401s?
 *
 * Terminal means exactly three codes:
 *   AUTH_SESSION_EXPIRED  — past the 90-day refresh TTL.
 *   AUTH_SESSION_REVOKED  — the BFF's single answer for user/admin revoke,
 *                           reuse-detection family revoke, and a
 *                           disabled/deleted identity (it maps both
 *                           REUSE_DETECTED and IDENTITY_INACTIVE onto this).
 *   INVALID_DPOP_BINDING  — (P4.6) the local keypair no longer matches the
 *                           cnf_jkt this token is bound to. Unrecoverable on
 *                           this device; see the note at the check.
 *
 * Anything else is treated as transient and the credential is kept. That
 * default direction is chosen on purpose: wrongly keeping a dead token costs
 * one extra failed request that ends in a real 401 and clears properly on the
 * next attempt, while wrongly deleting a live token strands a crew member
 * behind a PIN prompt in the exact moment they have no connectivity. The cheap
 * error is the one we take.
 *
 * Deliberately NOT terminal:
 *   - a raw TypeError from fetch (DNS, offline, TLS, captive portal)
 *   - AbortError / timeouts
 *   - HTTP_5xx (client.ts throws `HTTP_${status}` when the body is not JSON)
 *   - UNEXPECTED_REDIRECT (a captive portal's interception looks like this)
 *   - INVALID_DPOP_HEADER / INVALID_DPOP_TYPE — our proof was malformed. A
 *     client bug or a clock problem; the refresh token itself is fine and
 *     deleting it would sign users out over a code defect.
 *   - DPOP_REPLAY — the jti was already seen. Every proof mints a fresh jti,
 *     so a retry succeeds on its own.
 *   - DEVICE_UNRECOGNIZED (decided v1.4.0) — it means "verify this device"
 *     (a step-up), not "this credential is dead". The CT BFF does not return
 *     it from /auth/v1/session/refresh today (no emitter in bff/, checked
 *     2026-10-14). If it ever does, deleting a refresh token over a step-up
 *     prompt would sign the crew member out; the caller should route the
 *     error to its verification UI instead. CalExp5 #881 made the same call.
 *
 * v1.4.0: exported, so consumers classify refresh errors with the SDK's own
 * rule instead of copying the code list.
 */
export function isTerminalRefreshError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return (
    code === 'AUTH_SESSION_EXPIRED' ||
    code === 'AUTH_SESSION_REVOKED' ||
    // P4.6: the BFF returns the raw DpopError code on a bound-session refresh,
    // so these arrive here unmapped rather than as AUTH_SESSION_*.
    //
    // INVALID_DPOP_BINDING means the proof's key does not match the `cnf_jkt`
    // this refresh token is bound to — the keypair is gone (IndexedDB cleared,
    // profile reset) while the token survived. No retry can regenerate the
    // original non-extractable private key, so the credential is dead FOR THIS
    // DEVICE and re-auth is the only path. Without this it would classify as
    // transient and retry a permanently-doomed refresh forever, leaving the
    // user in an app that is neither working nor signed out.
    code === 'INVALID_DPOP_BINDING'
  );
}

async function performRefresh(): Promise<string | null> {
  if (refreshCallback === null) {
    // SDK not initialized yet — no way to refresh
    return state.accessToken;
  }

  // v1.0.1 (C1): use Web Locks API to coordinate refreshes across tabs. The
  // in-tab mutex (state.inFlightRefresh) is still the inner ring; navigator.
  // locks is the outer ring that prevents two tabs from each issuing their
  // own refresh in parallel.
  return runUnderRefreshLock(async () => {
    // Double-check inside the lock — if another tab refreshed while we were
    // waiting, its session_updated broadcast already populated our state.
    if (state.accessToken !== null && !isExpiringSoon(state.accessExpiresAt)) {
      return state.accessToken;
    }

    // P4.7: capture which session this attempt is FOR, before the network
    // round-trip starts. See the note at the catch block below — this is
    // what lets a stale response tell "still mine" from "superseded".
    const sessionIdAtStart = state.sessionId;

    const rt = await getRefreshToken();
    if (rt === null) {
      // No refresh token: nothing to mint from. Return null (the documented
      // getAccessToken() contract) but SAY so. Before v1.4.0 this was silent,
      // so a caller could not tell "no token" from a blip (CalExp5 #881's
      // reconnect loop). No notifyListeners(): the session may be a valid
      // cookie-only one, and AuthProvider's listener would mark it anonymous.
      notifyTokenUnavailable('no_refresh_token');
      return null;
    }

    try {
      const result = await refreshCallback!(rt);
      const newExpiresAt = new Date(result.expires_at).getTime();

      // P1-G (RFC 9449 §6.1): if the issued access token carries `cnf.jkt`,
      // verify it matches the local DPoP keypair's thumbprint. Mismatch means
      // the server bound the token to a different key — clear session + abort
      // rather than adopt a token we can't sign proofs for. Defensive only:
      // catches BFF mis-config (e.g., key rotation drift) one round-trip
      // earlier than waiting for the next request to fail server-side.
      // JWT parse errors (opaque tokens, no `cnf` claim) are non-fatal.
      const verifyResult = await verifyAccessTokenJktBinding(result.access_token);
      if (verifyResult === 'mismatch') {
        await clearRefreshToken();
        state.accessToken = null;
        state.accessExpiresAt = 0;
        adoptSessionId(null, null);
        broadcast({ type: 'session_cleared' });
        notifyListeners();
        // rc.7 D7-fu(b): typed error class so consumers can
        // `instanceof CnfJktMismatchError`-check. Local DPoP keypair is
        // intentionally retained: the next sign-in proves possession of
        // the same key, and the server's policy may permit re-binding.
        throw new CnfJktMismatchError(
          'refresh issued an access token bound to a different DPoP key',
        );
      }

      state.accessToken = result.access_token;
      state.accessExpiresAt = newExpiresAt;
      adoptSessionId(result.session_id, 'token');

      // v1.0.1 (B7): use server-returned refresh_expires_at when present.
      // Legacy servers (pre-v1.0.1) won't return the field; fall back to
      // 90 days and warn once so the gap is visible in logs.
      // v1.0.1 (lookback C5): also honor refresh_expires_at when the refresh
      // token isn't rotated — server may extend lifetime without re-issuing.
      let refreshExpiresAt: number | null = null;
      if (result.refresh_expires_at !== undefined) {
        refreshExpiresAt = new Date(result.refresh_expires_at).getTime();
      } else if (result.refresh_token !== undefined) {
        // Only warn when we get a rotated token without a TTL — that's the
        // "old server" case. Missing TTL with no rotation is normal (server
        // declined to rotate this round; existing TTL stands).
        if (!warnedMissingRefreshExpiresAt) {
          warnedMissingRefreshExpiresAt = true;
          // P1-E — route through onError hook; fall back to console.warn.
          const err = new LegacyRefreshResponseError(
            'refresh response missing `refresh_expires_at`; falling back to 90-day default. Update CT BFF to v1.0.1+.',
          );
          reportSoftError(err);
        }
        refreshExpiresAt = Date.now() + DEFAULT_REFRESH_TTL_MS;
      }

      if (result.refresh_token !== undefined && refreshExpiresAt !== null) {
        // Rotated token — persist new ciphertext + new TTL.
        await storeRefreshToken(result.refresh_token, refreshExpiresAt);
      } else if (refreshExpiresAt !== null) {
        // Server extended TTL without rotating — re-encrypt the existing
        // refresh token under the new expiry so subsequent reads see it.
        const existing = await getRefreshToken();
        if (existing !== null) {
          await storeRefreshToken(existing, refreshExpiresAt);
        }
      }

      broadcast({
        type: 'session_updated',
        accessToken: result.access_token,
        accessExpiresAt: newExpiresAt,
        sessionId: result.session_id,
      });
      notifyListeners();

      return result.access_token;
    } catch (err) {
      // ── P3.1: classify before destroying anything ──────────────────────
      //
      // This block used to clear unconditionally, with the comment "most likely
      // AUTH_SESSION_REVOKED or AUTH_SESSION_EXPIRED". "Most likely" was doing
      // a lot of work: a DNS failure, a 5xx, a captive portal or a truck
      // driving into a dead zone landed here too — and deleted a 90-day refresh
      // token that was still perfectly valid. The crew member is then signed
      // out and needs BOTH a PIN and connectivity to recover, in the one moment
      // they demonstrably have neither. Downstream in BB Express that also
      // triggered a state purge that took their unsynced offline edits with it.
      //
      // Only these are terminal (the credential really is dead server-side):
      //   AUTH_SESSION_EXPIRED  — refresh token past its 90-day TTL
      //   AUTH_SESSION_REVOKED  — user/admin revoke, reuse-detection family
      //                           revoke, or (CT mig 170+) a disabled/deleted
      //                           identity. The BFF maps all three to this code.
      //   INVALID_DPOP_BINDING  — (v1.3.0, P4.6) keypair lost; see
      //                           isTerminalRefreshError().
      //
      // Everything else — network error, timeout/abort, 5xx, an unparseable
      // response — is TRANSIENT. Keep the refresh token and let the caller
      // retry. The retry is safe because the BFF replays the cached response
      // for the same refresh token for 24h, so a dropped-but-delivered refresh
      // does not trip reuse detection.
      //
      // CNF_JKT_MISMATCH is not in the terminal list and does not need to be:
      // that path (above) has already cleared and notified before throwing, so
      // it lands in the transient branch as a no-op. Adding it here would only
      // double-clear.
      //
      // NOTE that replay is BEST-EFFORT server-side (fire-and-forget write,
      // ON CONFLICT DO NOTHING, skipped on >=500 and when the DB is down). So
      // it is a strong mitigation, not a guarantee: a retry after a replay-miss
      // can still land on reuse detection, which returns AUTH_SESSION_REVOKED
      // and is then correctly treated as terminal here. That degrades to
      // today's behaviour in a rare case instead of being today's behaviour in
      // every case.
      // P4.7: this refresh attempt was for `sessionIdAtStart`. A refresh can
      // sit on the wire for seconds on a bad connection — long enough for the
      // user to re-authenticate (PIN re-entry after the server revoked this
      // very session) and install a BRAND NEW session via setSession() before
      // this stale response ever arrives. `state.sessionId` at this point
      // reflects whichever session is current NOW, which may no longer be
      // the one that failed. Tearing down (local clear, IDB wipe, broadcast)
      // in that case would destroy a live, unrelated session for a failure
      // that has nothing to do with it — exactly the incident this guards
      // against: a stale session/refresh 401 must not evict the session that
      // superseded it.
      const staleness = state.sessionId !== sessionIdAtStart;
      if (isTerminalRefreshError(err)) {
        if (!staleness) {
          await clearRefreshToken();
          state.accessToken = null;
          state.accessExpiresAt = 0;
          adoptSessionId(null, null);
          broadcast({ type: 'session_cleared' });
          notifyListeners();
        }
      } else if (!staleness) {
        // Transient. Drop only the in-memory access token — it is expired or
        // near-expired anyway, so serving it would be wrong — but KEEP the
        // refresh token and the session id, and deliberately do NOT notify or
        // broadcast.
        //
        // The no-notify is load-bearing, not an oversight. AuthProvider's
        // listener gates purely on hasLiveAccessToken() (AuthProvider.tsx:172)
        // and calls setStatus('anonymous') the moment it is false — and
        // hasLiveAccessToken() is false whenever the token is merely
        // *expiring soon*, which is exactly when a refresh runs. So notifying
        // here would sign the user out on a dead-zone blip even though the
        // refresh token is intact, which is the A3 chain this phase exists to
        // break. The whole design relies on notifyListeners() firing only at
        // terminal points; a transient failure is not one.
        //
        // Not broadcasting is also deliberate: a `session_stale` message would
        // make every sibling tab drop a perfectly good access token because
        // ONE tab hit a blip. Each tab discovers a real failure on its own
        // refresh.
        state.accessToken = null;
        state.accessExpiresAt = 0;
      }

      // Re-throw either way, so a failed refresh is never mistaken for "no
      // token" (which resolves null above, with onTokenUnavailable).
      throw err;
    }
  });
}

/**
 * P1-G — verify the issued access token is bound to our DPoP keypair.
 *
 * Decode the JWT payload (no signature verify — informational only) and
 * compare `cnf.jkt` to the SHA-256 thumbprint of our local public key
 * (RFC 7638 / RFC 9449 §6.1). Returns:
 *
 *   'match'    — token's cnf.jkt equals our local thumbprint (good)
 *   'mismatch' — token's cnf.jkt is non-null AND differs (BAD — abort)
 *   'unbound'  — token has no `cnf.jkt` claim (legacy token, OK)
 *
 * Any parse error (opaque token, malformed JWT, missing keypair) returns
 * 'unbound' — the SDK shouldn't refuse a token just because it can't
 * inspect it. Server-side enforcement is the ultimate gate.
 */
async function verifyAccessTokenJktBinding(
  accessToken: string,
): Promise<'match' | 'mismatch' | 'unbound'> {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return 'unbound';
    const payloadSeg = parts[1];
    if (typeof payloadSeg !== 'string' || payloadSeg.length === 0) return 'unbound';
    // base64url → base64 → string
    const pad = payloadSeg.length % 4 === 0 ? 0 : 4 - (payloadSeg.length % 4);
    const b64 = (payloadSeg + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const payload = JSON.parse(json) as { cnf?: { jkt?: unknown } };
    const serverJkt = payload?.cnf?.jkt;
    if (typeof serverJkt !== 'string' || serverJkt.length === 0) return 'unbound';

    const pair = await loadKeypair();
    if (pair === null) return 'unbound'; // no local DPoP key yet — pre-DPoP install

    const localJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const localJkt = await jwkThumbprint(localJwk);
    return serverJkt === localJkt ? 'match' : 'mismatch';
  } catch {
    // JSON parse failure, base64 corruption, missing keypair store, etc.
    // Fail-safe to 'unbound' — don't block legitimate refreshes on parser
    // edge cases. The mismatch check is defense-in-depth, not the primary gate.
    return 'unbound';
  }
}

interface NavigatorWithLocks {
  locks?: {
    request<T>(
      name: string,
      opts: { mode: 'exclusive' | 'shared' },
      cb: () => Promise<T>
    ): Promise<T>;
  };
}

async function runUnderRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | NavigatorWithLocks
    | undefined;
  if (nav?.locks?.request === undefined) {
    if (!warnedNoNavigatorLocks) {
      warnedNoNavigatorLocks = true;
      // P1-E — route through onError hook; fall back to console.warn.
      reportSoftError(
        new NoNavigatorLocksError(
          'navigator.locks is unavailable; falling back to in-tab refresh mutex only. Cross-tab refreshes may run in parallel.',
        ),
      );
    }
    return work();
  }
  return nav.locks.request(REFRESH_LOCK_NAME, { mode: 'exclusive' }, work);
}

/**
 * Returns true if `expiresAt` is in the past OR within REFRESH_MARGIN_MS of now.
 * Exported for tests.
 */
export function isExpiringSoon(expiresAt: number): boolean {
  return expiresAt - REFRESH_MARGIN_MS <= Date.now();
}

/**
 * Current session id, or null. Used by event-reporter to stamp events.
 * No network call — reads memory state only.
 */
export function getCurrentSessionId(): string | null {
  return state.sessionId;
}

/** v1.4.0: the current session generation (see SessionScope). */
export function getSessionGeneration(): number {
  return generation;
}

/** v1.4.0: snapshot of which session is current. Zero network. */
export function getSessionScope(): SessionScope {
  return { sessionId: state.sessionId, generation, source: sessionSource };
}

/**
 * v1.4.0: is `scope` (captured earlier with getSessionScope()) still the
 * current session? False once any session change happened since. Use it to
 * drop a session-expired / revoked signal that a replaced session produced.
 */
export function isSessionScopeCurrent(scope: Pick<SessionScope, 'generation'>): boolean {
  return scope.generation === generation;
}

/**
 * v1.4.0: record the session id of a cookie-authenticated session, read from
 * /auth/v1/me's `session_meta.session_id`. This gives a cookie-only session
 * an id and a generation, so its events can be scoped. A token-installed
 * session always wins: a different id is ignored while one is held. Does not
 * notify session listeners (the signed-in identity did not change).
 * Called by AuthProvider after /me succeeds.
 */
export function noteCookieSession(sessionId: string | null | undefined): void {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return;
  if (sessionId === state.sessionId) return;
  if (state.sessionId !== null && sessionSource === 'token') return;
  adoptSessionId(sessionId, 'cookie');
}

/**
 * True if the SDK currently holds a valid-looking access token.
 * Zero network. Used by useAuth() status derivation.
 */
export function hasLiveAccessToken(): boolean {
  return state.accessToken !== null && !isExpiringSoon(state.accessExpiresAt);
}

/**
 * Mark the in-memory access token as expired without clearing the refresh token.
 * Called by client.ts when the server returns 401 on an apparently-valid token
 * (e.g., server-side revocation, clock skew). Forces the next getAccessToken()
 * call to attempt a real refresh rather than returning the stale cached value.
 */
export function invalidateAccessToken(): void {
  state.accessExpiresAt = 0;
}

// ── Test-only helper ──────────────────────────────────────────────────────

/**
 * Reset in-memory state + refresh callback.
 * Used by unit tests between cases.
 */
export function __resetTokenManagerForTests(): void {
  state.accessToken = null;
  state.accessExpiresAt = 0;
  state.sessionId = null;
  state.inFlightRefresh = null;
  refreshCallback = null;
  listeners.clear();
  tokenUnavailableListeners.clear();
  tokenUnavailableFiredFor = null;
  generation = 0;
  sessionSource = null;
  warnedMissingRefreshExpiresAt = false;
  warnedNoNavigatorLocks = false;
  if (broadcastChannel !== null) {
    try {
      broadcastChannel.close();
    } catch {
      // non-fatal
    }
    broadcastChannel = null;
  }
}
