// @samjonaidi-ship-it/universal-auth | src/core/token-manager.ts | v1.6.8 | 2026-10-14 | BB
// v1.6.8 (rc.26, issue #37, Devin note on PR #36): a cookie note during a
//   superseded sign-out no longer keeps the signed-out session.
//   - noteCookieSession() ignores the id a pending sign-out is signing out
//     (the SSR /me note passes no scope, so the scope check missed it).
//   - The stand-down decides by what this tab holds (signed-out session A,
//     ignored sign-in B with an id other than A):
//       nothing held               -> adopt B, else report the clear
//       token session, not A       -> already adopted: no clear
//       cookie session, not A      -> adopt B if heard, else keep it: no clear
//       A (came back)              -> adopt B if heard, else finish the clear
//     Before, any held id read as "already adopted", so a cookie note for A
//     kept the signed-out session instead of adopting B.
// v1.6.7 (rc.25, Devin round 2, PR #36):
//   - Each pending sign-out keeps its own record (signed-out session, row at
//     sign-out, ignored sign-in). An older wipe that settles no longer erases
//     the record a newer, overlapping sign-out needs, and that sign-out
//     inherits the session and row of the one it overlaps (memory is already
//     cleared), so it still keeps another tab's newer sign-in.
//   - A stand-down where this tab already adopted the sign-in (the marker was
//     removed before the broadcast) reports no clear: no listeners, no
//     session-event stop, and clearSessionIfCurrent() returns false.
// v1.6.6 (rc.25, Devin round 1, PR #36):
//   - Blocked localStorage: the marker then lives only in the signing-out
//     tab's memory, so another tab's sign-in cannot remove it. The wipe then
//     stands down only when BOTH hold under the store lock: the stored row
//     changed since the sign-out began, AND a session_updated arrived for a
//     session other than the one being signed out. A rotation in another
//     tab keeps the session id, so it never counts; a cold tab (no session
//     known) and a sign-in whose broadcast has not arrived yet both wipe
//     (fail closed). Pre-push review: a row change alone could not tell a
//     rotation from a sign-in and failed the sign-out open.
//   - Cold tabs: clearSession() opens the BroadcastChannel before it waits,
//     and a session_updated ignored while this tab's sign-out was pending is
//     adopted when that sign-out stands down for a newer sign-in. Never after
//     the clear has already reported (wipe timeout); dropped on wipe failure.
// v1.6.5 (rc.25, Devin on CalExp5 #909): a sign-out wipe no longer deletes a
//   newer sign-in from another tab. Tab B's sign-in could take the store lock
//   first; tab A's queued wipe then deleted B's refresh token. Now:
//     - setSession() removes the revoked marker INSIDE the store lock, right
//       after its store, so no wipe can get the lock while it is still set;
//     - the clearSession() wipe re-reads the marker under the lock and wipes
//       only while it still holds its own value (like the retry wipe, v1.6.2).
//       Removed = a sign-in owns the store: keep it, and do not broadcast
//       session_cleared (other tabs adopted that sign-in). Replaced = a newer
//       sign-out runs its own wipe.
//   Both lock orders: B first -> A sees no marker, keeps B; A first -> A
//   wipes, then B stores. Same-tab order (pendingClear/pendingInstall) holds.
//   Pre-push review: setSession() removes only the marker it saw when it
//   began (compare-and-delete). A sign-out in another tab DURING the store
//   is newer than the sign-in, so its marker stays and its wipe runs. While
//   a marker is set, other tabs ignore session_updated: a sign-in that a
//   newer sign-out superseded must not be adopted by them.
// v1.6.4 (rc.24, Devin round 3, PR #35): performRefresh() decides ownership by
//   the stored row's identity (storage getRefreshTokenRowId(), the row's IV),
//   not by re-reading the token. A re-read ran the expiry check, so a token
//   that expired during a successful refresh read as "not mine" and the
//   rotation was lost. The token and its row id are read together under the
//   store lock. Case table, checked under the store lock before any write:
//     signed out (any tab)          -> write nothing; success/mismatch: null;
//                                      terminal: rethrow, no clear
//     sign-in (this tab or another) -> write nothing; success/mismatch: the
//                                      new session's live token or null;
//                                      terminal: rethrow, no clear
//     row gone (another tab cleared)-> success: nothing, null; mismatch and
//                                      terminal: clear memory, tell tabs, throw
//     row same (even if expired)    -> success: store + adopt + broadcast;
//                                      mismatch/terminal: clear row + memory
// v1.6.3 (rc.24, Devin round 2, PR #35): performRefresh() writes to the store
//   only when the refresh still owns it. Under the store lock it re-checks:
//   no sign-out, no setSession() in this tab, and the stored refresh token is
//   still the one this refresh used (another tab's sign-in or sign-out
//   replaces or removes it). This holds for the rotation store, the
//   CNF_JKT_MISMATCH clear and the terminal-error clear. A refresh adopts
//   its access token only after that check, in the same synchronous step, so
//   a concurrent getAccessToken() never sees a token a sign-out discarded.
// v1.6.2 (rc.24, Devin PR #35):
//   - Every refresh-token store and every wipe runs under one origin-wide
//     navigator.locks lock (STORE_LOCK_NAME), in request order. pendingClear
//     only ordered them inside one tab, so a late wipe in tab A could delete
//     the refresh token tab B stored meanwhile. A retry wipe also re-reads the
//     marker under the lock and stands down when a sign-in removed it.
//   - performRefresh() counts sign-outs (signOutCount: this tab's clears and
//     other tabs' session_cleared). A sign-out during the refresh-token read or
//     the refresh call makes the refresh discard its result: it adopts,
//     stores and broadcasts nothing, so it cannot restore a signed-out session.
// v1.6.1 (rc.24, pre-push review): the locally-revoked marker carries its
// writer's value, is written when the wipe starts, and is removed only by that
// wipe's own success (also a late one). A late timeout in one tab can no longer
// re-mark a sign-in another tab made meanwhile.
// v1.6.0 (rc.24, issue #33 items 2 + 4):
//   - The IndexedDB wipe of a clear is bounded (WIPE_TIMEOUT_MS). A wipe that
//     does not settle in time fails the clear with SessionWipeTimeout, so a
//     session.revoked event is no longer held by a hung IndexedDB.
//   - A failed or timed-out wipe writes a "locally revoked" marker
//     (localStorage + memory). The next refresh honours it: it retries the
//     wipe and treats the case as no refresh token, so a refresh token or
//     keypair that survived a sign-out is never used to sign back in. A
//     setSession() store removes the marker. The marker is per origin, so
//     every tab of the origin fails closed until a sign-in or a good wipe.
// v1.5.3 (Devin round 3, PR #34): getSessionEpoch() counts setSession() and
//   clearSession() calls. AuthProvider's hydrate uses it to tell its own
//   token refresh apart from a sign-in or sign-out during /me.
// v1.5.2 (Devin, PR #34): setSession() also stands down when its access token
//   is no longer in memory (a server-wins /me dropped it, or a refresh
//   replaced it). Before, the install notified after a cookie note dropped
//   its token, so AuthProvider read 'no live token' and showed anonymous,
//   and other tabs got the dropped token.
// v1.5.1 (pre-push review): setSession() stands down only for a clearSession()
//   or a newer setSession() that began during its store (clearCount /
//   installCount). Before, any generation bump did, so a /me naming a cookie
//   session during the store left tabs and listeners untold.
// v1.5.0 (rc.23, issue #32 - follow-ups from PR #31's review):
//   - noteCookieSession(): when /me names a different session (server wins),
//     the in-memory access token is dropped too. It belonged to the old
//     session; the new scope must not hand it out. A later getAccessToken()
//     refreshes, and the refresh re-adopts its own session id.
//   - A clearSession() that starts while setSession() is storing its refresh
//     token now waits for that store before it wipes (pendingInstall), so a
//     sign-out cannot leave the install's refresh token on disk. setSession()
//     skips its broadcast + notify when the session changed during its store.
//   - A rejected IndexedDB wipe no longer skips the broadcast, the listeners
//     and the SSE stop: memory is already cleared, so tabs and listeners are
//     told, and then the error is re-thrown.
//   - isRefreshClearCurrent(): true while the current generation is the one a
//     terminal refresh clear produced. AuthProvider uses it to tell its own
//     mint's clear apart from a sign-in / sign-out that overtook the mint.
//     Internal: not exported from the package index.
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
//   - Devin round 1 (PR #31): clearSession() no longer wipes a session
//     installed while its IndexedDB clear runs (setSession() waits for the
//     wipe; the clear skips keypair delete / broadcast / notify once the
//     generation moved); clearSessionIfCurrent(scope) checks and clears in
//     one step. noteCookieSession() follows the server when /me names a
//     different session. A no-refresh-token result that races a sign-in
//     returns the new token and does not fire onTokenUnavailable.
//   - Pre-push review (PR #31): the clear stands down only for a setSession()
//     install (installCount), not for any generation bump (a late /me from
//     the old cookie must not cancel a sign-out). clearSessionIfCurrent()
//     returns whether the clear really ran. Overlapping wipes are chained.
//     noteCookieSession(id, scope) drops a /me reply that a session change
//     overtook. The raced-null early return needs a real install.
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
  getRefreshTokenRowId,
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
  SessionWipeTimeout,
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
// The storage wipe of a clearSession() still running. setSession() waits for
// it, so an install during a clear is not deleted by that clear.
let pendingClear: Promise<void> | null = null;
// Counts setSession() installs. A clear compares it, not the generation:
// only a real sign-in during the wipe may make the clear stand down.
let installCount = 0;
// Counts clearSession() calls. setSession() compares it (v1.5.1).
let clearCount = 0;
// v1.6.2: sign-outs seen by this tab, its own and other tabs' (performRefresh).
let signOutCount = 0;
// The refresh-token store of a setSession() still running. A clear waits for
// the installs that began before it, so its wipe runs after their store.
let pendingInstall: Promise<void> | null = null;
// The generation a terminal refresh clear produced (see isRefreshClearCurrent).
let refreshClearGeneration: number | null = null;

