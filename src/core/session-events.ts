// @samjonaidi-ship-it/universal-auth | src/core/session-events.ts | v0.4.0 | 2026-10-14 | BB
// v0.4.0 (rc.24, issue #33 items 5 + 6):
//   - The revoke target follows the CT BFF contract
//     (bff/services/session-revoke-notify.js v1.2.0): scope 'identity' revokes
//     every session; otherwise only the sessions named in session_id and
//     session_ids. Before, session_ids was ignored, so a family revoke that
//     listed this session under session_ids was read as stale.
//   - A session with no local id yet (cookie-only, /me not back) no longer
//     fails closed on a revoke that names sessions. The SDK asks /auth/v1/me
//     which session this browser holds and clears only if it is named. If /me
//     fails, it still fails closed.
//   - The emitted event carries an allowlist of fields only: reason,
//     session_id, generation, revoke_scope, stale, wipe_failed. A server
//     reason passes only as a short [a-z0-9_.-] token; other server keys
//     (identity_id, session_ids, anything new) are dropped.
// v0.3.1 (pre-push review, round 2): a revoke naming a session_id applies when
//   the local session has no id yet. A server `stale` / `wipe_failed` key is
//   dropped; the SDK sets those flags itself.
// v0.3.0 (rc.23, pre-push review): a revoke whose payload names another
//   session_id is stale and clears nothing. A stale revoke reopens the stream
//   for the session that is current now. A failed IndexedDB wipe is reported
//   as wipe_failed: true on the event.
// v0.2.0 (rc.23, issue #32): a `session.revoked` event clears only the session
//   that was current when it arrived (clearSessionIfCurrent), and the event
//   is emitted after the clear, with stale: true when a sign-in superseded it.
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

import { get, getClientConfig } from './client.js';
import { emit } from './event-reporter.js';
import { clearSessionIfCurrent, getSessionEpoch, getSessionScope } from './token-manager.js';
import type { Session } from '../types/api.js';
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
    // Mirror session-watcher revocation path: tear down local session, then
    // close the stream so we don't immediately reconnect to a dead session.
    // v0.2.0 (issue #32): the clear is scoped to the session current when the
    // event arrived, and the event is emitted after it (stale: true when a
    // sign-in superseded the clear).
    // v0.3.0: stop first, so a stale revoke's restart is not undone.
    const scope = getSessionScope();
    stopSessionEvents();
    void revokeAndReport(payload, scope);
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

type RevokeScope = 'session' | 'family' | 'identity';

interface RevokeTarget {
  /** True when the revoke applies to every session of the identity. */
  all: boolean;
  /** The sessions the revoke names (session_id plus session_ids). */
  ids: Set<string>;
  scope: RevokeScope | null;
}

const MAX_ID_LEN = 256;
const SERVER_REASON_RE = /^[a-z0-9_.-]{1,64}$/;

function isSessionId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LEN;
}

/**
 * v0.4.0: read who the revoke is for. 'identity' means all sessions. Any
 * other scope means only the named ones. A payload that names nobody applies
 * to everyone (fail closed), as before.
 */
function parseRevokeTarget(payload: Record<string, unknown>): RevokeTarget {
  const raw = payload.scope;
  const scope: RevokeScope | null =
    raw === 'session' || raw === 'family' || raw === 'identity' ? raw : null;
  const ids = new Set<string>();
  if (isSessionId(payload.session_id)) ids.add(payload.session_id);
  if (Array.isArray(payload.session_ids)) {
    for (const v of payload.session_ids) if (isSessionId(v)) ids.add(v);
  }
  return { all: scope === 'identity' || ids.size === 0, ids, scope };
}

/**
 * v0.4.0: no local session id yet. Ask the server which session this
 * browser holds. Returns 'clear', 'stale', or 'live' (stale, and a session is
 * still live, so its stream must reopen).
 */
async function resolveUnknownSession(
  target: RevokeTarget,
  epochAtArrival: number
): Promise<'clear' | 'stale' | 'live'> {
  let heldId: unknown;
  try {
    const { data } = await get<Session>('/auth/v1/me');
    heldId = data?.session_meta?.session_id;
  } catch {
    // /me failed (revoked, expired, offline): we cannot rule this session
    // out, so fail closed as before.
    return getSessionEpoch() === epochAtArrival ? 'clear' : 'stale';
  }
  // A sign-in or sign-out during /me owns the session now.
  if (getSessionEpoch() !== epochAtArrival) return 'stale';
  if (!isSessionId(heldId)) return 'clear';
  return target.ids.has(heldId) ? 'clear' : 'live';
}

async function revokeAndReport(
  payload: Record<string, unknown>,
  scope: ReturnType<typeof getSessionScope>
): Promise<void> {
  // v0.3.0: the server fans a revoke out to every stream of the identity
  // (SSE_DESIGN §6.3). A payload that names other sessions is about them.
  // v0.4.0: the named set is session_id plus session_ids; 'identity' is all.
  const target = parseRevokeTarget(payload);
  const epochAtArrival = getSessionEpoch();
  let decision: 'clear' | 'stale' | 'live';
  if (target.all) decision = 'clear';
  else if (scope.sessionId !== null) decision = target.ids.has(scope.sessionId) ? 'clear' : 'stale';
  else decision = await resolveUnknownSession(target, epochAtArrival);

  // A rejected wipe has still cleared memory and told tabs and listeners, so
  // it counts as cleared; the event says the wipe failed.
  let cleared = false;
  let wipeFailed = false;
  if (decision === 'clear') {
    // After a deferred /me the scope may have moved to the id /me named
    // (AuthProvider notes it); that move is not a reason to keep the session.
    const now = getSessionScope();
    const clearScope =
      scope.sessionId === null && (now.sessionId === null || target.all || target.ids.has(now.sessionId))
        ? now
        : scope;
    try {
      cleared = await clearSessionIfCurrent(clearScope);
    } catch {
      cleared = true;
      wipeFailed = true;
    }
  }
  // v0.4.0 (issue #33 item 6): an allowlist, not a spread of the payload.
  const serverReason = payload.reason;
  const named = payload.session_id;
  void emit('session.revoked', {
    reason: typeof serverReason === 'string' && SERVER_REASON_RE.test(serverReason) ? serverReason : 'server',
    session_id: isSessionId(named) ? named : scope.sessionId,
    generation: scope.generation,
    ...(target.scope !== null ? { revoke_scope: target.scope } : {}),
    ...(cleared ? {} : { stale: true }),
    ...(wipeFailed ? { wipe_failed: true } : {}),
  });
  // The stream was closed on arrival. A stale revoke leaves a live session
  // behind, and that session still needs its revoke stream.
  if (!cleared && (getSessionScope().sessionId !== null || decision === 'live')) startSessionEvents();
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
