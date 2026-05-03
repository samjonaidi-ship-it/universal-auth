// @samjonaidi-ship-it/universal-auth | vitest.integration.config.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Vitest config for integration tests (Block 6 Day 18-19 / A5 gate #2).
//
// Runs against a docker-compose stack (test/integration/docker-compose.test.yml)
// OR a remote BFF if INTEGRATION_BASE_URL env var is set. Default: localhost
// services (ct-bff:3300, postgres:5432, twilio-mock:8443, resend-mock:8444).
//
// Slow path — single-threaded, generous timeouts, fresh DB per file.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    // Integration tests hit real HTTP — node env, not happy-dom
    environment: 'node',
    // Single-threaded: each test creates real records that other tests would
    // observe. Sequential execution prevents flakes from race conditions
    // between parallel tests writing to the same shared CT BFF.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // Generous timeouts — real DB writes + HTTP round trips
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // No coverage on integration runs — unit tests cover the same branches
    // and integration is about contract correctness, not line coverage
    coverage: { enabled: false },
    // Setup file waits for services to be reachable before running tests
    setupFiles: ['./test/integration/setup.ts'],
    // Allow tests to fail fast if the stack isn't up
    bail: 1,
    // Block 6 Day 18-19 ships scaffolding even when CI can't run them yet
    passWithNoTests: false,
    reporters: ['default'],
  },
});