// ── Wipe bound + locally-revoked marker (v1.6.0, issue #33) ──────────────

const DEFAULT_WIPE_TIMEOUT_MS = 5_000;
let wipeTimeoutMs = DEFAULT_WIPE_TIMEOUT_MS;
const REVOKED_MARKER_KEY = 'bb-universal-auth-revoked';
// v1.6.1: the marker holds its writer's own value, so only that writer can
// remove it on success. Memory copy only where localStorage throws.
let memoryRevokedMarker: string | null = null;
// v1.6.6: the session a pending sign-out signs out, and the newest
// session_updated for a DIFFERENT session ignored while it was pending. A
// refresh of the signed-out session (same id) is never kept (see header).
// v1.6.7 (Devin PR #36 r2): one record per sign-out, so an older wipe that
// settles never erases the evidence a newer, overlapping sign-out needs.
type IgnoredUpdate = { accessToken: string; accessExpiresAt: number; sessionId: string };
interface PendingSignOut {
  signedOut: string | null;
  rowAtSignOut: Promise<string | null> | null;
  update: IgnoredUpdate | null;
}
const pendingSignOuts = new Set<PendingSignOut>();

/** Race a wipe against WIPE_TIMEOUT_MS; the wipe itself keeps running. */
function withWipeTimeout(wipe: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new SessionWipeTimeout(`session wipe did not settle within ${wipeTimeoutMs} ms`)),
      wipeTimeoutMs,
    );
  });
  return Promise.race([wipe, timeout]).finally(() => clearTimeout(timer));
}

