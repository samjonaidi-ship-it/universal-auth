// @samjonaidi-ship-it/universal-auth | src/core/token-manager.ts | v1.1.0 | 2026-05-06 | BB
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
import { deleteKeypair } from './dpop/keypair.js';

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
      state.sessionId = raw.sessionId;
      notifyListeners();
      break;
    case 'session_cleared':
      state.accessToken = null;
      state.accessExpiresAt = 0;
      state.sessionId = null;
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
  state.sessionId = tokens.sessionId;

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
 * Called on logout, session.revoked, or 401 during refresh.
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
  state.sessionId = null;
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
 * Returns null if no session exists or refresh failed.
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

    const rt = await getRefreshToken();
    if (rt === null) {
      // No refresh token — need re-auth
      return null;
    }

    try {
      const result = await refreshCallback!(rt);
      const newExpiresAt = new Date(result.expires_at).getTime();

      state.accessToken = result.access_token;
      state.accessExpiresAt = newExpiresAt;
      state.sessionId = result.session_id;

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
          console.warn(
            '[@samjonaidi-ship-it/universal-auth] Refresh response is missing `refresh_expires_at`; falling back to 90-day default. Update CT BFF to v1.0.1+.'
          );
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
      // Refresh failed — most likely AUTH_SESSION_REVOKED or AUTH_SESSION_EXPIRED
      // Clear everything so the next getAccessToken() returns null → consumer re-auths
      await clearRefreshToken();
      state.accessToken = null;
      state.accessExpiresAt = 0;
      state.sessionId = null;
      broadcast({ type: 'session_cleared' });
      notifyListeners();
      // Re-throw so callers (client.ts retry logic) can distinguish refresh-failure
      // from no-token-present
      throw err;
    }
  });
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
       
      console.warn(
        '[@samjonaidi-ship-it/universal-auth] navigator.locks is unavailable; falling back to in-tab refresh mutex only. Cross-tab refreshes may run in parallel.'
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
