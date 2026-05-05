// @samjonaidi-ship-it/universal-auth | eslint.config.js | v1.0.0-rc.1 | 2026-04-24 | BB
// ESLint 9 flat config. Strict rules per plan CI/CD step 2.

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

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
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

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
