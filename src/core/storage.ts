// @bainbridgebuilders/universal-auth | src/core/storage.ts | v1.0.1 | 2026-05-01 | BB
// Encrypted IndexedDB storage — refresh token + event queue + offline queue backing store.
//
// Per spec:
//   §15.1  Tokens never touch localStorage or sessionStorage (IDB only, encrypted)
//   §9.3   AES-256-GCM (v1.0.1: native generateKey, no PBKDF2)
//   §8.2   Web Worker for crypto (off main thread) — routed via crypto-client.ts
//   §9.1   Encrypted refresh token, 90-day TTL
//
// Design split (Block 2 + A1):
//   * storage-crypto.ts  — pure crypto primitives (Worker-safe)
//   * crypto-worker.ts   — DedicatedWorker message handler
//   * crypto-client.ts   — main-thread proxy with Worker primary + pure fallback
//   * storage.ts (this)  — IDB persistence + master key + refresh-token API
//
// v1.0.1 (B2): the at-rest AES-256 master key is now generated via
// crypto.subtle.generateKey({...}, extractable=false, ...) and the resulting
// CryptoKey *handle* is persisted in the new `master_key` object store. The
// previous PBKDF2(SHA-256(UA) + constant-salt) scheme is retired — UA-derived
// "device binding" is observable, spoofable, and brittle to UA-Reduction
// rollouts. On first v1.0.1 boot we detect legacy ciphertext and wipe it
// (clean cut; zero v1.0.0 prod users per Sam's lock 2026-05-01).
//
// v1.0.1 (D3): decrypt failure now emits `device.key_mismatch` BEFORE wiping
// the row, preserving an audit trail of legitimate UA rotations vs tampers.

import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { encryptString, decryptString } from './crypto-client.js';
import type { EncryptedBlob } from './storage-crypto.js';

// Lazy load to break the storage <-> event-reporter circular import.
// (event-reporter imports getSharedDb from storage; if storage imports emit
// statically, both modules race-init and one captures `undefined`.)
async function emitEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
  const { emit } = await import('./event-reporter.js');
  await emit(eventType, payload);
}

// ── Constants ─────────────────────────────────────────────────────────────

const DB_NAME = 'bb-universal-auth';
// v1.0.1: bumped to 2 to add `master_key` store.
const DB_VERSION = 2;

