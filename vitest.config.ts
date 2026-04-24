// @bb/universal-auth | vitest.config.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Vitest unit-test config. Coverage gates activate starting Days 16-17 per plan Block 6.
// During Days 1-15 scaffold + implementation phase, passWithNoTests allows the CI step
// to succeed before any test files exist.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Block 1 Day 1 — no tests yet. Prevents ELIFECYCLE on empty suite.
    passWithNoTests: true,

    include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test.tsx'],
    environment: 'happy-dom',
    setupFiles: ['./test/unit/setup.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      // Coverage THRESHOLDS activate at A4 end (Day 15+). For now, report only.
      // Post-A4 activation per plan Block 6 Day 16-17:
      //   thresholds: { lines: 90, branches: 85, functions: 90, statements: 90 }
      exclude: [
        'dist/**',
        'node_modules/**',
        'demo/**',
        'scripts/**',
        'test/**',
        '**/*.config.*',
      ],
    },
  },
});
