// @bb/universal-auth | test/security/04-idb-tamper.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §11.8 L1141 — IDB tamper test.
//
// Threat: a hostile script with same-origin DOM access modifies the
// encrypted refresh-token blob in IndexedDB. Possible outcomes:
//   1. Decryption fails (AES-GCM auth tag mismatch) → SDK MUST treat as no
//      session and not crash, not fall back to plaintext.
//   2. The hostile script swaps in a different valid blob → SDK MUST not
//      accept it (device-bound key prevents cross-device replay).
//
// We exercise outcome 1 here. Outcome 2 is server-side enforcement.

import { describe, it, expect, beforeEach } from 'vitest';
import { setSession, getAccessToken, clearSession } from '../../src/core/token-manager.js';

const FAKE_ACCESS = 'access-' + Math.random().toString(36).slice(2);
const FAKE_REFRESH = 'refresh-' + Math.random().toString(36).slice(2);

async function corruptIdbValues(): Promise<number> {
  let corrupted = 0;
  const dbReq = indexedDB.open('bb-universal-auth');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    dbReq.onsuccess = () => resolve(dbReq.result);
    dbReq.onerror = () => reject(dbReq.error);
  });
  for (const storeName of Array.from(db.objectStoreNames)) {
    const tx = db.transaction(storeName, 'readwrite');
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
        // Flip first byte of every Uint8Array we find — corrupts AES-GCM tag
        const value = cursor.value;
        if (value && typeof value === 'object') {
          for (const key of Object.keys(value)) {
            const v = (value as Record<string, unknown>)[key];
            if (v instanceof Uint8Array && v.length > 0) {
              v[0] = (v[0] ?? 0) ^ 0xff;
              corrupted++;
            }
            if (v instanceof ArrayBuffer && v.byteLength > 0) {
              const arr = new Uint8Array(v);
              arr[0] = (arr[0] ?? 0) ^ 0xff;
              corrupted++;
            }
          }
          cursor.update(value);
        }
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  db.close();
  return corrupted;
}

describe('Security #4 — IDB tamper (§11.8)', () => {
  beforeEach(async () => {
    await clearSession().catch(() => undefined);
  });

  it('corrupted IDB ciphertext: SDK does not return a session', async () => {
    // Set a real encrypted session
    await setSession({
      accessToken: FAKE_ACCESS,
      refreshToken: FAKE_REFRESH,
      sessionId: 'test-session',
      expiresAt: Date.now() + 60_000,
    });

    // Sanity: access token is accessible immediately (in-memory)
    expect(await getAccessToken()).toBe(FAKE_ACCESS);

    // Hostile script flips bytes in the encrypted blob
    const corrupted = await corruptIdbValues();
    // Must have actually found AND corrupted at least one byte-array.
    // The original `>= 0` (look-back L3 2026-04-28) would falsely pass on
    // an empty IDB. Expect at least 2: AES-GCM IV + ciphertext are stored
    // as separate Uint8Arrays in the encrypted blob.
    expect(corrupted).toBeGreaterThanOrEqual(2);

    // Clear in-memory state (simulate page reload after tampering)
    await clearSession();

    // Attempting to re-load the session should fail gracefully — token is null
    const tokenAfterTamper = await getAccessToken();
    expect(tokenAfterTamper).toBeNull();
  });
});
