// @bb/universal-auth | test/unit/core/crypto-client.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for crypto-client.ts (was 38%) — happy-dom doesn't ship a
// real Worker; we exercise the fallback path AND simulate worker-mode by
// stubbing globalThis.Worker.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  encryptString,
  decryptString,
  __resetCryptoClientForTests,
  __isWorkerActive,
} from '../../../src/core/crypto-client.js';

describe('crypto-client', () => {
  beforeEach(() => {
    __resetCryptoClientForTests();
  });

  afterEach(() => {
    __resetCryptoClientForTests();
    // Restore Worker if we monkey-patched
    if ((globalThis as { __originalWorker?: unknown }).__originalWorker !== undefined) {
      Object.defineProperty(globalThis, 'Worker', {
        value: (globalThis as { __originalWorker?: unknown }).__originalWorker,
        writable: true,
        configurable: true,
      });
      delete (globalThis as { __originalWorker?: unknown }).__originalWorker;
    }
  });

  describe('fallback path (no Worker)', () => {
    it('encryptString falls back to pure crypto when Worker is undefined', async () => {
      // happy-dom does NOT ship Worker — confirms fallback fires
      Object.defineProperty(globalThis, 'Worker', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const blob = await encryptString('hello world', 'device-id-1');
      expect(blob.iv).toBeInstanceOf(Uint8Array);
      expect(blob.ciphertext).toBeInstanceOf(Uint8Array);
      expect(blob.iv.length).toBeGreaterThan(0);
      expect(blob.ciphertext.length).toBeGreaterThan(0);
      expect(__isWorkerActive()).toBe(false);
    });

    it('decryptString round-trips via fallback', async () => {
      Object.defineProperty(globalThis, 'Worker', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const original = 'super secret refresh token';
      const blob = await encryptString(original, 'device-id-2');
      const decrypted = await decryptString(blob, 'device-id-2');
      expect(decrypted).toBe(original);
    });

    it('decryptString with wrong device input fails', async () => {
      Object.defineProperty(globalThis, 'Worker', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const blob = await encryptString('secret', 'device-A');
      await expect(decryptString(blob, 'device-B')).rejects.toThrow();
    });
  });

  describe('worker construction failure', () => {
    it('worker constructor throwing → falls back gracefully', async () => {
      // Stub Worker so its constructor throws
      const original = (globalThis as { Worker?: unknown }).Worker;
      (globalThis as { __originalWorker?: unknown }).__originalWorker = original;
      class ThrowingWorker {
        constructor() {
          throw new Error('Worker blocked by CSP');
        }
      }
      Object.defineProperty(globalThis, 'Worker', {
        value: ThrowingWorker,
        writable: true,
        configurable: true,
      });

      // encryptString should still succeed via fallback
      const blob = await encryptString('hello', 'device-id');
      expect(blob.iv).toBeInstanceOf(Uint8Array);
      expect(__isWorkerActive()).toBe(false);
    });
  });

  describe('worker happy path', () => {
    it('uses worker when available + responds to postMessage', async () => {
      // Build a Worker shim that handles encrypt/decrypt synchronously by
      // posting back a fake response keyed by the same id.
      const original = (globalThis as { Worker?: unknown }).Worker;
      (globalThis as { __originalWorker?: unknown }).__originalWorker = original;

      class FakeWorker extends EventTarget {
        constructor() {
          super();
        }
        postMessage(msg: { id: string; op: string; args: unknown }): void {
          // Simulate worker work + respond on next tick
          queueMicrotask(() => {
            if (msg.op === 'encrypt') {
              const result = {
                iv: new Uint8Array([1, 2, 3]),
                ciphertext: new Uint8Array([4, 5, 6]),
              };
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: { id: msg.id, result },
                })
              );
            } else if (msg.op === 'decrypt') {
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: { id: msg.id, result: 'decrypted-string' },
                })
              );
            }
          });
        }
        terminate(): void {
          // no-op
        }
      }
      Object.defineProperty(globalThis, 'Worker', {
        value: FakeWorker,
        writable: true,
        configurable: true,
      });

      const blob = await encryptString('plaintext', 'device-id');
      expect(blob.iv).toEqual(new Uint8Array([1, 2, 3]));
      expect(blob.ciphertext).toEqual(new Uint8Array([4, 5, 6]));
      expect(__isWorkerActive()).toBe(true);

      const decrypted = await decryptString(blob, 'device-id');
      expect(decrypted).toBe('decrypted-string');
    });

    it('worker error event rejects pending ops + disables worker', async () => {
      const original = (globalThis as { Worker?: unknown }).Worker;
      (globalThis as { __originalWorker?: unknown }).__originalWorker = original;

      class CrashingWorker extends EventTarget {
        postMessage(): void {
          // Crash the worker after the message is queued
          queueMicrotask(() => {
            this.dispatchEvent(
              new ErrorEvent('error', { message: 'worker exploded' })
            );
          });
        }
        terminate(): void {
          // no-op
        }
      }
      Object.defineProperty(globalThis, 'Worker', {
        value: CrashingWorker,
        writable: true,
        configurable: true,
      });

      // Encrypt should ultimately succeed via fallback after worker crash
      // (or reject — depends on whether the fallback fires for the same op)
      // The contract: handleWorkerError marks workerFailed and rejects
      // pending. Since the SDK only falls back on `worker-unavailable`, a
      // worker-error rejection propagates as the original error.
      await expect(encryptString('p', 'd')).rejects.toThrow(/worker exploded/);
      expect(__isWorkerActive()).toBe(false);
    });
  });

  describe('reset', () => {
    it('reset clears state for next test', () => {
      __resetCryptoClientForTests();
      expect(__isWorkerActive()).toBe(false);
    });
  });
});
