// @bb/universal-auth | src/core/storage.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Encrypted IndexedDB storage — refresh token + event queue + offline queue backing store.
//
// Per spec:
//   §15.1 L1353  Tokens never touch localStorage or sessionStorage (IDB only, encrypted)
//   §9.3 L227    AES-256-GCM + PBKDF2 encryption
//   §8.2 L826    Web Worker for crypto (off main thread)
//   §9.1 L864    Encrypted refresh token, 90-day TTL
//
// Design notes (Block 2 Day 3-4):
//   * Crypto uses native Web Crypto API; no `jose`, no `crypto-js`
//   * Key derivation: PBKDF2-SHA256, 100_000 iterations, device-bound salt input
//   * 12-byte random IV per encryption (AES-GCM mandate)
//   * `idb` (Jake Archibald) wrapper for promise-based IDB access
//
// A1 Gate #3 requires crypto to run in a Worker. Day 3 ships main-thread crypto;
// Day 4 moves to Worker (pure functions below are Worker-transfer-safe). The public
// API here is unchanged when Worker lands — only the `deriveKey` + `encrypt` + `decrypt`
// internal calls move to a postMessage boundary.

import { openDB, type IDBPDatabase } from 'idb';
import { getOrCreateDeviceId } from './device-id.js';

// ── Constants ─────────────────────────────────────────────────────────────

const DB_NAME = 'bb-universal-auth';
const DB_VERSION = 1;

export const STORE_REFRESH_TOKENS = 'refresh_tokens';
export const STORE_OFFLINE_QUEUE = 'offline_queue';
export const STORE_EVENT_QUEUE = 'event_queue';
export const STORE_DEAD_LETTER_QUEUE = 'dead_letter_queue';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT = new TextEncoder().encode('bb-universal-auth-v1-salt');
const AES_KEY_LENGTH = 256;
const AES_IV_BYTES = 12;

// ── DB open (singleton per tab) ───────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Copy bytes into a freshly-allocated ArrayBuffer-backed Uint8Array.
 * Required after IDB round-trip (IDB-decoded typed arrays have
 * Uint8Array<ArrayBufferLike> type which Web Crypto BufferSource rejects).
 */
function toOwnedBytes(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const dst = new Uint8Array(new ArrayBuffer(src.byteLength));
  dst.set(src);
  return dst;
}

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

// ── Crypto primitives (pure — Worker-transfer-safe) ───────────────────────

/**
 * Derive a 256-bit AES-GCM key from a device-bound input via PBKDF2-SHA256.
 * Input is typically the deviceId (SHA-256 of User-Agent).
 *
 * Moves to Web Worker at A1 Day 4 end per §8.2 L826. The signature is already
 * Worker-compatible (pure input → pure output).
 */
export async function deriveKey(deviceBoundInput: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(deviceBoundInput),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: PBKDF2_SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypted blob — fields are stored in IDB as-is and passed to Web Crypto.
 * Explicit ArrayBuffer-backed Uint8Array to satisfy lib.dom.d.ts BufferSource.
 */
export interface EncryptedBlob {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(AES_IV_BYTES)));
  const plainBytes = new TextEncoder().encode(plaintext);
  const plainCopy = new Uint8Array(new ArrayBuffer(plainBytes.byteLength));
  plainCopy.set(plainBytes);
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainCopy);
  const ciphertext = new Uint8Array(ciphertextBuf);
  return { iv, ciphertext };
}

export async function decrypt(blob: EncryptedBlob, key: CryptoKey): Promise<string> {
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.iv },
    key,
    blob.ciphertext
  );
  return new TextDecoder().decode(plaintextBuf);
}

// ── Encrypted refresh-token storage ───────────────────────────────────────

const REFRESH_KEY_ROW_KEY = 'current';

interface RefreshTokenRow {
  key: string;        // static 'current' — one row
  iv: Uint8Array;
  ciphertext: Uint8Array;
  expiresAt: number;  // epoch ms — 90-day TTL per §9.6 L982
  storedAt: number;
}

/**
 * Store the refresh token encrypted with a device-bound AES-256-GCM key.
 */
export async function storeRefreshToken(refreshToken: string, expiresAtMs: number): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  const key = await deriveKey(deviceId);
  const blob = await encrypt(refreshToken, key);
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
 * or decryption fails (device-bound key mismatch — IDB file moved to another device).
 */
export async function getRefreshToken(): Promise<string | null> {
  const db = await getDb();
  const row = (await db.get(STORE_REFRESH_TOKENS, REFRESH_KEY_ROW_KEY)) as
    | RefreshTokenRow
    | undefined;
  if (!row) return null;

  // 90-day hard cutoff per §9.6 L982
  if (row.expiresAt < Date.now()) {
    await clearRefreshToken();
    return null;
  }

  try {
    const deviceId = await getOrCreateDeviceId();
    const key = await deriveKey(deviceId);
    // Re-copy into ArrayBuffer-backed Uint8Arrays — IDB round-trip widens
    // type to Uint8Array<ArrayBufferLike> which Web Crypto's BufferSource rejects.
    const iv = toOwnedBytes(row.iv);
    const ciphertext = toOwnedBytes(row.ciphertext);
    return await decrypt({ iv, ciphertext }, key);
  } catch {
    // Key mismatch (different device) OR tampered ciphertext — §11.8 L1148 graceful-fail
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
}
