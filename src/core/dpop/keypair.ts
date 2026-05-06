// @samjonaidi-ship-it/universal-auth | src/core/dpop/keypair.ts | v0.1.0 | 2026-05-06 | BB
// WebCrypto ES256 (P-256) keypair generation + IndexedDB persistence.
//
// Per DPOP_DESIGN_v1.0.md §5.2:
//   - First boot: generateKey({...}, extractable=false, ['sign','verify'])
//   - Subsequent boots: load from IDB; if missing or corrupt, regenerate.
//   - Sign-out: deleteKeypair() clears the row.
//
// Why a separate IDB store from the AES master key in storage.ts:
//   storage.ts encrypts blobs with the master key and stores ciphertext.
//   Our private key is `extractable=false` — its raw bytes are inaccessible
//   to JS. We persist the CryptoKey *handle* itself via IDB structured-clone
//   (Chrome 71+ / FF 75+ / Safari 15+ — same baseline as master_key in
//   storage.ts). The browser's crypto subsystem keeps the key material
//   protected; only an opaque handle is serialised.
//
// Companion server: bff/services/dpop.js v0.1.0 — verifies proofs signed
// with the matching private key.

import { getSharedDb, STORE_DPOP_KEYPAIR } from '../storage.js';

const KEYPAIR_ROW_KEY = 'current';

interface KeypairRow {
  key: string;             // static 'current' — single-row store
  publicKey: CryptoKey;    // structured-cloneable handle
  privateKey: CryptoKey;   // structured-cloneable handle (extractable=false)
  createdAt: number;
}

const ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const KEY_USAGES: KeyUsage[] = ['sign', 'verify'];

/**
 * Generate a fresh ES256 keypair and persist its handle in IDB.
 *
 * Private key is `extractable=false` — raw bytes never leave the browser's
 * crypto subsystem. Sign operations route through `crypto.subtle.sign`.
 */
export async function generateAndStoreKeypair(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, false, KEY_USAGES);
  await persist(pair);
  return pair;
}

/**
 * Load the persisted keypair. Returns null if no row exists or the row is
 * structurally corrupt (e.g. structured-clone mismatch after a browser
 * upgrade). Caller is expected to fall back to generateAndStoreKeypair().
 */
export async function loadKeypair(): Promise<CryptoKeyPair | null> {
  try {
    const db = await getSharedDb();
    const row = (await db.get(STORE_DPOP_KEYPAIR, KEYPAIR_ROW_KEY)) as KeypairRow | undefined;
    if (row === undefined) return null;
    if (
      typeof CryptoKey === 'undefined' ||
      !(row.publicKey instanceof CryptoKey) ||
      !(row.privateKey instanceof CryptoKey)
    ) {
      return null;
    }
    return { publicKey: row.publicKey, privateKey: row.privateKey };
  } catch {
    return null;
  }
}

/**
 * Idempotent: load the existing keypair, or generate + store a new one.
 * This is the primary entry point for the SDK's per-request signing path.
 */
export async function getOrCreateKeypair(): Promise<CryptoKeyPair> {
  const existing = await loadKeypair();
  if (existing !== null) return existing;
  return generateAndStoreKeypair();
}

/**
 * Delete the persisted keypair. Called on sign-out and on server-forced
 * session revocation. Best-effort: a transient IDB failure is swallowed —
 * a stale row will be overwritten on the next generateAndStoreKeypair().
 */
export async function deleteKeypair(): Promise<void> {
  try {
    const db = await getSharedDb();
    await db.delete(STORE_DPOP_KEYPAIR, KEYPAIR_ROW_KEY);
  } catch {
    // ignore — best effort
  }
}

// ── Internal ──────────────────────────────────────────────────────────────

async function persist(pair: CryptoKeyPair): Promise<void> {
  const row: KeypairRow = {
    key: KEYPAIR_ROW_KEY,
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    createdAt: Date.now(),
  };
  try {
    const db = await getSharedDb();
    await db.put(STORE_DPOP_KEYPAIR, row);
  } catch {
    // Some test envs reject CryptoKey structured-clone into IDB. The pair
    // is still usable for the current tab — tests cover this path.
  }
}
