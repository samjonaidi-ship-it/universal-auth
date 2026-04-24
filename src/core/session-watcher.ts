// @bb/universal-auth | src/core/session-watcher.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Background session validator — polls `/auth/v1/me` while the tab is active,
// so admin-forced revocations propagate to the UI within ~1 poll interval.
//
// Invariants per spec:
//   §8.2     Poll only while document.visibilityState === 'visible'
//   §8.2     60s interval (configurable via config.sessionWatcher.intervalMs)
//   §6.1     Emits `session.revoked` on AUTH_SESSION_REVOKED
//   §8.1     Uses If-None-Match / ETag on `/auth/v1/me` to cut egress
//
// Phase 2: swap polling for an SSE connection per §8.1 item 6.

import { get } from './client.js';
import { AuthSessionRevoked, AuthSessionExpired, AuthSdkError } from '../errors.js';
import { clearSession } from './token-manager.js';
import { refreshEntitlements } from './entitlements.js';
import { emit } from './event-reporter.js';

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
 */
export function startSessionWatcher(): void {
  if (running) return;
  running = true;

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  scheduleNextPoll();
}

export function stopSessionWatcher(): void {
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
      void emit('session.revoked', {
        reason: err instanceof AuthSessionRevoked ? 'server' : 'expired',
      });
      await clearSession();
      stopSessionWatcher();
      return;
    }
    // Any other AuthSdkError with a 401/403 class treated as revocation.
    if (err instanceof AuthSdkError && isRevocationCode(err.code)) {
      await clearSession();
      stopSessionWatcher();
      return;
    }
    // Network error or transient 5xx — keep polling on schedule.
  } finally {
    scheduleNextPoll();
  }
}

function isRevocationCode(code: string): boolean {
  return code === 'AUTH_SESSION_EXPIRED' || code === 'AUTH_SESSION_REVOKED';
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetSessionWatcherForTests(): void {
  stopSessionWatcher();
  intervalMs = DEFAULT_INTERVAL_MS;
}
