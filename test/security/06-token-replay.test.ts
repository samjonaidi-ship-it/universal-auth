// @bb/universal-auth | test/security/06-token-replay.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §11.8 L1141 — token replay regression.
//
// Threat: an attacker captures a refresh token (e.g., via a browser extension
// or compromised endpoint) and replays it from a different device.
//
// The SDK side of the defense:
//   * Refresh tokens are encrypted at rest with a device-bound AES-GCM key
//     (see storage-crypto.ts) — moving the IDB row to another device makes
//     it undecryptable.
//   * SDK does NOT include the refresh token in any place a stealing
//     extension can read trivially (no localStorage, no sessionStorage).
//
// We assert these client-side invariants here. Full replay protection
// (server-side rotation, family-wide revocation on reuse) is BFF business.

import { describe, it, expect, beforeEach } from 'vitest';
import { setSession, clearSession } from '../../src/core/token-manager.js';

describe('Security #6 — token replay defense (§11.8)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await clearSession().catch(() => undefined);
  });

  it('refresh token never appears in any non-IDB storage layer', async () => {
    const refresh = 'REFRESH-TOKEN-7c2a-MUST-NOT-LEAK';
    await setSession({
      accessToken: 'a',
      refreshToken: refresh,
      sessionId: 's',
      expiresAt: Date.now() + 60_000,
    });

    // localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const v = localStorage.getItem(localStorage.key(i) ?? '') ?? '';
      expect(v).not.toContain(refresh);
    }
    // sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const v = sessionStorage.getItem(sessionStorage.key(i) ?? '') ?? '';
      expect(v).not.toContain(refresh);
    }
    // window properties (no global stash)
    for (const k of Object.keys(globalThis)) {
      const v = (globalThis as Record<string, unknown>)[k];
      if (typeof v === 'string') {
        expect(v).not.toContain(refresh);
      }
    }
  });

  it('rotation: setSession with NEW tokens replaces the old encrypted blob (not stored side-by-side)', async () => {
    const oldRefresh = 'OLD-REFRESH-TOKEN';
    const newRefresh = 'NEW-REFRESH-TOKEN';

    await setSession({
      accessToken: 'a1',
      refreshToken: oldRefresh,
      sessionId: 's',
      expiresAt: Date.now() + 60_000,
    });

    // Snapshot all blobs from IDB BEFORE rotation
    const before = await snapshotIdb();
    expect(before.totalRecords).toBeGreaterThan(0);

    await setSession({
      accessToken: 'a2',
      refreshToken: newRefresh,
      sessionId: 's',
      expiresAt: Date.now() + 60_000,
    });

    // After rotation, snapshot again
    const after = await snapshotIdb();

    // Real rotation invariant: total record count is unchanged. If old + new
    // were stored side-by-side that would DOUBLE recordCount — that's the
    // failure mode we're guarding against.
    expect(after.totalRecords).toBe(before.totalRecords);

    // Stronger assertion: the encrypted bytes have actually changed.
    // Even if rotation kept "1 record" by happenstance (same key), a
    // re-encryption with a new IV must produce different ciphertext bytes.
    const beforeBytes = before.allUint8Bytes;
    const afterBytes = after.allUint8Bytes;
    expect(afterBytes).not.toBe(beforeBytes); // different reference
    expect(bytesEqual(beforeBytes, afterBytes)).toBe(false);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────

interface IdbSnapshot {
  totalRecords: number;
  /** Concatenated bytes of every Uint8Array found, in iteration order. */
  allUint8Bytes: Uint8Array;
}

async function snapshotIdb(): Promise<IdbSnapshot> {
  const dbReq = indexedDB.open('bb-universal-auth');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    dbReq.onsuccess = () => resolve(dbReq.result);
    dbReq.onerror = () => reject(dbReq.error);
  });

  let totalRecords = 0;
  const byteChunks: Uint8Array[] = [];

  for (const storeName of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor === null) {
          resolve();
          return;
        }
        totalRecords++;
        const value = cursor.value;
        if (value !== null && typeof value === 'object') {
          for (const v of Object.values(value as Record<string, unknown>)) {
            if (v instanceof Uint8Array) byteChunks.push(new Uint8Array(v));
          }
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }

  db.close();

  const total = byteChunks.reduce((s, b) => s + b.length, 0);
  const allBytes = new Uint8Array(total);
  let offset = 0;
  for (const c of byteChunks) {
    allBytes.set(c, offset);
    offset += c.length;
  }
  return { totalRecords, allUint8Bytes: allBytes };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
