// @samjonaidi-ship-it/universal-auth | vitest.memory.config.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Memory-leak soak config per spec §11.7 L1139.
//
// In CI we run a SHORT version (~5 min) gating regressions; the full 24h
// soak runs nightly via .github/workflows/chaos.yml.
//
// Knob: BB_SOAK_DURATION_MS (default 5 min, 24h nightly)

import { defineConfig } from 'vitest/config';

const HOUR = 60 * 60 * 1000;
const SOAK_MS = Number(process.env.BB_SOAK_DURATION_MS) || 5 * 60 * 1000;

export default defineConfig({
  test: {
    include: ['test/memory/**/*.test.ts'],
    environment: 'happy-dom',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Soak test must outlive the soak duration plus warmup/teardown
    testTimeout: SOAK_MS + 2 * HOUR,
    hookTimeout: 30_000,
    setupFiles: ['./test/unit/setup.ts'],
    coverage: { enabled: false },
    bail: 1,
    reporters: ['default'],
  },
});
