// @samjonaidi-ship-it/universal-auth | test/unit/sw/trust-check.test.ts | v1.0.4 | 2026-05-04 | BB
// Lane 2b — coverage for v1.0.1 lookback Phase C5: SW message handlers reject
// clients outside the SW's registration scope (cross-origin or other-scope).
//
// v1.0.4 (Lane 2 finalize): `isTrustedClient` was extracted from src/sw/index.ts
// to src/sw/purge-helpers.ts so this file imports the REAL implementation
// instead of mirroring it. The same predicate logic is now exercised in both
// production (sw/index.ts call site passes `sw.registration.scope`) and tests.

import { describe, it, expect } from 'vitest';
import { isTrustedClient } from '../../../src/sw/purge-helpers.js';

const SCOPE = 'https://app.example.com/';

describe('sw/trust-check — same-scope client predicate (v1.0.1 C5)', () => {
  it('same-origin same-scope client → trusted', () => {
    expect(
      isTrustedClient({ url: 'https://app.example.com/dashboard' }, SCOPE)
    ).toBe(true);
    expect(
      isTrustedClient({ url: 'https://app.example.com/' }, SCOPE)
    ).toBe(true);
  });

  it('same-origin different-scope client → rejected', () => {
    // SW scoped at /app/ should reject clients at /admin/.
    const narrowScope = 'https://app.example.com/app/';
    expect(
      isTrustedClient({ url: 'https://app.example.com/admin/users' }, narrowScope)
    ).toBe(false);
    expect(
      isTrustedClient({ url: 'https://app.example.com/' }, narrowScope)
    ).toBe(false);
  });

  it('cross-origin client → rejected', () => {
    expect(
      isTrustedClient({ url: 'https://evil.example.org/exploit' }, SCOPE)
    ).toBe(false);
    expect(
      isTrustedClient({ url: 'http://app.example.com/dashboard' }, SCOPE)
    ).toBe(false); // protocol mismatch
  });

  it('null source (e.g. message from a closed client) → rejected', () => {
    expect(isTrustedClient(null, SCOPE)).toBe(false);
  });

  it('source without a string url (MessagePort/ServiceWorker) → rejected', () => {
    expect(isTrustedClient({}, SCOPE)).toBe(false);
    expect(
      isTrustedClient({ url: 12345 as unknown as string }, SCOPE)
    ).toBe(false);
    expect(
      isTrustedClient({ url: undefined }, SCOPE)
    ).toBe(false);
  });
});
