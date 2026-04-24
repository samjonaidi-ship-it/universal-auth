// @bb/universal-auth | src/core/crypto-worker.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Dedicated Web Worker for AES-256-GCM + PBKDF2 cryptography per §8.2.
// Lives in its own module because:
//   * Main-thread CPU should not block on 100k-iteration PBKDF2
//   * Key material lives inside the worker — the CryptoKey never leaves
//     (except via structured-clone which preserves its non-exportable flag)
//
// A1 gate #3: this module asserts `typeof self.importScripts === 'function'`
// on load — it MUST be loaded in a DedicatedWorker context.
//
// Messaging protocol:
//   main → worker: { id, op: 'encrypt' | 'decrypt' | 'derive', args }
//   worker → main: { id, result } | { id, error: string }

// ── Worker-context assertion (A1 gate #3) ────────────────────────────────

if (typeof (self as unknown as { importScripts?: unknown }).importScripts !== 'function') {
  throw new Error(
    '[@bb/universal-auth] crypto-worker.ts must be loaded as a Worker, not on the main thread.'
  );
}

// ── Constants (duplicated from storage.ts — intentional; worker is a sealed unit) ──

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT = new TextEncoder().encode('bb-universal-auth-v1-salt');
const AES_KEY_LENGTH = 256;
const AES_IV_BYTES = 12;

// ── Internal key cache (per-worker; freed with worker termination) ────────

// CryptoKey is non-extractable after derivation, so caching inside the worker
// is the safest lifetime — never leaks via structured clone boundary.
const keyCache = new Map<string, CryptoKey>();

async function getOrDeriveKey(deviceBoundInput: string): Promise<CryptoKey> {
  const cached = keyCache.get(deviceBoundInput);
  if (cached !== undefined) return cached;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(deviceBoundInput),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
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
  keyCache.set(deviceBoundInput, key);
  return key;
}

// ── Messaging protocol types ──────────────────────────────────────────────

interface EncryptRequest {
  id: string;
  op: 'encrypt';
  args: { plaintext: string; deviceBoundInput: string };
}
interface DecryptRequest {
  id: string;
  op: 'decrypt';
  args: {
    iv: Uint8Array;
    ciphertext: Uint8Array;
    deviceBoundInput: string;
  };
}
interface ClearRequest {
  id: string;
  op: 'clearKeyCache';
  args: Record<string, never>;
}

type WorkerRequest = EncryptRequest | DecryptRequest | ClearRequest;

// ── Message handler ───────────────────────────────────────────────────────

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  void handleRequest(req);
});

async function handleRequest(req: WorkerRequest): Promise<void> {
  try {
    switch (req.op) {
      case 'encrypt': {
        const key = await getOrDeriveKey(req.args.deviceBoundInput);
        const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(AES_IV_BYTES)));
        const plainBytes = new TextEncoder().encode(req.args.plaintext);
        const plainCopy = new Uint8Array(new ArrayBuffer(plainBytes.byteLength));
        plainCopy.set(plainBytes);
        const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainCopy);
        const ciphertext = new Uint8Array(ctBuf);
        self.postMessage({ id: req.id, result: { iv, ciphertext } });
        break;
      }
      case 'decrypt': {
        const key = await getOrDeriveKey(req.args.deviceBoundInput);
        // Defensive copy — transferred bytes may be detached/neutered
        const ivCopy = new Uint8Array(new ArrayBuffer(req.args.iv.byteLength));
        ivCopy.set(req.args.iv);
        const ctCopy = new Uint8Array(new ArrayBuffer(req.args.ciphertext.byteLength));
        ctCopy.set(req.args.ciphertext);
        const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivCopy }, key, ctCopy);
        const plaintext = new TextDecoder().decode(ptBuf);
        self.postMessage({ id: req.id, result: plaintext });
        break;
      }
      case 'clearKeyCache': {
        keyCache.clear();
        self.postMessage({ id: req.id, result: null });
        break;
      }
    }
  } catch (err) {
    self.postMessage({
      id: req.id,
      error: err instanceof Error ? err.message : 'crypto-worker unknown error',
    });
  }
}
