// @samjonaidi-ship-it/universal-auth | test/unit/core/dpop/keypair.test.ts | v0.1.0 | 2026-05-06 | BB
// Keypair lifecycle — generate/load stability, delete, corruption fallback.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateAndStoreKeypair,
  loadKeypair,
  getOrCreateKeypair,
  deleteKeypair,
} from '../../../../src/core/dpop/keypair.js';
import { __resetDbForTests, getSharedDb, STORE_DPOP_KEYPAIR } from '../../../../src/core/storage.js';

describe('dpop/keypair', () => {
  beforeEach(async () => {
    await __resetDbForTests();
  });

  it('generateAndStoreKeypair returns an ES256 P-256 keypair with non-extractable private key', async () => {
    const pair = await generateAndStoreKeypair();
    expect(pair.publicKey).toBeInstanceOf(CryptoKey);
    expect(pair.privateKey).toBeInstanceOf(CryptoKey);
    expect(pair.privateKey.extractable).toBe(false);
    expect(pair.publicKey.algorithm.name).toBe('ECDSA');
    expect((pair.publicKey.algorithm as EcKeyAlgorithm).namedCurve).toBe('P-256');
    expect(pair.privateKey.usages).toContain('sign');
    expect(pair.publicKey.usages).toContain('verify');
  });

  it('loadKeypair returns null when no row exists', async () => {
    const result = await loadKeypair();
    expect(result).toBeNull();
  });

  it('generate then load returns the same keypair handles', async () => {
    const generated = await generateAndStoreKeypair();
    const loaded = await loadKeypair();
    expect(loaded).not.toBeNull();
    // Structured-cloned handle is a different JS object but the same key —
    // sign + verify across the two views must agree.
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      generated.privateKey,
      new TextEncoder().encode('hello'),
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      loaded!.publicKey,
      sig,
      new TextEncoder().encode('hello'),
    );
    expect(ok).toBe(true);
  });

  it('getOrCreateKeypair generates on first call and loads on subsequent calls', async () => {
    const first = await getOrCreateKeypair();
    const second = await getOrCreateKeypair();
    // Same persisted material — verify by cross-signing.
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      first.privateKey,
      new TextEncoder().encode('round-trip'),
    );
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      second.publicKey,
      sig,
      new TextEncoder().encode('round-trip'),
    );
    expect(ok).toBe(true);
  });

  it('deleteKeypair clears the row — next load returns null', async () => {
    await generateAndStoreKeypair();
    await deleteKeypair();
    const after = await loadKeypair();
    expect(after).toBeNull();
  });

  it('corruption recovery: a non-CryptoKey row is treated as missing', async () => {
    const db = await getSharedDb();
    await db.put(STORE_DPOP_KEYPAIR, {
      key: 'current',
      publicKey: 'not-a-cryptokey',
      privateKey: 'not-a-cryptokey',
      createdAt: Date.now(),
    });
    const loaded = await loadKeypair();
    expect(loaded).toBeNull();

    // getOrCreateKeypair should recover by generating fresh.
    const fresh = await getOrCreateKeypair();
    expect(fresh.privateKey).toBeInstanceOf(CryptoKey);
  });
});
