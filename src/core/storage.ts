// @bb/universal-auth | src/core/storage.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Encrypted IndexedDB storage — refresh token + event queue + offline queue backing store.
//
// Per spec:
//   §15.1  Tokens never touch localStorage or sessionStorage (IDB only, encrypted)
//   §9.3   AES-256-GCM + PBKDF2 encryption
//   §8.2   Web Worker for crypto (off main thread) — routed via crypto-client.ts
//   §9.1   Encrypted refresh token, 90-day TTL
//
// Design split (Block 2 + A1):
//   * storage-crypto.ts  — pure crypto primitives (Worker-safe)
//   * crypto-worker.ts   — DedicatedWorker message handler
//   * crypto-client.ts   — main-thread proxy with Worker primary + pure fallback
//   * storage.ts (this)  — IDB persistence + high-level refresh-token API

import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { getOrCreateDeviceId } from './device-id.js';
import { encryptString, decryptString } from './crypto-client.js';
import type { EncryptedBlob } from './storage-crypto.js';

// ── Constants ─────────────────────────────────────────────────────────────

const DB_NAME = 'bb-universal-auth';
const DB_VERSION = 1;

export const STORE_REFRESH_TOKENS = 'refresh_tokens';
export const STORE_OFFLINE_QUEUE = 'offline_queue';
export const STORE_EVENT_QUEUE = 'event_queue';
export const STORE_DEAD_LETTER_QUEUE = 'dead_letter_queue';

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Copy bytes into a freshly-allocated ArrayBuffer-backed Uint8Array.
 * IDB round-trip widens type to Uint8Array<ArrayBufferLike> which Web Crypto's
 * BufferSource rejects under TS 5.5+ strict mode.
 */
function toOwnedBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const dst = new Uint8Array(new ArrayBuffer(src.byteLength));
  dst.set(src);
  return dst;
}

// ── DB open (singleton per tab) ───────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (dbPromise !== null) return dbPromise;
  dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_REFRESH_TOKENS)) {
        db.createObjectStore(STORE_REFRESH_TOKENS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_OFFLINE_QUEUE)) {
        const offline = db.createObjectStore(STORE_OFFLINE_QUEUE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        offline.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
        offline.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORE_EVENT_QUEUE)) {
        db.createObjectStore(STORE_EVENT_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_DEAD_LETTER_QUEUE)) {
        db.createObjectStore(STORE_DEAD_LETTER_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    },
  });
  return dbPromise;
}

/**
 * Shared DB getter for sibling modules (event-reporter, offline/queue, sdk-metrics).
 * Guarantees the upgrade callback runs exactly once per tab regardless of
 * which module is first to touch IDB.
 */
export function getSharedDb(): Promise<IDBPDatabase> {
  return getDb();
}

// ── Encrypted refresh-token storage ───────────────────────────────────────

const REFRESH_KEY_ROW_KEY = 'current';

interface RefreshTokenRow {
  key: string;        // static 'current' — one row
  iv: Uint8Array;
  ciphertext: Uint8Array;
  expiresAt: number;  // epoch ms — 90-day TTL per §9.6
  storedAt: number;
}

/**
 * Store the refresh token encrypted with a device-bound AES-256-GCM key
 * (derivation + encryption happen in the Web Worker per §8.2).
 */
export async function storeRefreshToken(refreshToken: string, expiresAtMs: number): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  const blob = await encryptString(refreshToken, deviceId);
  const db = await getDb();
  const row: RefreshTokenRow = {
    key: REFRESH_KEY_ROW_KEY,
    iv: blob.iv,
    ciphertext: blob.ciphertext,
    expiresAt: expiresAtMs,
    storedAt: Date.now(),
  };
  await db.put(STORE_REFRESH_TOKENS, row);
}

/**
 * Retrieve + decrypt the refresh token. Returns null if not stored, expired,
 * or decryption fails (device-bound key mismatch — IDB copied to another device).
 */
export async function getRefreshToken(): Promise<string | null> {
  const db = await getDb();
  const row = (await db.get(STORE_REFRESH_TOKENS, REFRESH_KEY_ROW_KEY)) as
    | RefreshTokenRow
    | undefined;
  if (!row) return null;

  // 90-day hard cutoff per §9.6
  if (row.expiresAt < Date.now()) {
    await clearRefreshToken();
    return null;
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    const blob: EncryptedBlob = {
      iv: toOwnedBytes(row.iv),
      ciphertext: toOwnedBytes(row.ciphertext),
    };
    return await decryptString(blob, deviceId);
  } catch {
    // Key mismatch OR tampered ciphertext — §11.8 graceful-fail
    await clearRefreshToken();
    return null;
  }
}

export async function clearRefreshToken(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_REFRESH_TOKENS, REFRESH_KEY_ROW_KEY);
}

/**
 * Nuke all SDK-owned IDB state — called on `logout` + `session.revoked`.
 * Does NOT drop the database (other stores may still be in transit).
 */
export async function clearAllSessionState(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(
    [STORE_REFRESH_TOKENS, STORE_OFFLINE_QUEUE, STORE_EVENT_QUEUE],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore(STORE_REFRESH_TOKENS).clear(),
    tx.objectStore(STORE_OFFLINE_QUEUE).clear(),
    tx.objectStore(STORE_EVENT_QUEUE).clear(),
  ]);
  await tx.done;
}

// ── Test-only helpers ─────────────────────────────────────────────────────

/**
 * Close the DB handle and reset the singleton.
 * Used by unit tests that need a fresh fake-indexeddb per test.
 * NOT part of the public SDK API.
 */
export async function __resetDbForTests(): Promise<void> {
  if (dbPromise !== null) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  // Fully delete to guarantee test isolation — the upgrade callback runs
  // fresh on the next open() and no rows survive between tests.
  try {
    await deleteDB(DB_NAME);
  } catch {
    // ignore — DB may not exist yet
  }
}
