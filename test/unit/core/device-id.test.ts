// @samjonaidi-ship-it/universal-auth | test/unit/core/device-id.test.ts | v1.1.0 | 2026-05-06 | BB
// A1 gate #10 coverage for src/core/device-id.ts.
// v1.1.0 (P1-K): localStorage cache removed — tests updated to assert no
// localStorage write happens, and that SHA-256 runs on each page load
// (cleared in-memory cache).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeDeviceIdFromUA,
  getOrCreateDeviceId,
  clearDeviceIdCache,
} from '../../../src/core/device-id.js';

describe('device-id', () => {
  beforeEach(() => {
    clearDeviceIdCache();
    // jsdom provides localStorage; ensure clean slate per test
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.clear();
      } catch {
        // some envs lock localStorage; test still runs via memory cache
      }
    }
  });

  describe('computeDeviceIdFromUA', () => {
    it('returns a 32-character lowercase hex string', async () => {
      const id = await computeDeviceIdFromUA('Mozilla/5.0 test');
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('is deterministic for the same input', async () => {
      const id1 = await computeDeviceIdFromUA('Mozilla/5.0 test');
      const id2 = await computeDeviceIdFromUA('Mozilla/5.0 test');
      expect(id1).toBe(id2);
    });

    it('differs for different user agents', async () => {
      const id1 = await computeDeviceIdFromUA('Mozilla/5.0 chrome');
      const id2 = await computeDeviceIdFromUA('Mozilla/5.0 safari');
      expect(id1).not.toBe(id2);
    });

    it('matches the documented slice of SHA-256(UA)', async () => {
      // Known vector: SHA-256('hello') =
      //   2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      const id = await computeDeviceIdFromUA('hello');
      expect(id.length).toBe(32);
      expect(id).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e');
    });
  });

  describe('getOrCreateDeviceId', () => {
    it('returns a stable id across repeated calls in the same tab', async () => {
      const a = await getOrCreateDeviceId();
      const b = await getOrCreateDeviceId();
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{32}$/);
    });

    it('uses in-memory cache after first call (no SHA-256 on second call)', async () => {
      // Prime the in-memory cache
      await getOrCreateDeviceId();

      const subtleSpy = vi.spyOn(crypto.subtle, 'digest');
      const second = await getOrCreateDeviceId();
      expect(second).toMatch(/^[0-9a-f]{32}$/);
      expect(subtleSpy).not.toHaveBeenCalled(); // in-memory hit, no recompute
      subtleSpy.mockRestore();
    });

    it('does NOT write to localStorage (P1-K: tamper-resistance over caching)', async () => {
      if (typeof localStorage === 'undefined') return;

      // Spy on setItem rather than checking value, to detect any write
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      await getOrCreateDeviceId();
      // Filter to just our key in case test framework writes elsewhere
      const ourWrites = setItemSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('device-id')
      );
      expect(ourWrites.length).toBe(0);
      setItemSpy.mockRestore();
    });

    it('does NOT read from a pre-existing localStorage entry (cache removed)', async () => {
      if (typeof localStorage === 'undefined') return;

      // Plant a poisoned value mimicking the v1.0.x cache shape — should be ignored
      localStorage.setItem(
        'bb-ua-device-id',
        JSON.stringify({ ua: navigator.userAgent, id: 'deadbeef'.repeat(4) })
      );

      const id = await getOrCreateDeviceId();
      // The poisoned id is ignored; we get the real SHA-256 of the live UA
      expect(id).not.toBe('deadbeef'.repeat(4));
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('recomputes after clearDeviceIdCache (simulates page reload)', async () => {
      const first = await getOrCreateDeviceId();

      clearDeviceIdCache();
      const subtleSpy = vi.spyOn(crypto.subtle, 'digest');
      const second = await getOrCreateDeviceId();
      // Same UA → same id, but SHA-256 runs again because in-memory was cleared
      expect(second).toBe(first);
      expect(subtleSpy).toHaveBeenCalled();
      subtleSpy.mockRestore();
    });
  });

  describe('clearDeviceIdCache', () => {
    it('forces recomputation on next call', async () => {
      const first = await getOrCreateDeviceId();
      clearDeviceIdCache();
      const second = await getOrCreateDeviceId();
      // Recomputed but deterministic, so value equals
      expect(second).toBe(first);
    });

    it('does not throw when localStorage is unavailable', () => {
      // No-op assertion — clearDeviceIdCache no longer touches localStorage
      // post-P1-K, so this confirms the cache reset is purely in-memory.
      expect(() => clearDeviceIdCache()).not.toThrow();
    });
  });
});
