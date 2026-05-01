// @bainbridgebuilders/universal-auth | src/core/crypto-client.ts | v1.0.1 | 2026-05-01 | BB
// Main-thread proxy to crypto-worker.ts. Per §8.2, AES-GCM must run off the
// main thread. This module:
//
//   * Lazily spawns the Worker on first crypto op
//   * Routes encrypt/decrypt through postMessage (structured-clone of the
//     CryptoKey handle preserves its non-extractable flag)
//   * Falls back to in-line pure crypto if the Worker API is unavailable —
//     covers Node/SSR/test environments where DedicatedWorker isn't present
//
// v1.0.1 (B2): the public API now takes a `CryptoKey` directly (the master
// key generated + persisted in IndexedDB via storage.getOrCreateMasterKey()).
// The previous `deviceBoundInput: string` argument is gone.

import { nanoid } from 'nanoid';
import { encrypt as pureEncrypt, decrypt as pureDecrypt, type EncryptedBlob } from './storage-crypto.js';

// ── Worker lifecycle ──────────────────────────────────────────────────────

interface PendingOp {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

let worker: Worker | null = null;
let workerFailed = false;
const pending = new Map<string, PendingOp>();

function shouldUseWorker(): boolean {
  if (workerFailed) return false;
  if (typeof Worker === 'undefined') return false;
  // import.meta.url is always defined in ESM; belt-and-suspenders for older bundlers
  if (typeof (import.meta as { url?: string }).url !== 'string') return false;
  return true;
}

function getWorker(): Worker | null {
  if (!shouldUseWorker()) return null;
  if (worker !== null) return worker;
  try {
    // esbuild preserves `new URL(..., import.meta.url)` + `new Worker(url)`
    // pattern when an entry point is registered for the target file.
    // Our build.ts includes `core/crypto-worker` as an entry.
    worker = new Worker(new URL('./crypto-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function handleWorkerMessage(
  event: MessageEvent<{ id: string; result?: unknown; error?: string }>
): void {
  const { id, result, error } = event.data;
  const entry = pending.get(id);
  if (entry === undefined) return;
  pending.delete(id);
  if (error !== undefined) entry.reject(new Error(error));
  else entry.resolve(result);
}

function handleWorkerError(event: ErrorEvent): void {
  // Worker crashed — fail all pending ops + disable worker path permanently
  workerFailed = true;
  for (const { reject } of pending.values()) {
    reject(new Error(`[crypto-worker] unrecoverable worker error: ${event.message}`));
  }
  pending.clear();
  if (worker !== null) {
    try {
      worker.terminate();
    } catch {
      // non-fatal
    }
    worker = null;
  }
}

function callWorker<T>(op: string, args: unknown): Promise<T> {
  const w = getWorker();
  if (w === null) throw new Error('worker-unavailable');
  return new Promise<T>((resolve, reject) => {
    const id = nanoid();
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    w.postMessage({ id, op, args });
  });
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Encrypt a UTF-8 string under the supplied AES-GCM master key. The CryptoKey
 * is structured-cloned into the Worker; its raw bytes never appear on the
 * main thread or the wire.
 */
export async function encryptString(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedBlob> {
  try {
    return await callWorker<EncryptedBlob>('encrypt', { plaintext, key });
  } catch (err) {
    if (err instanceof Error && err.message === 'worker-unavailable') {
      // Fallback path — test / SSR / ancient-browser
      return pureEncrypt(plaintext, key);
    }
    throw err;
  }
}

export async function decryptString(
  blob: EncryptedBlob,
  key: CryptoKey
): Promise<string> {
  try {
    return await callWorker<string>('decrypt', { ...blob, key });
  } catch (err) {
    if (err instanceof Error && err.message === 'worker-unavailable') {
      return pureDecrypt(blob, key);
    }
    throw err;
  }
}

// ── Test-only helpers ─────────────────────────────────────────────────────

export function __resetCryptoClientForTests(): void {
  if (worker !== null) {
    try {
      worker.terminate();
    } catch {
      // non-fatal
    }
  }
  worker = null;
  workerFailed = false;
  pending.clear();
}

export function __isWorkerActive(): boolean {
  return worker !== null && !workerFailed;
}
