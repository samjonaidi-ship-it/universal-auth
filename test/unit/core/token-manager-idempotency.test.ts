// @samjonaidi-ship-it/universal-auth | test/unit/core/token-manager-idempotency.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2b — coverage for v1.0.1 lookback B3: /session/refresh Idempotency-Key
// derived from SHA-256(refresh_token).slice(0,16) — same RT yields same key
// (collision-safe across tab races).

import { describe, it, expect } from 'vitest';
import { __deriveRefreshIdempotencyKeyForTests as deriveKey } from '../../../src/core/client.js';

describe('core/client — refresh Idempotency-Key derivation (v1.0.1 B3)', () => {
  it('two refreshes with the SAME refresh_token → same Idempotency-Key', async () => {
    const rt = 'rt-stable-12345';
    const k1 = await deriveKey(rt);
    const k2 = await deriveKey(rt);
    expect(k1).toBe(k2);
  });

  it('two refreshes with DIFFERENT refresh_tokens → different Idempotency-Keys', async () => {
    const k1 = await deriveKey('rt-aaaaa');
    const k2 = await deriveKey('rt-bbbbb');
    expect(k1).not.toBe(k2);
  });

  it('Idempotency-Key length is 16 hex chars', async () => {
    const key = await deriveKey('rt-some-token-value');
    expect(key.length).toBe(16);
    // Each hex char in [0-9a-f]
    expect(/^[0-9a-f]{16}$/.test(key)).toBe(true);
  });
});
