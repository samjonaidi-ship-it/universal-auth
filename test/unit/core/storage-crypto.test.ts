// @bb/universal-auth | test/unit/core/storage-crypto.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A1 gate #10 coverage for src/core/storage-crypto.ts

import { describe, it, expect } from 'vitest';
import { deriveKey, encrypt, decrypt } from '../../../src/core/storage-crypto.js';

describe('storage-crypto', () => {
  describe('deriveKey', () => {
    it('produces a non-extractable AES-GCM key', async () => {
      const key = await deriveKey('device-id-abc');
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.extractable).toBe(false);
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
    });

    it('produces the same key for the same input (deterministic)', async () => {
      // Can't compare CryptoKey objects directly — round-trip encrypt/decrypt
      // is the observable behavior.
      const k1 = await deriveKey('stable-input');
      const k2 = await deriveKey('stable-input');
      const blob = await encrypt('hello', k1);
      const plain = await decrypt(blob, k2);
      expect(plain).toBe('hello');
    });

    it('produces different keys for different inputs', async () => {
      const k1 = await deriveKey('input-one');
      const k2 = await deriveKey('input-two');
      const blob = await encrypt('hello', k1);
      await expect(decrypt(blob, k2)).rejects.toThrow();
    });
  });

  describe('encrypt / decrypt round-trip', () => {
    it('round-trips UTF-8 text', async () => {
      const key = await deriveKey('dev-1');
      const blob = await encrypt('the quick brown fox', key);
      const plain = await decrypt(blob, key);
      expect(plain).toBe('the quick brown fox');
    });

    it('round-trips multi-byte UTF-8', async () => {
      const key = await deriveKey('dev-1');
      const s = '日本語 • emoji 🔒 • accents ñáéí';
      const blob = await encrypt(s, key);
      const plain = await decrypt(blob, key);
      expect(plain).toBe(s);
    });

    it('produces a 12-byte IV (AES-GCM mandate)', async () => {
      const key = await deriveKey('dev-1');
      const blob = await encrypt('x', key);
      expect(blob.iv.byteLength).toBe(12);
    });

    it('uses a fresh IV per call (no reuse)', async () => {
      const key = await deriveKey('dev-1');
      const b1 = await encrypt('x', key);
      const b2 = await encrypt('x', key);
      // Identical plaintext + key → different IV → different ciphertext
      expect(Array.from(b1.iv)).not.toEqual(Array.from(b2.iv));
      expect(Array.from(b1.ciphertext)).not.toEqual(Array.from(b2.ciphertext));
    });

    it('fails gracefully on tampered ciphertext (§11.8 L1148)', async () => {
      const key = await deriveKey('dev-1');
      const blob = await encrypt('secret', key);
      // Flip one bit in the ciphertext
      blob.ciphertext[0] = blob.ciphertext[0] ^ 0x01;
      await expect(decrypt(blob, key)).rejects.toThrow();
    });

    it('fails gracefully on tampered IV', async () => {
      const key = await deriveKey('dev-1');
      const blob = await encrypt('secret', key);
      blob.iv[0] = blob.iv[0] ^ 0x01;
      await expect(decrypt(blob, key)).rejects.toThrow();
    });
  });
});
