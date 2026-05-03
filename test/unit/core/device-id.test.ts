// @samjonaidi-ship-it/universal-auth | test/unit/core/device-id.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A1 gate #10 coverage for src/core/device-id.ts

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
      // First 32 hex chars of SHA-256('hello') in lowercase
      const id = await computeDeviceIdFromUA('hello');
      expect(id.length).toBe(32);
      // Known vector: SHA-256('hello') =
      //   2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
      expect(id).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e');
    });
  });

  describe('getOrCreateDeviceId', () => {
    it('returns a stable id across repeated calls in the same session', async () => {
      const a = await getOrCreateDeviceId();
      const b = await getOrCreateDeviceId();
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{32}$/);
    });

    it('reads from localStorage cache when UA matches', async () => {
      if (typeof localStorage === 'undefined') return; // SSR env — skip

      // Prime the cache
      const first = await getOrCreateDeviceId();
      clearDeviceIdCache(); // clears in-memory but we'll re-seed localStorage below

      // Manually place a matching row
      localStorage.setItem(
        'bb-ua-device-id',
        JSON.stringify({ ua: navigator.userAgent, id: first })
      );

      const subtleSpy = vi.spyOn(crypto.subtle, 'digest');
      const second = await getOrCreateDeviceId();
      expect(second).toBe(first);
      // LS hit should avoid recomputing SHA-256
      expect(subtleSpy).not.toHaveBeenCalled();
      subtleSpy.mockRestore();
    });

    it('invalidates localStorage cache when UA changes', async () => {
      if (typeof localStorage === 'undefined') return;

      localStorage.setItem(
        'bb-ua-device-id',
        JSON.stringify({ ua: 'old-ua', id: 'deadbeef'.repeat(4) })
      );

      const id = await getOrCreateDeviceId();
      // Computed from current jsdom UA, not the stale one
      expect(id).not.toBe('deadbeef'.repeat(4));
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it('rejects localStorage cache entries with malformed id', async () => {
      if (typeof localStorage === 'undefined') return;

      localStorage.setItem(
        'bb-ua-device-id',
        JSON.stringify({ ua: navigator.userAgent, id: 'not-hex' })
      );

      const id = await getOrCreateDeviceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(id).not.toBe('not-hex');
    });
  });

  describe('clearDeviceIdCache', () => {
    it('forces recomputation on next call', async () => {
      const first = await getOrCreateDeviceId();
      clearDeviceIdCache();
      if (typeof localStorage !== 'undefined') {
        expect(localStorage.getItem('bb-ua-device-id')).toBeNull();
      }
      const second = await getOrCreateDeviceId();
      // Recomputed but deterministic, so value equals
      expect(second).toBe(first);
    });
  });
});
