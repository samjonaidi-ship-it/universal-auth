// @bb/universal-auth | src/core/crypto-client.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Main-thread proxy to crypto-worker.ts. Per §8.2 L826, AES-GCM + PBKDF2 must
// run off-main-thread. This module:
//
//   * Lazily spawns the Worker on first crypto op
//   * Routes encrypt/decrypt/deriveKey through postMessage
//   * Falls back to in-line pure crypto (from storage.ts) if Worker API is
//     unavailable — covers Node/SSR/test environments where DedicatedWorker
//     isn't present
//
// A1 gate #3: the Worker path is the production code path. The fallback is
// documented and exercised in tests when Worker isn't available.

import { nanoid } from 'nanoid';
import { deriveKey, encrypt as pureEncrypt, decrypt as pureDecrypt, type EncryptedBlob } from './storage-crypto.js';

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

// ── Public API (mirrors storage-crypto.ts but routes through worker) ─────

export async function encryptString(
  plaintext: string,
  deviceBoundInput: string
): Promise<EncryptedBlob> {
  try {
    return await callWorker<EncryptedBlob>('encrypt', { plaintext, deviceBoundInput });
  } catch (err) {
    if (err instanceof Error && err.message === 'worker-unavailable') {
      // Fallback path — test / SSR / ancient-browser
      const key = await deriveKey(deviceBoundInput);
      return pureEncrypt(plaintext, key);
    }
    throw err;
  }
}

export async function decryptString(
  blob: EncryptedBlob,
  deviceBoundInput: string
): Promise<string> {
  try {
    return await callWorker<string>('decrypt', { ...blob, deviceBoundInput });
  } catch (err) {
    if (err instanceof Error && err.message === 'worker-unavailable') {
      const key = await deriveKey(deviceBoundInput);
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