function newRevokedMarkerValue(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
}

function readRevokedMarker(): string | null {
  let stored: string | null = null;
  try {
    stored = globalThis.localStorage?.getItem(REVOKED_MARKER_KEY) ?? null;
  } catch {
    // Storage blocked: fall back to the memory copy.
  }
  return stored ?? memoryRevokedMarker;
}

function setRevokedMarker(value: string): void {
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      ls.setItem(REVOKED_MARKER_KEY, value);
      return;
    }
  } catch {
    // Storage blocked: the memory copy still covers this page.
  }
  memoryRevokedMarker = value;
}

/**
 * Remove the marker. With `owner`, only when it still holds that value: a
 * newer sign-out's marker is not removed by an older wipe that settles late.
 */
function clearRevokedMarker(owner?: string | null): void {
  if (owner === undefined || memoryRevokedMarker === owner) memoryRevokedMarker = null;
  try {
    const ls = globalThis.localStorage;
    if (ls && (owner === undefined || ls.getItem(REVOKED_MARKER_KEY) === owner)) {
      ls.removeItem(REVOKED_MARKER_KEY);
    }
  } catch {
    // ignore
  }
}

function isLocallyRevoked(): boolean {
  return readRevokedMarker() !== null;
}

/**
 * Track a wipe in pendingClear until it settles, even past its timeout, so a
 * later setSession() still waits for it and the wipe cannot delete the new
 * session's refresh token.
 */
