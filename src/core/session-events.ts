// @samjonaidi-ship-it/universal-auth | src/core/session-events.ts | v0.1.0 | 2026-05-06 | BB
// SSE (Server-Sent Events) lifecycle for session events. Replaces the
// 60-second `/auth/v1/me` polling in `session-watcher.ts` when the browser
// supports `EventSource` (Chrome / Firefox / Edge / Safari ≥ 16).
//
// Spec: BB_Platform_Specs/SSE_DESIGN_v1.0.md §5 (LOCKED 2026-05-05).
//
// Wire format: `GET /auth/v1/session/events` returns `text/event-stream` and
// emits the following typed events (see SSE_DESIGN §4.3):
//
//   session.heartbeat       — every 30s; no-op (just keepalive)
//   session.revoked         — admin/self revoke; clearSession + emit + close
//   entitlements.updated    — plan / feature flag / override change; refresh
//   session.refreshed       — another tab refreshed; emit (full handling lands
//                             when multi-tab Shared Worker arrives later)
//   consent.required        — new policy version; emit (UI re-prompts)
//
// Reconnect: native `EventSource` reconnects automatically on transient
// errors and re-sends `Last-Event-ID` from the last event it saw. We layer
// our own backoff on top — after 3 explicit failed reconnects (readyState
// stays CLOSED), we emit `session.sse_fallback` and delegate to the polling
// `session-watcher`. Backoff: 1s → 2s → 4s → 8s → 30s cap.
//
// Note on `Last-Event-ID`: the WHATWG EventSource API does NOT expose a way
// to set arbitrary request headers. The spec mandates that the browser
// auto-includes `Last-Event-ID` from the previous connection's last seen
// event, so as long as we let the same EventSource instance reconnect (or
// rebuild it after our own backoff), the server sees the right id and
// replays from the ring buffer (§4.4). When we manually rebuild the
// EventSource after a CLOSED state, the new instance's first request has
// no Last-Event-ID; the server falls through to live stream + 5-min ring
// buffer replay (§4.4).

import { getClientConfig } from './client.js';
import { emit } from './event-reporter.js';
import { clearSession } from './token-manager.js';
import { refreshEntitlements } from './entitlements.js';

// ── Constants ─────────────────────────────────────────────────────────────

const SSE_PATH = '/auth/v1/session/events';

// Exponential backoff schedule per SSE_DESIGN §5.2 — 1s → 2s → 4s → 8s → 30s cap.
const BACKOFF_SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000, 30_000] as const;

// After this many CLOSED-state failures in a row, give up and fall back to
// polling. SSE_DESIGN §5.2.
const MAX_FALLBACK_FAILURES = 3;

// EventSource readyState constants — re-declared so TS doesn't need DOM lib
// for `EventSource.CLOSED` etc. Values are spec-fixed.
const ES_CLOSED = 2;

// ── Internal state ────────────────────────────────────────────────────────

let eventSource: EventSource | null = null;
let consecutiveFailures = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Open an `EventSource` against `/auth/v1/session/events`. Idempotent — a
 * second call while already started is a no-op.
 *
 * Returns silently (without opening anything) if `EventSource` is not
 * defined in the current environment (Node test harness without a polyfill,
 * very old browsers). Callers fall through to `startSessionWatcher()` polling.
 */
export function startSessionEvents(): void {
  if (started) return;
  if (typeof EventSource === 'undefined') return;

  const cfg = getClientConfig();
  if (cfg === null) {
    // SDK not initialized yet — caller should re-invoke after init.
    return;
  }

  started = true;
  consecutiveFailures = 0;
  openEventSource(cfg.apiBaseUrl);
}

/**
 * Close the `EventSource` and clear all internal state. Idempotent — safe
 * to call when no stream was ever opened (e.g., from `clearSession()` on
 * sign-out before any session ever existed).
 */
