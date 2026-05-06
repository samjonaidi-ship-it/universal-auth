// @samjonaidi-ship-it/universal-auth | test/unit/core/dpop/nonce-cache.test.ts | v0.1.0 | 2026-05-06 | BB
// Single-slot per-endpoint nonce cache.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordNonce,
  consumeNonce,
  __resetNonceCacheForTests,
} from '../../../../src/core/dpop/nonce-cache.js';

const ENDPOINT = '/auth/v1/session/refresh';
const OTHER = '/auth/v1/session/revoke';

describe('dpop/nonce-cache', () => {
  beforeEach(() => {
    __resetNonceCacheForTests();
  });

  it('returns null when no nonce has been recorded', () => {
    expect(consumeNonce(ENDPOINT)).toBeNull();
  });

  it('records and consumes a nonce once', () => {
    recordNonce(ENDPOINT, 'srv-nonce-1');
    expect(consumeNonce(ENDPOINT)).toBe('srv-nonce-1');
    expect(consumeNonce(ENDPOINT)).toBeNull();
  });

  it('overwrites prior nonce — only the most recent is kept', () => {
    recordNonce(ENDPOINT, 'old');
    recordNonce(ENDPOINT, 'new');
    expect(consumeNonce(ENDPOINT)).toBe('new');
    expect(consumeNonce(ENDPOINT)).toBeNull();
  });

  it('endpoints have independent slots', () => {
    recordNonce(ENDPOINT, 'refresh-nonce');
    recordNonce(OTHER, 'revoke-nonce');
    expect(consumeNonce(OTHER)).toBe('revoke-nonce');
    expect(consumeNonce(ENDPOINT)).toBe('refresh-nonce');
    expect(consumeNonce(OTHER)).toBeNull();
    expect(consumeNonce(ENDPOINT)).toBeNull();
  });
});
