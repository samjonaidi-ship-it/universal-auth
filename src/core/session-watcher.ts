// @samjonaidi-ship-it/universal-auth | src/core/session-watcher.ts | v1.3.1 | 2026-10-14 | BB
// v1.3.1 (pre-push review): a failed IndexedDB wipe is reported as
//   wipe_failed: true on `session.revoked`, so a half-done sign-out is visible.
// v1.3.0 (rc.23, issue #32): `session.revoked` is emitted AFTER the clear,
//   with stale: true when a sign-in superseded the clear. Before, the event
//   went out first and could announce a sign-out that did not happen.
// v1.2.0 (rc.22): a revoked/expired /me poll is scoped to the session it
//   started under. The `session.revoked` event carries session_id and
//   generation, and clearSession() runs only if that session is still the
//   current one. Before, a poll that left under session A and came back 401
//   after a sign-in as B cleared B (the gap CalExp5 #881 patched with
//   isReplacedSessionExpiry). Devin round 1 (PR #31): the clear goes through
//   clearSessionIfCurrent(scope), and a sign-in that lands during the clear's
//   IndexedDB wipe keeps its refresh token, keypair and listeners.
//   Pre-push review: clearSessionIfCurrent() returns false when that sign-in
//   superseded the clear, so the watcher keeps polling the new session.
// Background session validator — polls `/auth/v1/me` while the tab is active,
// so admin-forced revocations propagate to the UI within ~1 poll interval.
//
// Invariants per spec:
//   §8.2     Poll only while document.visibilityState === 'visible'
//   §8.2     60s interval (configurable via config.sessionWatcher.intervalMs)
//   §6.1     Emits `session.revoked` on AUTH_SESSION_REVOKED
//   §8.1     Uses If-None-Match / ETag on `/auth/v1/me` to cut egress
//
// v1.1.0 (L3.2 SSE): when `config.useSSE !== 'never'` AND `EventSource` is
// available, `startSessionWatcher()` delegates to `startSessionEvents()`
// (SSE_DESIGN_v1.0.md §5) and skips the polling path. The polling path
// remains intact as the fallback for `useSSE: 'never'` and for environments
// without `EventSource` (older browsers, jest harnesses without polyfill).

import { get } from './client.js';
import { AuthSessionRevoked, AuthSessionExpired, AuthSdkError } from '../errors.js';
import { clearSessionIfCurrent, getSessionScope } from './token-manager.js';
import { refreshEntitlements } from './entitlements.js';
import { emit } from './event-reporter.js';
import { startSessionEvents, stopSessionEvents } from './session-events.js';
import { getUseSSE } from '../config.js';

// ── Config ────────────────────────────────────────────────────────────────

const DEFAULT_INTERVAL_MS = 60_000;

let intervalMs = DEFAULT_INTERVAL_MS;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastEtag: string | null = null;

// ── Public API ────────────────────────────────────────────────────────────

export interface SessionWatcherConfig {
  intervalMs?: number;
}

export function configureSessionWatcher(opts: SessionWatcherConfig = {}): void {
  if (opts.intervalMs !== undefined) intervalMs = opts.intervalMs;
}

/**
 * Start periodic session polling. Idempotent — second call is a no-op.
 * Must be called after SDK init + first login.
 *
 * v1.1.0: when `config.useSSE !== 'never'` AND `EventSource` is defined in
 * the global scope, this delegates to `startSessionEvents()` (SSE) and
 * returns without scheduling any polls. The SSE module owns the fallback
 * path back to polling if its connection ultimately fails (3 reconnects),
 * so consumers always get exactly one of the two strategies running.
 */
export function startSessionWatcher(): void {
  if (running) return;

  if (getUseSSE() !== 'never' && typeof EventSource !== 'undefined') {
    // SSE path. session-events is itself idempotent.
    startSessionEvents();
    return;
  }

  startPollingOnly();
}

/**
 * v1.1.0 (L3.2): polling-only start path. Called directly by
 * `session-events.handleFallback()` after 3 SSE reconnect failures —
 * bypasses the `useSSE` gate so we don't re-enter SSE on the fallback.
 *
 * Idempotent — second call while already polling is a no-op.
 */