export const STORE_REFRESH_TOKENS = 'refresh_tokens';
export const STORE_OFFLINE_QUEUE = 'offline_queue';
export const STORE_EVENT_QUEUE = 'event_queue';
export const STORE_DEAD_LETTER_QUEUE = 'dead_letter_queue';
export const STORE_MASTER_KEY = 'master_key';

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
      // v1.0.1 — master key store
      if (!db.objectStoreNames.contains(STORE_MASTER_KEY)) {
        db.createObjectStore(STORE_MASTER_KEY, { keyPath: 'key' });
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

// ── Master key (v1.0.1 B2) ────────────────────────────────────────────────

const MASTER_KEY_ROW_KEY = 'current';

interface MasterKeyRow {
  key: string;          // static 'current' — one row
  cryptoKey: CryptoKey; // structured-cloned by IDB (modern browsers)
  createdAt: number;
}

let cachedMasterKey: CryptoKey | null = null;
let cachedMasterKeyPromise: Promise<CryptoKey> | null = null;

/**
 * Fetch (or generate-and-persist) the SDK's at-rest AES-256-GCM master key.
 *
 * Strategy:
 *   1. If a row exists in `master_key`, return its CryptoKey handle.
 *   2. Otherwise generate a fresh non-extractable AES-256-GCM key, persist
 *      its handle, and return.
 *
 * The CryptoKey handle is non-extractable: raw bytes never leave Web Crypto.
 * IDB structured-cloning a non-extractable key works in Chrome 71+, Firefox
 * 75+, Safari 15+ — well within our v1.0 browser baseline.
 */
export function getOrCreateMasterKey(): Promise<CryptoKey> {
  if (cachedMasterKey !== null) return Promise.resolve(cachedMasterKey);
  if (cachedMasterKeyPromise !== null) return cachedMasterKeyPromise;
  cachedMasterKeyPromise = (async () => {
    const db = await getDb();
    const existing = (await db.get(STORE_MASTER_KEY, MASTER_KEY_ROW_KEY)) as
      | MasterKeyRow
      | undefined;
    if (existing && typeof CryptoKey !== 'undefined' && existing.cryptoKey instanceof CryptoKey) {
      cachedMasterKey = existing.cryptoKey;
      return existing.cryptoKey;
    }
    const newKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const row: MasterKeyRow = {
      key: MASTER_KEY_ROW_KEY,
      cryptoKey: newKey,
      createdAt: Date.now(),
    };
    try {
      await db.put(STORE_MASTER_KEY, row);
    } catch {
      // Some test envs / older browsers reject CryptoKey structured-clone
      // into IDB. Cache in-memory for the tab so the SDK still functions.
    }
    cachedMasterKey = newKey;
    return newKey;
  })();
  return cachedMasterKeyPromise;
}

/**
 * One-shot legacy-ciphertext wipe. Called once per tab boot from storage init.
 * If a refresh-token row exists but no master key is persisted, the ciphertext
 * was written under v1.0.0's PBKDF2 scheme and cannot be decrypted.
 */
async function wipeLegacyCiphertextIfPresent(): Promise<void> {
  const db = await getDb();
  const masterRow = await db.get(STORE_MASTER_KEY, MASTER_KEY_ROW_KEY);
  if (masterRow !== undefined) return;
  const tokenRow = await db.get(STORE_REFRESH_TOKENS, REFRESH_KEY_ROW_KEY);
  if (tokenRow !== undefined) {
    await db.delete(STORE_REFRESH_TOKENS, REFRESH_KEY_ROW_KEY);
  }
}

let legacyWipeChecked = false;
async function ensureLegacyWipe(): Promise<void> {
  if (legacyWipeChecked) return;
  legacyWipeChecked = true;
  try {
    await wipeLegacyCiphertextIfPresent();
  } catch {
    // Best-effort. A failure here only means a stale row stays one more boot.
  }
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
 * Store the refresh token encrypted under the IDB-persisted master key.
 * Encryption runs in the Web Worker per §8.2 when available.
 */
export async function storeRefreshToken(refreshToken: string, expiresAtMs: number): Promise<void> {
  await ensureLegacyWipe();
  const masterKey = await getOrCreateMasterKey();
  const blob = await encryptString(refreshToken, masterKey);
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
 * or decryption fails (master key cleared / row tampered).
 *
 * v1.0.1 (D3): on decrypt failure we emit `device.key_mismatch` with a
 * reason hint BEFORE wiping the row, so legitimate key losses (cleared
 * site data, IDB recreated) can be distinguished from tamper attempts.
 */
export async function getRefreshToken(): Promise<string | null> {
  await ensureLegacyWipe();
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

  // If a row exists but the master key is gone, that's a key_handle_missing —
  // browser cleared site data after the row was written, or IDB was migrated
  // out of order. Decrypt would throw anyway; emit + bail before attempting.
  const masterRow = await db.get(STORE_MASTER_KEY, MASTER_KEY_ROW_KEY);
  if (masterRow === undefined) {
    void emitEvent('device.key_mismatch', { reason: 'key_handle_missing' });
    await clearRefreshToken();
    return null;
  }

  try {
    const masterKey = await getOrCreateMasterKey();
    const blob: EncryptedBlob = {
      iv: toOwnedBytes(row.iv),
      ciphertext: toOwnedBytes(row.ciphertext),
    };
    return await decryptString(blob, masterKey);
  } catch (err) {
    // Distinguish IV-shape failures from auth-tag mismatches when possible.
    const reason = inferDecryptFailureReason(err, row);
    void emitEvent('device.key_mismatch', { reason });
    await clearRefreshToken();
    return null;
  }
}

function inferDecryptFailureReason(
  err: unknown,
  row: RefreshTokenRow
): 'aes_gcm_auth_tag_failed' | 'unknown_iv' | 'key_handle_missing' {
  if (row.iv === undefined || row.iv.byteLength !== 12) return 'unknown_iv';
  const msg = err instanceof Error ? err.message : '';
  if (/operation-specific reason|cipher|auth/i.test(msg)) return 'aes_gcm_auth_tag_failed';
  return 'aes_gcm_auth_tag_failed';
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
    [STORE_REFRESH_TOKENS, STORE_OFFLINE_QUEUE, STORE_EVENT_QUEUE, STORE_DEAD_LETTER_QUEUE],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore(STORE_REFRESH_TOKENS).clear(),
    tx.objectStore(STORE_OFFLINE_QUEUE).clear(),
    tx.objectStore(STORE_EVENT_QUEUE).clear(),
    tx.objectStore(STORE_DEAD_LETTER_QUEUE).clear(),
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
  cachedMasterKey = null;
  cachedMasterKeyPromise = null;
  legacyWipeChecked = false;
  // Fully delete to guarantee test isolation — the upgrade callback runs
  // fresh on the next open() and no rows survive between tests.
  try {
    await deleteDB(DB_NAME);
  } catch {
    // ignore — DB may not exist yet
  }
}
