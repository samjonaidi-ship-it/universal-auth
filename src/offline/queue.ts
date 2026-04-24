// @bb/universal-auth | src/offline/queue.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// IDB-backed FIFO queue for offline mutations.
//
// Per spec §9.4:
//   * Records shape: {id, endpoint, method, body, headers, idempotencyKey, createdAt, retryCount}
//   * Flush order: strictly FIFO by createdAt (auto-increment id = proxy for createdAt)
//   * maxQueueSize: when reached, drop OLDEST row + emit sync.failed (spec-sanctioned, §9.4 footnote)

import { STORE_OFFLINE_QUEUE, STORE_DEAD_LETTER_QUEUE, getSharedDb } from '../core/storage.js';
import { emit } from '../core/event-reporter.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface QueuedMutation {
  id?: number;                         // auto-increment — present after put
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: unknown;
  headers: Record<string, string>;
  idempotencyKey: string;
  createdAt: number;
  retryCount: number;
}

// ── Config ────────────────────────────────────────────────────────────────

let maxQueueSize = 1000;

export function setMaxQueueSize(n: number): void {
  maxQueueSize = n;
}

// ── DB helper ─────────────────────────────────────────────────────────────

const getDb = getSharedDb;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Persist a mutation for later retry. Enforces maxQueueSize — dropping
 * the oldest row and emitting sync.failed per §9.4.
 */
export async function enqueue(
  mutation: Omit<QueuedMutation, 'id' | 'createdAt' | 'retryCount'>
): Promise<number> {
  const db = await getDb();
  const count = await db.count(STORE_OFFLINE_QUEUE);

  if (count >= maxQueueSize) {
    await dropOldest();
  }

  const row: QueuedMutation = {
    ...mutation,
    createdAt: Date.now(),
    retryCount: 0,
  };
  const id = await db.add(STORE_OFFLINE_QUEUE, row);
  return id as number;
}

/**
 * Read all queued mutations in FIFO order (by auto-increment id, which
 * monotonically follows createdAt).
 */
export async function readAll(): Promise<readonly QueuedMutation[]> {
  const db = await getDb();
  const rows = await db.getAll(STORE_OFFLINE_QUEUE);
  return rows as QueuedMutation[];
}

/**
 * Remove a single row by id (after a successful flush).
 */
export async function remove(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_OFFLINE_QUEUE, id);
}

/**
 * Increment retry counter. Returns the new value.
 */
export async function incrementRetry(id: number): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_OFFLINE_QUEUE);
  const row = (await store.get(id)) as QueuedMutation | undefined;
  if (row === undefined) {
    await tx.done;
    return 0;
  }
  row.retryCount += 1;
  await store.put(row);
  await tx.done;
  return row.retryCount;
}

/**
 * Move a mutation to the dead-letter queue (unrecoverable after max retries).
 * Emits `sync.failed`.
 */
export async function moveToDeadLetter(mutation: QueuedMutation, reason: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([STORE_OFFLINE_QUEUE, STORE_DEAD_LETTER_QUEUE], 'readwrite');
  await tx.objectStore(STORE_DEAD_LETTER_QUEUE).add({
    endpoint: mutation.endpoint,
    method: mutation.method,
    body: mutation.body,
    idempotencyKey: mutation.idempotencyKey,
    createdAt: mutation.createdAt,
    failedAt: Date.now(),
    retryCount: mutation.retryCount,
    reason,
  });
  if (mutation.id !== undefined) {
    await tx.objectStore(STORE_OFFLINE_QUEUE).delete(mutation.id);
  }
  await tx.done;
  void emit('sync.failed', {
    endpoint: mutation.endpoint,
    idempotency_key: mutation.idempotencyKey,
    retry_count: mutation.retryCount,
    reason,
  });
}

/**
 * Current queue depth (fast — count only).
 */
export async function depth(): Promise<number> {
  const db = await getDb();
  return db.count(STORE_OFFLINE_QUEUE);
}

// ── Internals ─────────────────────────────────────────────────────────────

async function dropOldest(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE_OFFLINE_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_OFFLINE_QUEUE);
  const cursor = await store.openCursor();
  if (cursor !== null) {
    const oldest = cursor.value as QueuedMutation;
    await cursor.delete();
    void emit('sync.failed', {
      endpoint: oldest.endpoint,
      idempotency_key: oldest.idempotencyKey,
      reason: 'queue_full_evicted',
    });
  }
  await tx.done;
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetQueueForTests(): void {
  // DB reset owned by storage.__resetDbForTests
  maxQueueSize = 1000;
}