function trackWipe(wipe: Promise<void>): void {
  pendingClear = wipe;
  const release = (): void => {
    if (pendingClear === wipe) pendingClear = null;
  };
  void wipe.then(release, release);
}

/**
 * The marker is set: a wipe failed and a refresh token or keypair may have
 * survived a sign-out. Retry the wipe. A sign-in that began first, or begins
 * during it, owns the device and keeps its state.
 */
async function retryLocallyRevokedWipe(): Promise<void> {
  const myInstall = installCount;
  const owner = readRevokedMarker();
  const previousWipe = pendingClear;
  const installBefore = pendingInstall;
  const wipe = (async () => {
    if (previousWipe !== null) await previousWipe.catch(() => {});
    if (installBefore !== null) await installBefore.catch(() => {});
    if (installCount !== myInstall) return;
    await runUnderStoreLock(async () => {
      // v1.6.2: a sign-in in another tab removed the marker before this
      // wipe got the lock. Its refresh token is not ours to delete.
      if (readRevokedMarker() !== owner) return;
      await clearAllSessionState();
      if (installCount === myInstall) await deleteKeypair();
    });
  })();
  trackWipe(wipe);
  // A retry that settles after its bound still removes the marker it read.
  void wipe.then(
    () => {
      if (installCount === myInstall) clearRevokedMarker(owner);
    },
    () => {}
  );
  try {
    await withWipeTimeout(wipe);
  } catch {
    // The marker stays; the next refresh retries.
  }
}

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
// v1.6.2: orders refresh-token stores and wipes across tabs (see header).
const STORE_LOCK_NAME = 'bb-auth-session-store';

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
      // v1.6.5: a sign-out is pending (its wipe has not removed the marker).
      // A sign-in it superseded is about to be wiped; do not adopt it.
      if (isLocallyRevoked()) {
        // v1.6.6: kept when it names another session (a sign-in, not a
        // rotation of the one being signed out); adopted if the sign-out
        // stands down.
        const update: IgnoredUpdate = {
          accessToken: raw.accessToken,
          accessExpiresAt: raw.accessExpiresAt,
          sessionId: raw.sessionId,
        };
        for (const pending of pendingSignOuts) {
          if (raw.sessionId !== pending.signedOut) pending.update = update;
        }
        return;
      }
      // Another tab refreshed; adopt its access token without re-fetching
      state.accessToken = raw.accessToken;
      state.accessExpiresAt = raw.accessExpiresAt;
      adoptSessionId(raw.sessionId, 'token');
      notifyListeners();
      break;
    case 'session_cleared':
      signOutCount++;
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
  installCount++;
  const myInstall = installCount;
  const myClears = clearCount;
  // v1.6.5 (pre-push review): the marker this sign-in replaces. A sign-out
  // in another tab during the store writes a new one, which stays.
  const markerBefore = readRevokedMarker();
  state.sessionId = tokens.sessionId;
  sessionSource = 'token';

  // A clear that began before this install must finish its wipe first, or
  // the wipe would delete this session's refresh token (Devin, PR #31). An
  // earlier install must finish its store first, so the stores keep order.
  // v1.5.0: a clear that begins during this store waits for it in turn
  // (pendingInstall). Each side waits only for work that started before it.
  const clearBefore = pendingClear;
  const installBefore = pendingInstall;
  const refreshExpiresAt = tokens.refreshExpiresAt ?? Date.now() + DEFAULT_REFRESH_TTL_MS;
  const install = (async () => {
    if (clearBefore !== null) await clearBefore.catch(() => {});
    if (installBefore !== null) await installBefore.catch(() => {});
    await runUnderStoreLock(async () => {
      await storeRefreshToken(tokens.refreshToken, refreshExpiresAt);
      // v1.6.0: a stored sign-in replaces a locally revoked state, unless a
      // clear began during the store (that clear owns the marker now).
      // v1.6.5: removed inside the store lock, so a sign-out wipe queued
      // behind this store sees the marker gone and leaves this token.
      if (clearCount === myClears) clearRevokedMarker(markerBefore);
    });
  })();
  pendingInstall = install;
  try {
    await install;
  } finally {
    if (pendingInstall === install) pendingInstall = null;
  }

  // v1.5.0: a sign-out or a newer sign-in during the store owns the session
  // now. Telling tabs and listeners about this one would undo it.
  // v1.5.1: only those two. Any other session move (a /me naming a cookie
  // session, a refresh adopting an id) is not a reason to stay silent.
  // v1.5.2: or the install's token is gone from memory (a server-wins /me
  // dropped it, or a refresh replaced it and notified on its own). Then this
  // install no longer describes the session, and its notify would read as a
  // sign-out.
  if (
    installCount !== myInstall ||
    clearCount !== myClears ||
    state.accessToken !== tokens.accessToken
  ) {
    return;
  }

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
  await clearSessionAndReport();
}