export function startSessionWatcherPolling(): void {
  if (running) return;
  startPollingOnly();
}

function startPollingOnly(): void {
  running = true;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  scheduleNextPoll();
}

export function stopSessionWatcher(): void {
  // Always tell session-events to clean up — idempotent no-op when SSE never
  // started (e.g., useSSE === 'never' or EventSource unavailable).
  stopSessionEvents();

  running = false;
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibility);
  }
  lastEtag = null;
}

// ── Internals ─────────────────────────────────────────────────────────────

function scheduleNextPoll(): void {
  if (!running) return;
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    pollTimer = null;
    void doPoll();
  }, intervalMs);
}

function isVisible(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState === 'visible';
}

function handleVisibility(): void {
  if (!running) return;
  if (isVisible()) {
    // Re-check immediately on return-to-foreground so stale tabs don't
    // linger on revoked sessions.
    void doPoll();
  } else {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }
}

async function doPoll(): Promise<void> {
  if (!running) return;
  if (!isVisible()) {
    // Don't burn a poll in the background — scheduleNextPoll will re-fire
    // on visibilitychange.
    return;
  }

  // v1.2.0: which session this poll speaks for.
  const scope = getSessionScope();

  try {
    const result = await get<unknown>(
      '/auth/v1/me',
      lastEtag !== null ? { ifNoneMatch: lastEtag } : {}
    );
    if (result.etag !== undefined) lastEtag = result.etag;

    // 304 is a no-op; the session is still valid.
    // On 200, refresh entitlements so useAuth() sees changes.
    if (result.status === 200) {
      void refreshEntitlements();
    }

    void emit('session.heartbeat', {
      viewport: isVisible() ? 'fg' : 'bg',
    });
  } catch (err) {
    // Session gone — surface + clean up.
    if (err instanceof AuthSessionRevoked || err instanceof AuthSessionExpired) {
      await handleRevoked(err instanceof AuthSessionRevoked ? 'server' : 'expired', scope);
      return;
    }
    // Any other AuthSdkError with a 401/403 class treated as revocation.
    if (err instanceof AuthSdkError && isRevocationCode(err.code)) {
      await handleRevoked('server', scope);
      return;
    }
    // Network error or transient 5xx — keep polling on schedule.
  } finally {
    scheduleNextPoll();
  }
}

/**
 * v1.2.0: the poll's session is gone. Report it with the session it belongs
 * to. Clear only when that session is still current: if a new session was
 * installed while the poll was in flight, the 401 is about the old one, and
 * the new one must survive. The watcher keeps polling for the new session.
 */
async function handleRevoked(
  reason: 'server' | 'expired',
  scope: ReturnType<typeof getSessionScope>
): Promise<void> {
  // v1.3.0 (issue #32): clear first, then report. The event says stale when
  // the clear did not happen: the session changed before the poll came back,
  // or a sign-in during the clear's wipe superseded it (clearSessionIfCurrent
  // returns false then, and the watcher keeps polling that new session).
  // A rejected wipe has still cleared memory and told tabs and listeners, so
  // it counts as cleared; the event says the wipe failed (v1.3.1).
  let cleared: boolean;
  let wipeFailed = false;
  try {
    cleared = await clearSessionIfCurrent(scope);
  } catch {
    cleared = true;
    wipeFailed = true;
  }
  void emit('session.revoked', {
    reason,
    session_id: scope.sessionId,
    generation: scope.generation,
    ...(cleared ? {} : { stale: true }),
    ...(wipeFailed ? { wipe_failed: true } : {}),
  });
  if (cleared) stopSessionWatcher();
}

function isRevocationCode(code: string): boolean {
  return code === 'AUTH_SESSION_EXPIRED' || code === 'AUTH_SESSION_REVOKED';
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetSessionWatcherForTests(): void {
  stopSessionWatcher();
  intervalMs = DEFAULT_INTERVAL_MS;
}
