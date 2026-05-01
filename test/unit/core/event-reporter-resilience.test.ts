// @bainbridgebuilders/universal-auth | test/unit/core/event-reporter-resilience.test.ts | v1.0.0-rc.2 | 2026-04-28 | BB
// L12 hardening — emit() must swallow transient IDB errors (InvalidStateError,
// TransactionInactiveError, "transaction is not active") rather than crash
// the calling fire-and-forget chain. Multi-tab DB upgrades, page-unload
// races, and SW termination all surface these errors during legitimate
// state transitions.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  emit,
  isTransientIdbError,
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

describe('event-reporter — isTransientIdbError', () => {
  it('matches InvalidStateError by Error.name', () => {
    const e = new Error('whatever');
    e.name = 'InvalidStateError';
    expect(isTransientIdbError(e)).toBe(true);
  });

  it('matches TransactionInactiveError by Error.name', () => {
    const e = new Error('whatever');
    e.name = 'TransactionInactiveError';
    expect(isTransientIdbError(e)).toBe(true);
  });

  it('matches "transaction is not active" message (case-insensitive)', () => {
    expect(
      isTransientIdbError(new Error('The transaction is not active.'))
    ).toBe(true);
    expect(
      isTransientIdbError(new Error('TRANSACTION IS NOT ACTIVE'))
    ).toBe(true);
  });

  it('matches "database connection is closing" message', () => {
    expect(
      isTransientIdbError(new Error('database connection is closing'))
    ).toBe(true);
  });

  it('does NOT match unrelated errors', () => {
    expect(isTransientIdbError(new Error('Network error'))).toBe(false);
    expect(isTransientIdbError(new Error('AUTH_SESSION_EXPIRED'))).toBe(false);
    expect(isTransientIdbError(new TypeError('Cannot read properties of null'))).toBe(false);
  });

  it('returns false for non-Error inputs', () => {
    expect(isTransientIdbError(null)).toBe(false);
    expect(isTransientIdbError(undefined)).toBe(false);
    expect(isTransientIdbError('InvalidStateError')).toBe(false); // string, not Error
    expect(isTransientIdbError({ name: 'InvalidStateError' })).toBe(false); // plain object
  });

  it('matches an actual IDB DOMException-shaped error', () => {
    if (typeof DOMException !== 'undefined') {
      const e = new DOMException(
        'A request was placed against a transaction which is currently not active.',
        'InvalidStateError'
      );
      expect(isTransientIdbError(e)).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });
});

describe('event-reporter — emit() integration with isTransientIdbError', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.2-test',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emit() drops the event silently when IDB connection is closed mid-write', async () => {
    // Reproduce the original L12 race: emit() fires, then a parallel
    // __resetDbForTests() closes the connection before the IDB write
    // resolves. The previous behavior threw InvalidStateError up the
    // fire-and-forget chain; new behavior swallows it.
    //
    // We can't perfectly reproduce the timing in unit tests (it's a real
    // race), but we CAN run emit + reset back-to-back and assert no
    // throw. Pre-fix this test would intermittently fail; post-fix it
    // never throws.
    const promise = emit('session.heartbeat', { tab: 'A' });
    // Race: reset the DB while emit's IDB write may still be in flight
    void __resetDbForTests();
    // Either the reset wins (transient error → swallowed) or emit wins
    // (success). Both are fine. The fix is: NO throw either way.
    await expect(promise).resolves.toBeUndefined();
  });
});
