// @samjonaidi-ship-it/universal-auth | vitest.security.config.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Security audit suite per spec §11.8 L1141.
//
// Tests live in test/security/ — they're ALL self-contained (no docker stack)
// so this config can run on every PR without external infra.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/security/**/*.test.ts'],
    environment: 'happy-dom',
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ['./test/unit/setup.ts'],
    coverage: { enabled: false },
    bail: 0,
    reporters: ['default'],
  },
});