export function stopSessionEvents(): void {
  started = false;
  consecutiveFailures = 0;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource !== null) {
    try {
      eventSource.close();
    } catch {
      // close() never throws per spec, but defensive — don't propagate.
    }
    eventSource = null;
  }
}

// ── Internals ─────────────────────────────────────────────────────────────

function openEventSource(apiBaseUrl: string): void {
  const url = `${apiBaseUrl.replace(/\/$/, '')}${SSE_PATH}`;
  let es: EventSource;
  try {
    es = new EventSource(url, { withCredentials: true });
  } catch {
    // Constructor throws if URL is invalid. Treat as a hard failure.
    void handleFallback();
    return;
  }
  eventSource = es;

  es.addEventListener('open', () => {
    // Successful connect resets the backoff counter — subsequent transient
    // errors get the full retry budget.
    consecutiveFailures = 0;
  });

  es.addEventListener('session.heartbeat', () => {
    // No-op. Server sends every 30s to keep proxies from killing the conn.
  });

  es.addEventListener('session.revoked', ((ev: MessageEvent) => {
    const payload = parseEventData(ev.data);
    void emit('session.revoked', { reason: 'server', ...payload });
    // Mirror session-watcher revocation path: tear down local session, then
    // close the stream so we don't immediately reconnect to a dead session.
    void clearSession();
    stopSessionEvents();
  }) as EventListener);

  es.addEventListener('entitlements.updated', () => {
    // Same handler as the polling 200-branch — refresh in background.
    void refreshEntitlements();
  });

  es.addEventListener('session.refreshed', ((ev: MessageEvent) => {
    const payload = parseEventData(ev.data);
    void emit('session.refreshed', payload);
    // Full multi-tab token-adoption lands with the Shared Worker (§5.3).
  }) as EventListener);

  es.addEventListener('consent.required', ((ev: MessageEvent) => {
    const payload = parseEventData(ev.data);
    void emit('consent.required', payload);
  }) as EventListener);

  es.addEventListener('error', () => {
    // Browser-native `EventSource` may flap through CONNECTING → CLOSED on
    // its own. We only intervene when readyState is CLOSED — that means the
    // browser gave up auto-reconnecting (typically after a few failures).
    if (eventSource === null) return;
    if (eventSource.readyState !== ES_CLOSED) {
      // Browser is auto-reconnecting; let it.
      return;
    }
    consecutiveFailures += 1;

    if (consecutiveFailures >= MAX_FALLBACK_FAILURES) {
      void handleFallback();
      return;
    }

    // Schedule a manual reconnect with exponential backoff. We rebuild the
    // EventSource so its internal Last-Event-ID is preserved across the
    // gap — the WHATWG spec says the browser keeps it on the same instance
    // until close(), but once CLOSED we have to make a new one.
    const delay = BACKOFF_SCHEDULE_MS[
      Math.min(consecutiveFailures - 1, BACKOFF_SCHEDULE_MS.length - 1)
    ] as number;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!started) return;
      // Drop the dead instance before opening a new one.
      try {
        eventSource?.close();
      } catch {
        // ignore
      }
      eventSource = null;
      openEventSource(apiBaseUrl);
    }, delay);
  });
}

function parseEventData(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length === 0) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed payload — server bug; don't crash the SDK.
  }
  return {};
}

async function handleFallback(): Promise<void> {
  void emit('session.sse_fallback', {
    failures: consecutiveFailures,
  });
  // Lazy-import the polling watcher so the two modules don't form a cycle
  // at load time (session-watcher itself imports session-events).
  // Use the polling-only entry to bypass the `useSSE` gate — otherwise the
  // fallback would loop straight back into SSE on `useSSE: 'auto'`.
  const { startSessionWatcherPolling } = await import('./session-watcher.js');
  stopSessionEvents();
  startSessionWatcherPolling();
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetSessionEventsForTests(): void {
  stopSessionEvents();
}

/** True iff a stream is currently open. For test assertions. */
export function __isSessionEventsActiveForTests(): boolean {
  return started;
}
