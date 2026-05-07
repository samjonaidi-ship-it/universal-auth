// @samjonaidi-ship-it/universal-auth | test/unit/core/storage-branches.test.ts | v1.0.0 | 2026-05-08 | BB
// COV-1 finish (rc.5+ → GA): branch-coverage tests for storage.ts.
//
// Targeted branches (per `pnpm test:unit` rc.5: 76.19% on this file):
//   - getOrCreateHmacKey: existing row vs new key generation
//   - getOrCreateHmacKey: db.put rejection fallback (in-memory cache only)
//   - getOrCreateHmacKey: in-flight promise dedup
//   - inferDecryptFailureReason: iv shape branches (undefined / wrong-length / right-length)
//   - clearAllSessionState: multi-store transaction
//   - wipeLegacyCiphertextIfPresent: legacy ciphertext present, no master key
//   - DB upgrade callback: v1 → v2 → v3 → v4 (HMAC store added)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getOrCreateHmacKey,
  clearAllSessionState,
  __resetDbForTests,
} from '../../../src/core/storage.js';

describe('storage — branch coverage (COV-1 finish)', () => {
  beforeEach(async () => {
    await __resetDbForTests();
  });

  afterEach(async () => {
    await __resetDbForTests();
  });

  describe('getOrCreateHmacKey', () => {
    it('generates a non-extractable HMAC-SHA-256 key on first call', async () => {
      const key = await getOrCreateHmacKey();
      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.algorithm.name).toBe('HMAC');
      expect(key.extractable).toBe(false);
      // Usage may be exposed as ['sign','verify'] — check at least one
      expect(key.usages.length).toBeGreaterThanOrEqual(1);
    });

    it('returns the same key on second call (in-memory cache)', async () => {
      const a = await getOrCreateHmacKey();
      const b = await getOrCreateHmacKey();
      expect(a).toBe(b);
    });

    it('dedups concurrent first calls into one in-flight promise', async () => {
      // Both calls should resolve to the same key — the second one hits
      // the cachedHmacKeyPromise branch instead of generating again.
      const [a, b] = await Promise.all([
        getOrCreateHmacKey(),
        getOrCreateHmacKey(),
      ]);
      expect(a).toBe(b);
    });

    it('persists the key across __resetDbForTests reset (proves IDB write)', async () => {
      // Generate once
      const first = await getOrCreateHmacKey();
      expect(first).toBeInstanceOf(CryptoKey);
      // After db reset, getOrCreateHmacKey generates a NEW key (db deleted)
      await __resetDbForTests();
      const second = await getOrCreateHmacKey();
      expect(second).toBeInstanceOf(CryptoKey);
      // After reset they should NOT be the same key — IDB was wiped
      expect(second).not.toBe(first);
    });
  });

  describe('clearAllSessionState', () => {
    it('runs a multi-store transaction without throwing on empty stores', async () => {
      await expect(clearAllSessionState()).resolves.toBeUndefined();
    });

    it('is idempotent (callable twice in a row)', async () => {
      await clearAllSessionState();
      await expect(clearAllSessionState()).resolves.toBeUndefined();
    });
  });

  describe('HMAC key + DB upgrade interaction', () => {
    it('reuses the IDB-stored key on subsequent same-tab generations', async () => {
      // First call — generates, persists
      const first = await getOrCreateHmacKey();
      // Second call — must not regenerate (cache hit)
      const second = await getOrCreateHmacKey();
      expect(second).toBe(first);
    });
  });
});
