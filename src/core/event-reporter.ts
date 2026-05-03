// @samjonaidi-ship-it/universal-auth | src/core/event-reporter.ts | v1.0.1 | 2026-05-01 | BB
// Event batching + ingestion — POST /events/v1/ingest (§3.2 / §6).
//
// v1.0.1 (D5): the device id is cached at module level after first resolution.
// device-id.ts also memoizes, but resolving through that path still costs a
// JS hop per emit() — and emit() is in the hot path for every UI interaction.
//
// Invariants per spec:
//   §3.2   Batch up to 50 events per request; rejects unknown event types
//   §6.3   Envelope auto-populates sdk_version, protocol_version, client_ts
//   §6.3   Unknown event types → server drops; SDK logs and discards
//   §8.1   10s flush window OR 50-event cap, whichever first
//   §8.1   Immediate flush on `logout`, `session.revoked`
//
// Persistence: events go to IDB `event_queue` so they survive page reload.
// On successful batch POST, rows are removed from IDB.

import { getOrCreateDeviceId } from './device-id.js';
import { getClientConfig, post } from './client.js';
import { getCurrentSessionId } from './token-manager.js';
import { STORE_EVENT_QUEUE, getSharedDb } from './storage.js';
import { AuthSdkError } from '../errors.js';

// ── Public types ──────────────────────────────────────────────────────────

/**
 * Standard event envelope per §6.3 — the SDK auto-populates every field
 * except `event_type` and `payload` which come from the emitter.
 */
export interface EventEnvelope {
  event_type: string;
  app_id: string;
  identity_id: string | null;
  session_id: string | null;
  device_id: string;
  client_ts: string;       // ISO 8601
  payload: Record<string, unknown>;
  sdk_version: string;
  protocol_version: 'v1';
  active_persona?: string;  // D8 — set when known
}

export interface EventReporterConfig {
  /** Max events in a single POST. Default 50 per §3.2. */
  batchSize?: number;
  /** Flush timer in ms. Default 10_000 per §8.1. */
  batchInterval?: number;
  /** Optional identity-id getter (for stamping events). */
  getIdentityId?: () => string | null;
  /** Optional active-persona getter (D8). */
  getActivePersona?: () => string | null;
}

// ── Internal state ────────────────────────────────────────────────────────

interface Row {
  id?: number;                 // auto-increment — present after put
  envelope: EventEnvelope;
  createdAt: number;
}

let config: Required<Pick<EventReporterConfig, 'batchSize' | 'batchInterval'>> = {
  batchSize: 50,
  batchInterval: 10_000,
};

let getIdentityIdFn: () => string | null = () => null;
let getActivePersonaFn: () => string | null = () => null;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightFlush: Promise<void> | null = null;
let configured = false;

// v1.0.1 (D5): cache the device id at first resolution. Cleared by
// __resetEventReporterForTests so unit tests get a fresh value per test.
let cachedDeviceId: string | null = null;
async function resolveDeviceId(): Promise<string> {
  if (cachedDeviceId !== null) return cachedDeviceId;
  cachedDeviceId = await getOrCreateDeviceId();
  return cachedDeviceId;
}

// IDB handle — delegates to storage.getSharedDb so the upgrade callback
// runs exactly once regardless of module init order.
const getDb = getSharedDb;

// ── Public API ────────────────────────────────────────────────────────────

export function configureEventReporter(opts: EventReporterConfig = {}): void {
  if (opts.batchSize !== undefined) config.batchSize = opts.batchSize;
  if (opts.batchInterval !== undefined) config.batchInterval = opts.batchInterval;
  if (opts.getIdentityId !== undefined) getIdentityIdFn = opts.getIdentityId;
  if (opts.getActivePersona !== undefined) getActivePersonaFn = opts.getActivePersona;
  configured = true;
}

/**
 * Emit an event. Persists to IDB, schedules a flush.
 * Non-blocking (async fire-and-forget — callers don't await by convention).
 */
export async function emit(
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  if (!configured) {
    // Pre-init events silently drop rather than crash the app.
    return;
  }

  const clientConfig = getClientConfig();
  if (clientConfig === null) return;

  const envelope: EventEnvelope = {
    event_type: eventType,
    app_id: clientConfig.appId,
    identity_id: getIdentityIdFn(),
    session_id: getCurrentSessionId(),
    device_id: await resolveDeviceId(),
    client_ts: new Date().toISOString(),
    payload,
    sdk_version: clientConfig.sdkVersion,
    protocol_version: 'v1',
  };
  const persona = getActivePersonaFn();
  if (persona !== null) envelope.active_persona = persona;

  // Persist to IDB. Wrap in try/catch — multi-tab DB upgrades, page-unload
  // races, and SW termination can close the connection mid-transaction
  // (browser throws `InvalidStateError` / `TransactionInactiveError`).
  // Better to drop the event silently than crash the calling code, which
  // is typically a fire-and-forget `void emit(...)` chain.
  // (Look-back fix L12 2026-04-28.)
  // v1.0.1 (Phase E8): also handle QuotaExceededError separately — when the
  // browser refuses the write because user storage is full, emit
  // sync.failed{reason:'quota_exceeded'} so the host app can surface the
  // condition. Reusing the existing sync.failed taxonomy from src/offline/queue.ts.
  try {
    const db = await getDb();
    await db.add(STORE_EVENT_QUEUE, {
      envelope,
      createdAt: Date.now(),
    } satisfies Row);

    const count = await db.count(STORE_EVENT_QUEUE);
    if (count >= config.batchSize) {
      void flushNow();
    } else {
      scheduleFlush();
    }
  } catch (e) {
    if (isQuotaExceededError(e)) {
      // Re-entry guard: if THIS emit() was itself a sync.failed event, do
      // NOT recurse — drop silently to avoid an infinite quota loop.
      if (eventType !== 'sync.failed') {
        void emit('sync.failed', {
          endpoint: '/events/v1/ingest',
          reason: 'quota_exceeded',
          dropped_event_type: eventType,
        });
      }
      return;
    }
    if (isTransientIdbError(e)) {
      // Drop the event. Same-tab next emit() will succeed once the
      // upgrade/close completes. Multi-tab: the other tab's emit() carries
      // its own copy.
      return;
    }
    throw e;
  }
}