/** clearSession(); true unless a setSession() during the wipe superseded it. */
async function clearSessionAndReport(): Promise<boolean> {
  const sessionAtSignOut = state.sessionId;
  state.accessToken = null;
  state.accessExpiresAt = 0;
  generation++;
  state.sessionId = null;
  sessionSource = null;
  state.inFlightRefresh = null;
  clearCount++;
  signOutCount++;
  const myInstall = installCount;

  // v1.4.0: a setSession() that lands while the wipe runs owns the device
  // from then on. It waits for this wipe (pendingClear) before storing its
  // refresh token; this clear then keeps the new session's DPoP keypair and
  // does not tell tabs or listeners that the new session was cleared. Any
  // other session change (e.g. a late /me naming the old cookie session)
  // does not cancel the sign-out. Wipes are chained, so pendingClear always
  // covers every wipe still running.
  // v1.5.0: an install whose refresh-token store is still running finishes
  // it first; otherwise the store could land after the wipe and survive the
  // sign-out.
  // v1.6.1 (pre-push review): the marker is written before the wipe starts,
  // with this clear's own value, and removed only by this wipe's success
  // (even one that settles after the bound). A late timeout no longer writes
  // a marker over another tab's newer sign-in, which removed it.
  const marker = newRevokedMarkerValue();
  setRevokedMarker(marker);
  // v1.6.6: listen before waiting, so a cold tab hears another tab's sign-in.
  getBroadcastChannel();
  const myClears = clearCount;
  // v1.6.7 (Devin PR #36 r2): a sign-out that overlaps a pending one (memory
  // already cleared) signs out the same session, from the same row.
  let newest: PendingSignOut | null = null;
  for (const pending of pendingSignOuts) newest = pending;
  const signedOut = sessionAtSignOut ?? newest?.signedOut ?? null;
  // v1.6.6: memory-only marker (localStorage refused it): other tabs cannot
  // see or remove it. A changed row counts as another tab's sign-in only
  // with a session_updated for a different session (see header); a known
  // session is required, so a cold tab and a rotation still wipe.
  const markerIsLocal = memoryRevokedMarker === marker && signedOut !== null;
  const rowAtSignOut = !markerIsLocal
    ? null
    : (sessionAtSignOut === null ? newest?.rowAtSignOut : null) ??
      getRefreshTokenRowId().catch(() => null);
  const own: PendingSignOut = { signedOut, rowAtSignOut, update: null };
  pendingSignOuts.add(own);
  const previousWipe = pendingClear;
  const installBefore = pendingInstall;
  // v1.6.5: set when the wipe stood down because another tab's sign-in
  // removed the marker before this wipe got the store lock.
  let supersededBySignIn = false;
  const wipe = (async () => {
    if (previousWipe !== null) await previousWipe.catch(() => {});
    if (installBefore !== null) await installBefore.catch(() => {});
    await runUnderStoreLock(async () => {
      // v1.6.5 (Devin, CalExp5 #909): the store belongs to whoever owns the
      // marker now. Removed: a sign-in (any tab) stored its refresh token
      // after this sign-out began, so it is not ours to delete. Replaced: a
      // newer sign-out owns the wipe and runs it itself.
      const now = readRevokedMarker();
      if (now !== marker) {
        supersededBySignIn = now === null;
        return;
      }
      if (rowAtSignOut !== null) {
        const before = await rowAtSignOut;
        const rowNow = await getRefreshTokenRowId().catch(() => null);
        if (rowNow !== null && rowNow !== before && own.update !== null) {
          supersededBySignIn = true;
          return;
        }
      }
      await clearAllSessionState();
      if (installCount === myInstall) await deleteKeypair();
    });
  })();
  let adoptedSignIn = false;
  // v1.6.6: set once this clear has reported; a later stand-down (after the
  // timeout) does not sign the tab back in behind the caller.
  let reported = false;
  void wipe.then(
    () => {
      clearRevokedMarker(marker);
      pendingSignOuts.delete(own);
      // v1.6.6: the sign-in that superseded this sign-out was ignored while
      // the marker was set; adopt it now, unless this tab moved on since.
      if (!supersededBySignIn || reported || clearCount !== myClears || installCount !== myInstall) {
        return;
      }
      // v1.6.8 (issue #37): what this tab holds now decides (see header).
      const update = own.update !== null && own.update.sessionId !== signedOut ? own.update : null;
      const held = state.sessionId;
      const heldOther = held !== null && held !== signedOut;
      if (heldOther && (sessionSource === 'token' || update === null)) {
        // v1.6.7 (Devin PR #36 r2): the sign-in removed the marker before it
        // broadcast, so this tab already adopted it; do not report a clear
        // or stop that session's event stream. v1.6.8: also a cookie session
        // /me named that is not the signed-out one, when no sign-in was heard.
        adoptedSignIn = true;
      } else if (update !== null) {
        state.accessToken = update.accessToken;
        state.accessExpiresAt = update.accessExpiresAt;
        adoptSessionId(update.sessionId, 'token');
        adoptedSignIn = true;
        notifyListeners();
      } else if (held !== null) {
        // v1.6.8: the signed-out session came back (a cookie note) and no
        // sign-in was heard: finish the clear, which then reports.
        state.accessToken = null;
        state.accessExpiresAt = 0;
        adoptSessionId(null, null);
      }
    },
    () => {
      pendingSignOuts.delete(own);
    }
  );
  // v1.6.0: pendingClear tracks the wipe until it really settles, but this
  // clear waits at most WIPE_TIMEOUT_MS for it (issue #33 item 4).
  trackWipe(wipe);
  let wipeFailed = false;
  let wipeError: unknown = null;
  try {
    await withWipeTimeout(wipe);
  } catch (err) {
    wipeFailed = true;
    wipeError = err;
  }
  reported = true;
  // A sign-in during the wipe owns the device now; it is not "cleared".
  if (installCount !== myInstall) return false;
  // v1.6.6: another tab's sign-in was adopted; this tab is signed in, not out.
  if (adoptedSignIn) return false;
  // v1.6.0: a refresh token or keypair may have survived. The marker (set
  // above, still in place) makes the next refresh retry the wipe instead of
  // using them (issue #33 item 2).
  // v1.5.0: memory is already cleared, so tabs and listeners hear about it
  // even when the IndexedDB wipe failed. The failure is re-thrown after.
  // v1.6.5: not the other tabs when a later sign-in in another tab owns the
  // store: they adopted that session, and session_cleared would drop it.
  if (!supersededBySignIn) broadcast({ type: 'session_cleared' });
  notifyListeners();

  try {
    const { stopSessionEvents } = await import('./session-events.js');
    stopSessionEvents();
  } catch {
    // Module not loaded (e.g., older bundle) — ignore.
  }
  if (wipeFailed) throw wipeError;
  return true;
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
    const installsAtStart = installCount;
    // v1.6.2: a sign-out from here on means this refresh must not restore
    // the session (Devin, PR #35).
    const signOutsAtStart = signOutCount;
    const signedOutSince = (): boolean => signOutCount !== signOutsAtStart || isLocallyRevoked();
    // v1.6.3: no sign-out and no setSession() in this tab since the start.
    const stillMineHere = (): boolean => !signedOutSince() && installCount === installsAtStart;

    // v1.6.0: a sign-out whose wipe failed may have left a refresh token on
    // disk. Never refresh with it: retry the wipe, then report no token.
    if (isLocallyRevoked()) {
      await retryLocallyRevokedWipe();
      if (installCount !== installsAtStart && hasLiveAccessToken()) return state.accessToken;
      notifyTokenUnavailable('no_refresh_token');
      return null;
    }

    // v1.6.4: the token and its row id are read together, under the store
    // lock, so no other tab's store can land between the two reads.
    const { rt, rowId } = await runUnderStoreLock(async () => {
      const token = await getRefreshToken();
      return { rt: token, rowId: token === null ? null : await getRefreshTokenRowId() };
    });
    // v1.6.4: who owns the stored row now. Call it under the store lock only.
    const ownerNow = async (): Promise<'signed_out' | 'superseded' | 'row_gone' | 'mine'> => {
      const id = await getRefreshTokenRowId();
      if (signedOutSince()) return 'signed_out';
      if (installCount !== installsAtStart) return 'superseded';
      if (id === null) return 'row_gone';
      return id === rowId ? 'mine' : 'superseded';
    };
    if (rt === null && installCount !== installsAtStart && hasLiveAccessToken()) {
      // A setSession() landed during the lookup: the null is about the old
      // session. Hand back the new token; no event. Any other change (a /me
      // naming a cookie session, a clear) still reports the missing token.
      return state.accessToken;
    }
    if (rt !== null && signedOutSince()) {
      // A sign-out began during the lookup: the token read is a survivor.
      return null;
    }
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
      // v1.6.2: a sign-out during the call wins. Adopt, store and broadcast
      // nothing; the server-side session is left to its own expiry.
      if (signedOutSince()) return null;

      const verifyResult = await verifyAccessTokenJktBinding(result.access_token);
      if (verifyResult === 'mismatch') {
        // v1.6.3: clear only the session this refresh was for. A sign-in or
        // sign-out (any tab) while the lock was awaited owns the store now.
        const cleared = await runUnderStoreLock(async () => {
          const owner = await ownerNow();
          if (owner === 'signed_out' || owner === 'superseded') return false;
          if (owner === 'mine') await clearRefreshToken();
          if (!stillMineHere()) return false;
          state.accessToken = null;
          state.accessExpiresAt = 0;
          adoptSessionId(null, null);
          return true;
        });
        if (!cleared) return signedOutSince() || !hasLiveAccessToken() ? null : state.accessToken;
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

      // v1.6.3: store and adopt under the store lock, only while this refresh
      // still owns the session (see header). The adoption is synchronous
      // after the last await, so no sign-out can slip between check and
      // adoption; a sign-out after it nulls state.accessToken itself.
      const ttl = refreshExpiresAt;
      const adopted = await runUnderStoreLock(async () => {
        // v1.6.4: only the row this refresh read; an expired row is still it.
        if ((await ownerNow()) !== 'mine') return false;
        if (ttl !== null) {
          if (result.refresh_token !== undefined) {
            // Rotated token — persist new ciphertext + new TTL.
            await storeRefreshToken(result.refresh_token, ttl);
          } else {
            // Server extended TTL without rotating — re-encrypt the token this
            // refresh used (the row is still it) under the new expiry.
            await storeRefreshToken(rt, ttl);
          }
          if (!stillMineHere()) return false;
        }
        state.accessToken = result.access_token;
        state.accessExpiresAt = newExpiresAt;
        adoptSessionId(result.session_id, 'token');
        return true;
      });
      if (!adopted || state.accessToken !== result.access_token) {
        // Signed out or superseded while this refresh ran: it restores
        // nothing. The sign-out or sign-in has told tabs and listeners.
        return signedOutSince() || !hasLiveAccessToken() ? null : state.accessToken;
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
      // v1.6.3: a sign-out or a setSession() since the start is staleness too.
      const staleness = state.sessionId !== sessionIdAtStart || !stillMineHere();
      if (isTerminalRefreshError(err)) {
        // v1.6.3: the clear re-checks under the store lock, like the mismatch
        // path: another tab's sign-in may have replaced the stored token.
        const cleared =
          !staleness &&
          (await runUnderStoreLock(async () => {
            const owner = await ownerNow();
            if (owner === 'signed_out' || owner === 'superseded') return false;
            if (owner === 'mine') await clearRefreshToken();
            if (!stillMineHere() || state.sessionId !== sessionIdAtStart) return false;
            state.accessToken = null;
            state.accessExpiresAt = 0;
            adoptSessionId(null, null);
            return true;
          }));
        if (cleared) {
          refreshClearGeneration = generation;
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
 * v1.6.2: run a refresh-token store or a wipe under the origin-wide store
 * lock, in request order across tabs. Without navigator.locks it runs as-is
 * (runUnderRefreshLock already reports that once).
 */
async function runUnderStoreLock<T>(work: () => Promise<T>): Promise<T> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    | NavigatorWithLocks
    | undefined;
  if (nav?.locks?.request === undefined) return work();
  return nav.locks.request(STORE_LOCK_NAME, { mode: 'exclusive' }, work);
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
 * v1.4.0: clear the session only if `scope` is still the current one.
 * Returns true when it cleared; false when the scope was stale, or when a
 * setSession() during the wipe superseded the clear. Used by the session
 * watcher so a revoke that a replaced session produced cannot sign out the
 * new one, and so it stops polling only when it really signed out.
 */
export async function clearSessionIfCurrent(
  scope: Pick<SessionScope, 'generation'>
): Promise<boolean> {
  if (!isSessionScopeCurrent(scope)) return false;
  return clearSessionAndReport();
}

/**
 * v1.5.0 (internal): true while the current generation is the one a terminal
 * refresh clear produced, i.e. nothing changed the session after that clear.
 * AuthProvider's mint uses it: its own failed refresh moves the generation,
 * and that move must not read as "a sign-in or sign-out overtook the mint".
 */
export function isRefreshClearCurrent(): boolean {
  return refreshClearGeneration !== null && refreshClearGeneration === generation;
}

/**
 * v1.5.3 (internal): a count of setSession() and clearSession() calls. It
 * moves on every sign-in or sign-out, including a sign-in that keeps the same
 * session id, and never on a token refresh or a cookie note. AuthProvider
 * compares it across /me so a reply that a sign-in or sign-out overtook is
 * dropped, while its own refresh's id adoption is not.
 */
export function getSessionEpoch(): number {
  return installCount + clearCount;
}

/**
 * v1.4.0: record the session id of a cookie-authenticated session, read from
 * /auth/v1/me's `session_meta.session_id`. This gives a cookie-only session
 * an id and a generation, so its events can be scoped. When /me names a
 * session other than the one held, the server wins: the scope moves to the
 * cookie session (new generation, source 'cookie'). Does not notify session
 * listeners. v1.5.0: it drops the in-memory access token then, because that
 * token belongs to the old session; the stored refresh token is kept.
 * Called by AuthProvider after /me succeeds. Pass the scope captured before
 * the /me request: a reply that a sign-in or sign-out overtook is dropped,
 * so it cannot relabel the new session with the old id.
 */
export function noteCookieSession(
  sessionId: string | null | undefined,
  scopeAtRequest?: Pick<SessionScope, 'generation'>
): void {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return;
  if (scopeAtRequest !== undefined && !isSessionScopeCurrent(scopeAtRequest)) return;
  if (sessionId === state.sessionId) return;
  // v1.6.8 (issue #37): a pending sign-out is signing this session out; a
  // /me (often the SSR one, with no scope) must not bring it back.
  for (const pending of pendingSignOuts) {
    if (pending.signedOut === sessionId) return;
  }
  // /me is the server's word on which session this browser holds. A
  // different id means the local token session is not the one the cookie
  // authenticates (e.g. token session A expired here, B signed in on a
  // sibling subdomain), so the scope follows the server (Devin, PR #31).
  // v1.5.0: the access token is the old session's, so it goes too; the new
  // scope must not hand it out. The refresh token stays: a later refresh
  // re-adopts its own id, which moves the generation again.
  state.accessToken = null;
  state.accessExpiresAt = 0;
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

/** Test-only: shorten the wipe bound (ms). Reset by __resetTokenManagerForTests. */
export function __setWipeTimeoutMsForTests(ms: number): void {
  wipeTimeoutMs = ms;
}

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
  pendingClear = null;
  installCount = 0;
  clearCount = 0;
  signOutCount = 0;
  pendingInstall = null;
  refreshClearGeneration = null;
  wipeTimeoutMs = DEFAULT_WIPE_TIMEOUT_MS;
  clearRevokedMarker();
  pendingSignOuts.clear();
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
