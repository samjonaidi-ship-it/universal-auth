// @bb/universal-auth | src/core/storage-crypto.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Pure crypto primitives (PBKDF2 + AES-256-GCM) used by both:
//   * crypto-worker.ts — primary path, off-main-thread per §8.2
//   * crypto-client.ts — main-thread fallback for test/SSR environments
//
// Keep this module free of DOM / IDB / network — it must be importable from
// any JS realm (main thread, DedicatedWorker, ServiceWorker, Node test harness).

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT = new TextEncoder().encode('bb-universal-auth-v1-salt');
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
 * Derive a 256-bit AES-GCM key from a device-bound string input via PBKDF2-SHA256.
 * 100k iterations (OWASP 2023). Key is non-extractable.
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

/** Encrypt a UTF-8 string with a derived key. Random 12-byte IV per call. */
export async function encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(AES_IV_BYTES)));
  const plainBytes = new TextEncoder().encode(plaintext);
  const plainCopy = new Uint8Array(new ArrayBuffer(plainBytes.byteLength));
  plainCopy.set(plainBytes);
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainCopy);
  const ciphertext = new Uint8Array(ciphertextBuf);
  return { iv, ciphertext };
}

/** Decrypt an encrypted blob with the same derived key. Throws on auth-tag mismatch. */
export async function decrypt(blob: EncryptedBlob, key: CryptoKey): Promise<string> {
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: blob.iv },
    key,
    blob.ciphertext
  );
  return new TextDecoder().decode(plaintextBuf);
}
