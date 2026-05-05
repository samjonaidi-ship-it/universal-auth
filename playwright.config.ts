// @samjonaidi-ship-it/universal-auth | playwright.config.ts | v1.0.4 | 2026-05-04 | BB
// Playwright matrix per spec §11.5 + plan Block 6 Day 20-21 + DoD A5 audit gate #3 (L2.12).
//
// 12 project configs = 4 browsers × 3 form factors:
//   chromium / firefox / webkit / edge (msedge channel)
//   × Desktop (1280×800) / Mobile (Pixel 7 / iPhone 14) / Tablet (iPad Pro 11)
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Project name        │ Browser  │ Form factor │ Device preset         │
// ├──────────────────────────────────────────────────────────────────────┤
// │ desktop-chrome      │ chromium │ Desktop     │ Desktop Chrome        │
// │ desktop-firefox     │ firefox  │ Desktop     │ Desktop Firefox       │
// │ desktop-webkit      │ webkit   │ Desktop     │ Desktop Safari        │
// │ desktop-edge        │ chromium │ Desktop     │ Desktop Edge (msedge) │
// │ mobile-chrome       │ chromium │ Mobile      │ Pixel 7               │
// │ mobile-firefox      │ firefox  │ Mobile      │ Pixel 7 viewport      │
// │ mobile-safari       │ webkit   │ Mobile      │ iPhone 14             │
// │ mobile-edge         │ chromium │ Mobile      │ Pixel 7 (msedge)      │
// │ tablet-chrome       │ chromium │ Tablet      │ iPad Pro 11           │
// │ tablet-firefox      │ firefox  │ Tablet      │ iPad Pro 11 viewport  │
// │ tablet-safari       │ webkit   │ Tablet      │ iPad Pro 11           │
// │ tablet-edge         │ chromium │ Tablet      │ iPad Pro 11 (msedge)  │
// └──────────────────────────────────────────────────────────────────────┘
//
// When does each run?
//   - PR-time (CI smoke): 4-config subset, one row per browser, desktop only.
//     Run via `pnpm test:browser:smoke` (uses --project filters; ~5 min).
//     Triggered by ci.yml `browser-smoke` job (added in v1.0.5).
//   - Nightly (full matrix): all 12 configs.
//     Run via `pnpm test:browser:matrix` (no filter; ~15-30 min).
//     Triggered by browser-matrix.yml (added in v1.0.5) at 03:00 UTC + on demand.
//   - Local dev: `pnpm test:browser` runs all projects against any baseURL.
//
// Tests run against the deployed demo at auth-sdk-demo.bainbridgebuilders.com
// OR against a local `pnpm dev` instance when PLAYWRIGHT_BASE_URL=http://localhost:5174.
//
// Real WebAuthn ceremonies use virtual authenticators (CDP-only — Chromium/Edge).
// 02-passkey-conditional-ui.spec.ts gracefully skips on Firefox/WebKit projects.
//
// v1.0.5 (2026-05-04): documented 12-config matrix, formalized PR vs nightly
// strategy. SMOKE_PROJECTS export consumed by CI workflows + smoke script so
// the subset stays in lock-step with the projects array.
//
// v1.0.2 (2026-05-02): + memory-soak project that serves the repo root via
// http-server on :5175 so test/browser/06-memory-soak.spec.ts can fetch the
// built SDK from /dist/esm/ + the harness HTML from /test/browser/fixtures/.

import { defineConfig, devices } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://auth-sdk-demo.bainbridgebuilders.com';

const CT_BFF_URL =
  process.env.PLAYWRIGHT_CT_BFF_URL ?? 'https://ct-bff.bainbridgebuilders.com';

// PR-time smoke subset — one project per browser, desktop only.
// Imported by scripts/CI to keep the smoke subset in sync with the 12-config matrix.
// Skip-pattern: 02-passkey will run on chromium + edge (CDP-capable) and
// gracefully skip on firefox + webkit, so the smoke subset still exercises
// every spec on at least one browser without booting all 12 projects.
export const SMOKE_PROJECTS = [
  'desktop-chrome',
  'desktop-firefox',
  'desktop-webkit',
  'desktop-edge',
] as const;

export default defineConfig({
  testDir: './test/browser',
  testIgnore: process.env.PLAYWRIGHT_INCLUDE_SOAK === '1' ? [] : ['**/06-memory-soak.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  // Global setup for SDK init + test-mode key
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      'X-Test-Mode-Key': process.env.TEST_MODE_KEY ?? 'test-key-do-not-use-in-prod',
    },
  },

  projects: [
    // ── Desktop (4 configs) ──
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'desktop-firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'desktop-webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'desktop-edge',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        viewport: { width: 1280, height: 800 },
      },
    },
    // ── Mobile (4 configs) ──
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-firefox', use: { ...devices['Pixel 7'], browserName: 'firefox' } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
    {
      name: 'mobile-edge',
      use: { ...devices['Pixel 7'], channel: 'msedge' },
    },
    // ── Tablet (4 configs) ──
    { name: 'tablet-chrome', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } },
    {
      name: 'tablet-firefox',
      use: { ...devices['iPad Pro 11'], browserName: 'firefox' },
    },
    { name: 'tablet-safari', use: { ...devices['iPad Pro 11'] } },
    {
      name: 'tablet-edge',
      use: { ...devices['iPad Pro 11'], channel: 'msedge' },
    },
    // ── Memory soak (Chromium only — performance.memory + CDP) ──
    {
      name: 'memory-soak',
      testMatch: /06-memory-soak\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5175',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // Webserver — only spin up local Vite if no remote BASE_URL given.
  // The memory-soak project additionally needs a static server at :5175
  // serving the repo root (so the harness can load /dist/esm/ + fixtures).
  webServer: process.env.PLAYWRIGHT_INCLUDE_SOAK === '1'
    ? {
        command: 'pnpm exec http-server . -p 5175 --silent',
        url: 'http://localhost:5175/test/browser/fixtures/memory-soak-harness.html',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : BASE_URL.startsWith('http://localhost')
      ? {
          command: 'pnpm --filter bb-universal-auth-demo dev',
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        }
      : undefined,

  // Surface CT BFF base for tests that hit it directly (rare — most go through SDK)
  metadata: {
    bffBaseUrl: CT_BFF_URL,
  },
});
