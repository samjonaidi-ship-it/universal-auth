// @samjonaidi-ship-it/universal-auth | test/unit/core/crypto-client.test.ts | v1.0.1 | 2026-05-01 | BB
// Coverage for crypto-client.ts. happy-dom doesn't ship a real Worker; we
// exercise the fallback path AND simulate worker-mode by stubbing globalThis.Worker.
//
// v1.0.1 (B2): API now takes a CryptoKey directly (no deviceBoundInput string).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptString,
  decryptString,
  __resetCryptoClientForTests,
  __isWorkerActive,
} from '../../../src/core/crypto-client.js';
import { generateMasterKey } from '../../../src/core/storage-crypto.js';

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
      Object.defineProperty(globalThis, 'Worker', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const key = await generateMasterKey();
      const blob = await encryptString('hello world', key);
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
      const key = await generateMasterKey();
      const original = 'super secret refresh token';
      const blob = await encryptString(original, key);
      const decrypted = await decryptString(blob, key);
      expect(decrypted).toBe(original);
    });

    it('decryptString with wrong key fails', async () => {
      Object.defineProperty(globalThis, 'Worker', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const keyA = await generateMasterKey();
      const keyB = await generateMasterKey();
      const blob = await encryptString('secret', keyA);
      await expect(decryptString(blob, keyB)).rejects.toThrow();
    });
  });

  describe('worker construction failure', () => {
    it('worker constructor throwing → falls back gracefully', async () => {
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

      const key = await generateMasterKey();
      const blob = await encryptString('hello', key);
      expect(blob.iv).toBeInstanceOf(Uint8Array);
      expect(__isWorkerActive()).toBe(false);
    });
  });

  describe('worker happy path', () => {
    it('uses worker when available + responds to postMessage', async () => {
      const original = (globalThis as { Worker?: unknown }).Worker;
      (globalThis as { __originalWorker?: unknown }).__originalWorker = original;

      class FakeWorker extends EventTarget {
        constructor() {
          super();
        }
        postMessage(msg: { id: string; op: string; args: unknown }): void {
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

      const key = await generateMasterKey();
      const blob = await encryptString('plaintext', key);
      expect(blob.iv).toEqual(new Uint8Array([1, 2, 3]));
      expect(blob.ciphertext).toEqual(new Uint8Array([4, 5, 6]));
      expect(__isWorkerActive()).toBe(true);

      const decrypted = await decryptString(blob, key);
      expect(decrypted).toBe('decrypted-string');
    });

    it('worker error event rejects pending ops + disables worker', async () => {
      const original = (globalThis as { Worker?: unknown }).Worker;
      (globalThis as { __originalWorker?: unknown }).__originalWorker = original;

      class CrashingWorker extends EventTarget {
        postMessage(): void {
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

      const key = await generateMasterKey();
      await expect(encryptString('p', key)).rejects.toThrow(/worker exploded/);
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
