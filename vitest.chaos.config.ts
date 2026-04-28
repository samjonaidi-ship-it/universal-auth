// @bb/universal-auth | vitest.chaos.config.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Chaos test config per spec §11.6 + plan Block 6 Day 20-21.
//
// Tests run against the integration docker-compose stack PLUS a Toxiproxy
// container (test/chaos/docker-compose.chaos.yml) that injects faults
// (latency, drops, 5xx) on the path between SDK and CT BFF.
//
// Single-fork because Toxiproxy state is shared and tests reconfigure faults
// per case — parallel runs would clobber each other.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/chaos/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 60_000,
    hookTimeout: 90_000,
    setupFiles: ['./test/chaos/setup.ts'],
    coverage: { enabled: false },
    passWithNoTests: false,
    bail: 1,
    reporters: ['default'],
  },
});
