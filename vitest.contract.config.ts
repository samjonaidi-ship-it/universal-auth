// @samjonaidi-ship-it/universal-auth | vitest.contract.config.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Vitest config for Pact contract tests (Block 6 Day 18-19 / A5 gate #11).
//
// Consumer-side: SDK declares the shape of every request it sends to CT BFF
// + the shape of every response it expects. Pact mock server stands in for
// CT BFF and asserts requests match the declared interactions. The generated
// pact JSON file is then consumed by CT BFF CI (verifier-side, not in this repo)
// to confirm the BFF actually serves what the SDK expects.
//
// Pact mock server runs in-process — no docker needed. Fast, deterministic.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/contract/**/*.test.ts'],
    environment: 'node',
    // Single-threaded — the Pact mock server can only host one interaction
    // suite at a time per port; parallel tests would collide.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 15_000,
    hookTimeout: 30_000,
    setupFiles: ['./test/contract/setup.ts'],
    coverage: { enabled: false },
    passWithNoTests: false,
  },
});
