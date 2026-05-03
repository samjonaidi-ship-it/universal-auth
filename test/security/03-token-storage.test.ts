// @samjonaidi-ship-it/universal-auth | test/security/03-token-storage.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §15.1 L1353-L1354 — access tokens MUST NOT touch localStorage,
// sessionStorage, plain cookies (without HttpOnly + SameSite + Secure),
// or unencrypted IndexedDB.
//
// This test is a static + runtime grep. After a sign-in cycle, we
// scan all browser storage layers for token-like strings.

import { describe, it, expect, beforeEach } from 'vitest';
import { setSession, clearSession } from '../../src/core/token-manager.js';

const FAKE_ACCESS = 'TEST-ACCESS-TOKEN-7f3e9b1d-MUST-NOT-LEAK';
const FAKE_REFRESH = 'TEST-REFRESH-TOKEN-8a2c5e4f-MUST-NOT-LEAK';

describe('Security #3 — token storage hygiene (§15.1)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await clearSession().catch(() => undefined);
  });

  it('setSession does NOT write access token to localStorage', async () => {
    await setSession({
      accessToken: FAKE_ACCESS,
      refreshToken: FAKE_REFRESH,
      sessionId: 'test-session',
      expiresAt: Date.now() + 60_000,
      refreshExpiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    });

    // Scan every key/value in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === null) continue;
      const value = localStorage.getItem(key) ?? '';
      expect(value).not.toContain(FAKE_ACCESS);
    }
  });

  it('setSession does NOT write access token to sessionStorage', async () => {
    await setSession({
      accessToken: FAKE_ACCESS,
      refreshToken: FAKE_REFRESH,
      sessionId: 'test-session',
      expiresAt: Date.now() + 60_000,
    });

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key === null) continue;
      const value = sessionStorage.getItem(key) ?? '';
      expect(value).not.toContain(FAKE_ACCESS);
    }
  });

  it('refresh token in IDB is encrypted (not plaintext)', async () => {
    await setSession({
      accessToken: FAKE_ACCESS,
      refreshToken: FAKE_REFRESH,
      sessionId: 'test-session',
      expiresAt: Date.now() + 60_000,
    });

    // Open the SDK's IDB directly and scan every record.
    // The SDK's storage.ts opens DB 'bb-universal-auth' / store 'session_state'.
    const dbReq = indexedDB.open('bb-universal-auth');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result);
      dbReq.onerror = () => reject(dbReq.error);
    });

    // Iterate all object stores
    for (const storeName of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const cursorReq = store.openCursor();
      // eslint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve, reject) => {
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor === null) {
            resolve();
            return;
          }
          const value = cursor.value;
          // Plaintext refresh token should NEVER appear anywhere
          expect(JSON.stringify(value)).not.toContain(FAKE_REFRESH);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    }

    db.close();
  });

  it('clearSession removes all session state', async () => {
    await setSession({
      accessToken: FAKE_ACCESS,
      refreshToken: FAKE_REFRESH,
      sessionId: 'test-session',
      expiresAt: Date.now() + 60_000,
    });
    await clearSession();

    // After clear, neither localStorage nor sessionStorage should hold
    // any session-related key
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      const value = localStorage.getItem(key) ?? '';
      expect(value).not.toContain(FAKE_ACCESS);
      expect(value).not.toContain(FAKE_REFRESH);
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i) ?? '';
      const value = sessionStorage.getItem(key) ?? '';
      expect(value).not.toContain(FAKE_ACCESS);
      expect(value).not.toContain(FAKE_REFRESH);
    }
  });
});
