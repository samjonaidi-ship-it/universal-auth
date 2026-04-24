// @bb/universal-auth | src/core/token-manager.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Access + refresh token lifecycle. Enforces spec invariants:
//
//   §15.1 L1353-L1354  Access token in memory only, never disk
//   §5.0   v1.4.0       Access TTL 15 min (prod), refresh TTL 90 days
//   §8.2   L826-L828    Mutex-coalesced refresh (Shared Worker primary;
//                       BroadcastChannel fallback for multi-tab coordination)
//
// Multi-tab note: Day 3 implementation uses BroadcastChannel for cross-tab
// signaling (which tab is refreshing + new-token broadcast on success).
// Shared Worker primary path lands in A3 per plan Block 4 Day 9-10.

import {
  getRefreshToken,
  storeRefreshToken,
  clearRefreshToken,
  clearAllSessionState,
} from './storage.js';

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

export interface RefreshCallback {
  /**
   * Called when the access token needs rotation. Implementation lives in
   * `core/client.ts` (POST /auth/v1/session/refresh). Decoupled so this
   * module has no HTTP dependency.
   */
  (refreshToken: string): Promise<{
    access_token: string;
    refresh_token?: string; // rotated if server provides a new one
    expires_at: string;      // ISO — access token expiry
    session_id: string;
  }>;
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

// ── Multi-tab coordination (BroadcastChannel primary; Shared Worker A3+) ──

const BROADCAST_CHANNEL_NAME = 'bb-universal-auth-session';

type BroadcastMessage =
  | { type: 'session_updated'; accessToken: string; accessExpiresAt: number; sessionId: string }
  | { type: 'session_cleared' };

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (broadcastChannel !== null) return broadcastChannel;
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    broadcastChannel.addEventListener('message', (e: MessageEvent<BroadcastMessage>) => {
      handleBroadcast(e.data);
    });
    return broadcastChannel;
  } catch {
    return null;
  }
}

function handleBroadcast(msg: BroadcastMessage): void {
  switch (msg.type) {
    case 'session_updated':
      // Another tab refreshed; adopt its access token without re-fetching
      state.accessToken = msg.accessToken;
      state.accessExpiresAt = msg.accessExpiresAt;
      state.sessionId = msg.sessionId;
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

  const refreshExpiresAt = tokens.refreshExpiresAt ?? Date.now() + 90 * 24 * 60 * 60 * 1000;
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
 */
export async function clearSession(): Promise<void> {
  state.accessToken = null;
  state.accessExpiresAt = 0;
  state.sessionId = null;
  state.inFlightRefresh = null;

  await clearAllSessionState();
  broadcast({ type: 'session_cleared' });
  notifyListeners();
}

/**
 * Return a valid access token, refreshing if needed.
 * Concurrent callers coalesce on a single in-flight refresh (§8.2 L828).
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

  const rt = await getRefreshToken();
  if (rt === null) {
    // No refresh token — need re-auth
    return null;
  }

  try {
    const result = await refreshCallback(rt);
    const newExpiresAt = new Date(result.expires_at).getTime();

    state.accessToken = result.access_token;
    state.accessExpiresAt = newExpiresAt;
    state.sessionId = result.session_id;

    if (result.refresh_token !== undefined) {
      // Server rotated refresh token — persist new one
      const refreshExpiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
      await storeRefreshToken(result.refresh_token, refreshExpiresAt);
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
  if (broadcastChannel !== null) {
    try {
      broadcastChannel.close();
    } catch {
      // non-fatal
    }
    broadcastChannel = null;
  }
}