/**
 * True for IDB QuotaExceededError. Browsers signal this either via
 * DOMException with name `QuotaExceededError` or via legacy code 22.
 *
 * @internal — exported for unit tests only.
 */
export function isQuotaExceededError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === 'QuotaExceededError') return true;
  // Legacy DOMException code path (pre-2017 Safari, very-old Edge):
  const code = (e as Error & { code?: number }).code;
  return code === 22;
}

/**
 * True for IDB errors that come from the connection being closed mid-flight
 * (multi-tab upgrade, page unload race, SW termination). These are not
 * product bugs — the SDK should drop the call and continue.
 *
 * @internal — exported for unit tests only.
 */
export function isTransientIdbError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.name === 'InvalidStateError' ||
    e.name === 'TransactionInactiveError' ||
    /transaction is not active|database connection is closing/i.test(e.message)
  );
}

/**
 * Force an immediate flush. Used on `logout`, `session.revoked`, and
 * page `visibilitychange → hidden`.
 */
export async function flushNow(): Promise<void> {
  if (inFlightFlush !== null) return inFlightFlush;
  inFlightFlush = doFlush().finally(() => {
    inFlightFlush = null;
  });
  return inFlightFlush;
}

// ── Internals ─────────────────────────────────────────────────────────────

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, config.batchInterval);
}

async function doFlush(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const db = await getDb();

  // Read up to batchSize rows in insertion order (keyPath:id auto-increments,
  // so natural key order = insertion order).
  const tx = db.transaction(STORE_EVENT_QUEUE, 'readonly');
  const store = tx.objectStore(STORE_EVENT_QUEUE);
  const rows: Row[] = [];
  let cursor = await store.openCursor();
  while (cursor !== null && rows.length < config.batchSize) {
    rows.push(cursor.value as Row);
    cursor = await cursor.continue();
  }
  await tx.done;

  if (rows.length === 0) return;

  const batch = rows.map((r) => r.envelope);

  try {
    // `anonymous: false` — but if no access token is present, the client
    // skips the Authorization header; CT BFF accepts unauth ingest for
    // enrollment-phase events.
    await post('/events/v1/ingest', { events: batch });
  } catch (err) {
    // On 4xx (non-auth), assume server-side validation rejected — drop these
    // events permanently to prevent infinite retry loops. The typical cause
    // is UNKNOWN_EVENT_TYPE per §6.3 — server contract says "dropped".
    if (err instanceof AuthSdkError && isPermanentFailure(err)) {
      await deleteRows(rows);
      return;
    }
    // Network error or 5xx — leave in queue for next flush attempt.
    // Re-schedule so the timer picks up the retry.
    scheduleFlush();
    return;
  }

  // Success — purge the flushed rows.
  await deleteRows(rows);

  // If more events arrived during the POST, keep flushing.
  const remaining = await db.count(STORE_EVENT_QUEUE);
  if (remaining > 0) {
    scheduleFlush();
  }
}

function isPermanentFailure(err: AuthSdkError): boolean {
  // Treat any error that looks like a validation or not-found as permanent.
  // Auth errors (401/403) are NOT permanent — they clear elsewhere and we
  // want events flushed on next login.
  const permanent = new Set([
    'UNKNOWN_EVENT_TYPE',
    'APP_NOT_REGISTERED',
    'VERSION_INCOMPATIBLE',
  ]);
  return permanent.has(err.code);
}

async function deleteRows(rows: Row[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE_EVENT_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_EVENT_QUEUE);
  await Promise.all(
    rows
      .filter((r): r is Required<Row> => r.id !== undefined)
      .map((r) => store.delete(r.id))
  );
  await tx.done;
}

// ── Test-only helpers ─────────────────────────────────────────────────────

export function __resetEventReporterForTests(): void {
  configured = false;
  config = { batchSize: 50, batchInterval: 10_000 };
  getIdentityIdFn = () => null;
  getActivePersonaFn = () => null;
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  inFlightFlush = null;
  cachedDeviceId = null;
  // DB handle reset is owned by storage.__resetDbForTests — we're just a consumer.
}
