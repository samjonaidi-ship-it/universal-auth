// @samjonaidi-ship-it/universal-auth | eslint.config.js | v1.0.0-rc.3 | 2026-05-08 | BB
// ESLint 9 flat config. Strict rules per plan CI/CD step 2.
//
// eslint-plugin-react-hooks pinned to ^5.0.0 (NOT v7+) because v7 adds
// `react-hooks/set-state-in-effect` which flags legitimate
// useSyncExternalStore-style patterns in our useProfile / useImpersonation /
// useEntitlements hooks. v5 carries `exhaustive-deps` + `rules-of-hooks`
// (the rules our `// eslint-disable-next-line` comments referenced) without
// the v7 strictness regression. Re-evaluate when v7 stabilizes its
// useSyncExternalStore exemptions or our hooks are refactored.

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Ignore generated + dependency output
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'demo/dist/**',
      '*.cjs',
      'pnpm-lock.yaml',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // TypeScript config for source files (type-checked against tsconfig.json)
  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'test/**/*.ts', 'test/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.json'],
      },
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        // Worker
        self: 'readonly',
        importScripts: 'readonly',
        // Node (scripts + tests)
        process: 'readonly',
        globalThis: 'readonly',
        URL: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Strict type safety (plan CI/CD step 2)
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': 'allow-with-description',
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],

      // Clean code
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],

      // Prevent TODO/FIXME/XXX leaking to main (A1 gate #7)
      'no-warning-comments': [
        'warn',
        { terms: ['TODO', 'FIXME', 'XXX', 'HACK'], location: 'anywhere' },
      ],

      // Unused must be prefixed with _
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Allow `undefined` in type unions (conflicts with no-undef in flat config)
      'no-undef': 'off',
    },
  },

  // Scripts config (not in tsconfig.json include — lint without project/type-checking)
  {
    files: ['scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Intentionally no `project` — scripts aren't in tsconfig include
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        globalThis: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'off', // scripts log to stdout/stderr
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      'no-undef': 'off',
    },
  },
];
