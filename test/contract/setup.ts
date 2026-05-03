// @samjonaidi-ship-it/universal-auth | test/contract/setup.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Pact consumer setup — single mock server reused across the test suite.
// Generated pact JSON is consumed by CT BFF CI's verifier (separate repo).
//
// Per spec §11.4 — Pact-style contract tests.

import { afterAll, beforeAll } from 'vitest';
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { resolve } from 'node:path';

export const PACT_DIR = resolve(import.meta.dirname ?? '.', '..', '..', 'pacts');

/**
 * Single shared Pact provider for the whole suite. Each test adds an
 * `interaction` describing one request/response pair the SDK relies on.
 */
export const provider = new PactV3({
  consumer: 'bb-universal-auth-sdk',
  provider: 'bb-ct-bff',
  dir: PACT_DIR,
  logLevel: 'warn',
});

export { MatchersV3 };

beforeAll(() => {
  // Pact V3 doesn't need an explicit start — it spawns the mock per
  // executeTest call. This setup is just for export/import sharing.
});

afterAll(async () => {
  // Pact V3 finalizes pacts at the end of executeTest blocks; nothing to
  // tear down here.
});
