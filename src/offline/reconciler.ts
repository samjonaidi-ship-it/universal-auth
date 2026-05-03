// @samjonaidi-ship-it/universal-auth | src/offline/reconciler.ts | v1.0.1 | 2026-05-01 | BB
// Queue flush + reconciliation per §9.4 status-code matrix.
//
// Matrix:
//   2xx or 4xx (except 429) → delete from queue
//   5xx or network error    → exponential backoff, max 5 retries, then dead-letter + sync.failed
//   429                     → respect Retry-After (D4: per-row retryAfterTs), pause flush
//   401                     → stop, trigger re-auth, resume on success
//   409                     → emit sync.conflict, delete from queue (client can re-queue)
//
// v1.0.1 (D4): Retry-After parsing supports BOTH delta-seconds and HTTP-date
// per RFC 7231 §7.1.3. The parsed timestamp is persisted on the row so a
// later flush() correctly waits even if the page reloaded in between.

import { readAll, remove, setRetryAfter, incrementRetry, moveToDeadLetter, type QueuedMutation } from './queue.js';
import { getClientConfig } from '../core/client.js';
import { getAccessToken } from '../core/token-manager.js';
import { emit } from '../core/event-reporter.js';

const MAX_RETRIES = 5;

let flushing: Promise<FlushResult> | null = null;

export interface FlushResult {
  flushed: number;
  failed: number;
  deferred: number;
}

/**
 * Drain the queue. Concurrent callers coalesce on a single run.
 * Returns how many rows succeeded, failed, or got deferred (auth pause / 429).
 */
export async function flush(): Promise<FlushResult> {
  if (flushing !== null) return flushing;
  flushing = (async () => {
    const result: FlushResult = { flushed: 0, failed: 0, deferred: 0 };
    const rows = await readAll();

    const now = Date.now();
    for (const row of rows) {
      // v1.0.1 (D4): skip rows still under server-assigned cooldown.
      if (row.retryAfterTs !== undefined && row.retryAfterTs > now) {
        result.deferred += 1;
        continue;
      }
      const outcome = await flushOne(row);
      if (outcome === 'ok') result.flushed += 1;
      else if (outcome === 'fail') result.failed += 1;
      else if (outcome === 'defer') {
        result.deferred += 1;
        break;  // stop further flushing on auth pause / 429
      }
    }

    return result;
  })();

  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

type Outcome = 'ok' | 'fail' | 'defer';

async function flushOne(row: QueuedMutation): Promise<Outcome> {
  const cfg = getClientConfig();
  if (cfg === null) return 'defer';

  // Bespoke fetch (can't use client.ts's request() because that would
  // re-enqueue on network failure → infinite loop). We mimic its headers
  // directly here.
  const url = joinUrl(cfg.apiBaseUrl, row.endpoint);
  const accessToken = await getAccessToken();

  const headers: Record<string, string> = {
    'X-Auth-Protocol-Version': 'v1',
    'X-App-Id': cfg.appId,
    'X-SDK-Version': cfg.sdkVersion,
    'Idempotency-Key': row.idempotencyKey,
    Accept: 'application/json',
    ...row.headers,
  };
  if (row.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken !== null) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    const init: RequestInit = {
      method: row.method,
      credentials: 'include',
      headers,
      // v1.0.1 (C1 lookback): match the B4 hardening applied to client.ts —
      // CT BFF never legitimately redirects an offline-queue replay; manual
      // redirect surfaces 3xx as opaque-redirect (status 0) which we treat as
      // a network error, preventing auth-header leak across cross-origin
      // redirect targets.
      redirect: 'manual',
      referrerPolicy: 'strict-origin-when-cross-origin',
    };
    if (row.body !== undefined) init.body = JSON.stringify(row.body);
    response = await fetch(url, init);
  } catch {
    // Network error → retry policy
    return handleTransientFailure(row, 'network');
  }

  // v1.0.1 (C1 lookback): opaque-redirect → treat as a transient failure (the
  // server may be temporarily mis-configured to issue a 3xx). 304 is impossible
  // here because reconciler replays mutations, never conditional GETs.
  if (response.type === 'opaqueredirect') {
    return handleTransientFailure(row, 'network');
  }

  const status = response.status;

  // 401 → stop flushing; re-auth needed
  if (status === 401) {
    return 'defer';
  }

  // 429 → respect Retry-After (D4), stamp the row, stop flushing.
  if (status === 429) {
    if (row.id !== undefined) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterTs = parseRetryAfter(retryAfterHeader);
      if (retryAfterTs !== null) {
        await setRetryAfter(row.id, retryAfterTs);
      }
    }
    return 'defer';
  }

  // 409 Conflict → user-visible reconciliation needed; don't retry
  if (status === 409) {
    void emit('sync.conflict', {
      endpoint: row.endpoint,
      idempotency_key: row.idempotencyKey,
    });
    if (row.id !== undefined) await remove(row.id);
    return 'ok';
  }

  // 2xx or other 4xx → success or permanent client error; remove from queue
  if ((status >= 200 && status < 300) || (status >= 400 && status < 500)) {
    if (row.id !== undefined) await remove(row.id);
    return 'ok';
  }

  // 5xx → transient server failure
  return handleTransientFailure(row, `http_${status}`);
}

async function handleTransientFailure(row: QueuedMutation, reason: string): Promise<Outcome> {
  if (row.id === undefined) return 'fail';
  const newCount = await incrementRetry(row.id);
  if (newCount > MAX_RETRIES) {
    await moveToDeadLetter(row, reason);
    return 'fail';
  }
  return 'fail';
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * Parse a `Retry-After` header value into an epoch-ms timestamp.
 * RFC 7231 §7.1.3 — accepts EITHER:
 *   - delta-seconds: a non-negative decimal integer ("120")
 *   - HTTP-date:     an IMF-fixdate timestamp ("Wed, 21 Oct 2026 07:28:00 GMT")
 * Returns null if the value can't be parsed.
 *
 * Exported via `__parseRetryAfterForTests` for unit coverage.
 */
function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  // delta-seconds: digits only.
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    return Date.now() + seconds * 1000;
  }
  // HTTP-date.
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export const __parseRetryAfterForTests = parseRetryAfter;

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetReconcilerForTests(): void {
  flushing = null;
}
