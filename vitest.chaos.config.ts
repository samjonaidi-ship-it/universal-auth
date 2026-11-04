// @samjonaidi-ship-it/universal-auth | vitest.chaos.config.ts | v1.0.1 | 2026-11-04 | BB
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
    // Vitest 4 removed test.poolOptions, so `singleFork` was silently ignored
    // and the chaos files ran in parallel against one shared Toxiproxy — each
    // file's toxics/proxy changes reset the others' connections (nightly
    // 2026-11-04: "SocketError: other side closed" across scenarios 1 and 6).
    // One file at a time, one worker.
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 90_000,
    setupFiles: ['./test/chaos/setup.ts'],
    coverage: { enabled: false },
    passWithNoTests: false,
    bail: 1,
    reporters: ['default'],
  },
});
