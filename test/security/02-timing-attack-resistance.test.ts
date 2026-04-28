// @bb/universal-auth | test/security/02-timing-attack-resistance.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §11.8 L1141 — timing-attack regression.
//
// Goal: client-side string comparisons of secrets (refresh tokens, idempotency
// keys, anti-CSRF nonces) must not leak length-of-prefix-match via wall-clock.
//
// The strongest server-side defense is in the BFF (it's the only place where
// secrets are actually compared). Client-side, the regression we CAN catch
// is "did anyone add a raw `===` comparison on a token in source?". Doing so
// would expose timing on the SDK side too if any consumer reflects equality
// back via DOM events / mutation observers.
//
// Earlier this file also contained a circular self-test of a locally-defined
// constantTimeEqual helper. That helper is not exported by the SDK — testing
// it tested the test, not the SDK. Removed in look-back fix L2 (2026-04-28);
// if/when the SDK adds a real constant-time compare export, gate it here.

import { describe, it, expect } from 'vitest';

describe('Security #2 — timing-attack regression (§11.8)', () => {
  it('source files do NOT use raw === for refresh/access tokens', async () => {
    // Heuristic: scan token-manager + client for `refreshToken === something`
    // or `accessToken === something` (excluding nullish comparisons, which
    // are fine and don't leak timing on secret content).
    const { readFile } = await import('node:fs/promises');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));

    for (const file of ['../../src/core/token-manager.ts', '../../src/core/client.ts']) {
      const src = await readFile(resolve(here, file), 'utf8');
      const danger = src.match(/(refresh|access)Token\s*===\s*[a-zA-Z_]/g);
      const filtered = danger?.filter(
        (m) => !/(===\s*(null|undefined|''|""|`{2}))/.test(m)
      );
      expect(filtered ?? []).toEqual([]);
    }
  });

  it('source files do NOT log refresh/access token values (defense-in-depth)', async () => {
    // Logging a token (even at debug level) is a timing-adjacent leak — not
    // through CPU but through log files. Catch any console.log / console.debug
    // that interpolates a *Token variable.
    const { readFile } = await import('node:fs/promises');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));

    for (const file of [
      '../../src/core/token-manager.ts',
      '../../src/core/client.ts',
      '../../src/core/storage.ts',
    ]) {
      const src = await readFile(resolve(here, file), 'utf8');
      // Pattern: `console.<anything>(...refreshToken...)` or accessToken.
      // Allow logging the IDB key/length, just not the value.
      const danger = src.match(
        /console\.[a-z]+\([^)]*\b(refresh|access)Token\b[^)]*\)/g
      );
      // Filter false positives: `length` references are fine.
      const filtered = (danger ?? []).filter((m) => !/\.length/.test(m));
      expect(filtered).toEqual([]);
    }
  });
});
