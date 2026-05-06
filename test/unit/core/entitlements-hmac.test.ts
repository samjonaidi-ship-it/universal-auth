// @samjonaidi-ship-it/universal-auth | test/unit/core/entitlements-hmac.test.ts | v1.0.0 | 2026-05-06 | BB
// P1-J coverage — HMAC tag over the localStorage-cached entitlements blob.
//
// Three behaviors under test:
//   1. New-format wire writes carry { data, sig } envelope.
//   2. Legacy bare-CacheShape blobs are accepted ONCE on first load and
//      rewritten with a signature on next save (graceful migration).
//   3. Tampered envelopes are detected (async verify) and the cache cleared.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hasFeature,
  refreshEntitlements,
  __resetEntitlementsForTests,
  onEntitlementsChange,
} from '../../../src/core/entitlements.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';

const STORAGE_KEY = 'bb-universal-auth:entitlements';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('entitlements — HMAC tag (P1-J)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetEntitlementsForTests();
    __resetClientForTests();
    await __resetDbForTests();
    if (typeof localStorage !== 'undefined') localStorage.clear();
    configureClient({
      apiBaseUrl: 'https://api.buildwithbainbridge.com',
      appId: 'bb_express',
      sdkVersion: '1.2.0',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp(200, {
        identity: { identity_id: 'id-1' },
        aggregate: { features: ['feat.a', 'feat.b'], app_access: ['app1'] },
      }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('writes a signed envelope { data, sig } to localStorage on refresh', async () => {
    await refreshEntitlements();
    if (typeof localStorage === 'undefined') return; // SSR — skip
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { data?: unknown; sig?: unknown };
    expect(parsed.data).toBeDefined();
    expect(typeof parsed.sig).toBe('string');
    expect(parsed.sig).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
  });

  it('accepts a legacy bare-CacheShape blob ONCE on first load (graceful migration)', () => {
    if (typeof localStorage === 'undefined') return;
    // Plant a v1.0/v1.1 format blob (no envelope, no sig)
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        features: ['legacy.feat'],
        app_access: ['legacy.app'],
        fetched_at: Date.now(),
        identity_id: 'id-legacy',
      }),
    );
    // Sync read should accept it
    expect(hasFeature('legacy.feat')).toBe(true);
  });

  it('rewrites legacy unsigned blob with signed envelope on next save', async () => {
    if (typeof localStorage === 'undefined') return;
    // Plant legacy format
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        features: ['x'],
        app_access: ['y'],
        fetched_at: Date.now(),
        identity_id: 'id-old',
      }),
    );
    // Trigger a refresh which calls saveToDisk
    await refreshEntitlements();
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw!) as { data?: unknown; sig?: unknown };
    expect(parsed.data).toBeDefined();
    expect(typeof parsed.sig).toBe('string');
  });

  it('detects tampered signed envelope and clears cache via async verify', async () => {
    if (typeof localStorage === 'undefined') return;

    // Step 1: write a real signed envelope.
    await refreshEntitlements();
    const original = localStorage.getItem(STORAGE_KEY)!;
    const parsed = JSON.parse(original) as { data: { features: string[] }; sig: string };

    // Step 2: tamper with the data — bump features to include an admin flag
    // the user shouldn't have. Sig stays the same → MAC must fail.
    parsed.data.features = ['admin.unlocked'];
    const tampered = JSON.stringify(parsed);

    // Step 3: simulate page reload — clear in-memory cache only (not LS),
    // then plant the tampered blob back into LS (since reset wipes LS too).
    __resetEntitlementsForTests();
    localStorage.setItem(STORAGE_KEY, tampered);

    // Sync read returns the tampered data optimistically (verify is async).
    expect(hasFeature('admin.unlocked')).toBe(true);

    // Wait for the async verifier to detect the tamper and clear the cache.
    // The clear() path calls notifyEntitlementsChange, which the onChange
    // listener catches.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for tamper detection')), 2000);
      const unsub = onEntitlementsChange(() => {
        clearTimeout(timer);
        unsub();
        resolve();
      });
    });

    // After tamper-detection clears the cache, the bogus feature is gone.
    expect(hasFeature('admin.unlocked')).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps cache when signature matches (happy path)', async () => {
    if (typeof localStorage === 'undefined') return;
    await refreshEntitlements();
    const stored = localStorage.getItem(STORAGE_KEY)!;

    // Simulate page reload — clear in-memory state, re-plant the LS blob
    // (reset wipes LS as part of test isolation).
    __resetEntitlementsForTests();
    localStorage.setItem(STORAGE_KEY, stored);

    // Sync read returns cached data
    expect(hasFeature('feat.a')).toBe(true);

    // Give the async verifier a moment — should NOT clear (sig matches).
    await new Promise((r) => setTimeout(r, 100));

    // Cache still present
    expect(hasFeature('feat.a')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
