// @samjonaidi-ship-it/universal-auth | vitest.config.ts | v1.0.4 | 2026-05-04 | BB
// Vitest unit-test config. Coverage gates per §11 thresholds.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test.tsx'],
    environment: 'happy-dom',
    setupFiles: ['./test/unit/setup.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      // Spec §11 thresholds — activated 2026-04-28 (Block 6 coverage push).
      // CI enforces; PRs that drop coverage below these fail the unit job.
      // v1.0.4 (Lane 2a, 2026-05-04): branches restored 83 → 84 after the
      // 9 hydrate-race tests were refactored to deterministic pre-seed
      // (no waitFor on fetch-mock).
      // v1.0.4 (Lane 2 finalize, 2026-05-04): branches raised 84 → 85 after
      // recovery.ts (→100%), reconciler.ts (→86.27%), code-flow.ts (→94.44%)
      // and passkey-flow.ts (→95.23%) gained focused branch tests in
      // *-branches.test.ts files. Measured global branches: ~85.2%. Spec target met.
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
      exclude: [
        'dist/**',
        'node_modules/**',
        'demo/**',
        'scripts/**',
        'test/**',
        '**/*.config.*',
        // Sibling worktrees under .claude/worktrees/ create nested copies of
        // src/ that vitest's globbing would otherwise count toward coverage.
        '.claude/**',
        // Pure type definitions — no executable code.
        'src/types/**',
        // Barrel files: re-export only. Listed as 0% because v8 doesn't
        // count re-export evaluation; functionally tested via every consumer.
        'src/index.ts',
        'src/profile/index.ts',
        'src/extendability/index.ts',
        'src/react/index.ts',
        'src/react/components/index.ts',
        // Service worker ENTRY POINT — runs in SW global scope (not happy-dom);
        // covered by Playwright at the integration level. The pure-algorithm
        // helpers it imports from `sw/purge-helpers.ts` ARE unit-tested
        // (look-back fix L6 2026-04-28).
        'src/sw/index.ts',
        // Web Worker module — runs inside the worker; exercised indirectly
        // via crypto-client.ts unit tests. Direct unit coverage requires
        // a Worker shim; deferred past v1.0.
        'src/core/crypto-worker.ts',
        // Pure interface declarations (shape-only, no logic) for v1.0
        // reserved extension points.
        'src/extendability/auth-flow.ts',
        'src/extendability/risk-signal.ts',
        'src/extendability/notification-channel.ts',
      ],
    },
  },
});
