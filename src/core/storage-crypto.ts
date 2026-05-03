// @samjonaidi-ship-it/universal-auth | src/core/storage-crypto.ts | v1.0.1 | 2026-05-01 | BB
// Pure crypto primitives (AES-256-GCM) used by both:
//   * crypto-worker.ts — primary path, off-main-thread per §8.2
//   * crypto-client.ts — main-thread fallback for test/SSR environments
//
// Keep this module free of DOM / IDB / network — it must be importable from
// any JS realm (main thread, DedicatedWorker, ServiceWorker, Node test harness).
//
// v1.0.1 (B2): retired the PBKDF2 deriveKey path. The SDK now generates a
// non-extractable AES-256-GCM key via crypto.subtle.generateKey() and persists
// the CryptoKey *handle* in IndexedDB (see core/storage.ts → getOrCreateMasterKey).
// `generateMasterKey()` is exported for the rare caller that needs a fresh key
// outside the cached path (e.g. a test).

const AES_KEY_LENGTH = 256;
const AES_IV_BYTES = 12;

/**
 * Encrypted payload — both fields are ArrayBuffer-backed so they pass cleanly
 * through Web Crypto (BufferSource) and structured-clone boundaries.
 */
export interface EncryptedBlob {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
}

/**
 * Generate a fresh non-extractable AES-256-GCM key. The returned CryptoKey
 * is structured-cloneable into IndexedDB but its raw bytes never leave Web
 * Crypto.
 */
export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Encrypt a UTF-8 string with the master key. Random 12-byte IV per call. */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(AES_IV_BYTES)));
  const plainBytes = new TextEncoder().encode(plaintext);
  const plainCopy = new Uint8Array(new ArrayBuffer(plainBytes.byteLength));
  plainCopy.set(plainBytes);
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainCopy);
  const ciphertext = new Uint8Array(ciphertextBuf);
  return { iv, ciphertext };
}

/** Decrypt an encrypted blob with the master key. Throws on auth-tag mismatch. */
export async function decrypt(blob: EncryptedBlob, key: CryptoKey): Promise<string> {
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.iv },
    key,
    blob.ciphertext
  );
  return new TextDecoder().decode(plaintextBuf);
}
