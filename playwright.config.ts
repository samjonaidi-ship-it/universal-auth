// @bb/universal-auth | playwright.config.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Playwright matrix per spec §11.5 + plan Block 6 Day 20-21.
//
// 12 project configs = 4 browsers × 3 form factors:
//   chrome / firefox / webkit / edge
//   × Desktop (1280×800) / Mobile (Pixel 7) / Tablet (iPad Pro 11)
//
// Tests run against the deployed demo at auth-sdk-demo.bainbridgebuilders.com
// OR against a local `pnpm dev` instance when PLAYWRIGHT_BASE_URL=http://localhost:5174.
//
// Real WebAuthn ceremonies use virtual authenticators (CDP-only — Chrome/Edge).

import { defineConfig, devices } from '@playwright/test';

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? 'https://auth-sdk-demo.bainbridgebuilders.com';

const CT_BFF_URL =
  process.env.PLAYWRIGHT_CT_BFF_URL ?? 'https://ct-bff.bainbridgebuilders.com';

export default defineConfig({
  testDir: './test/browser',
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
    { name: 'tablet-chrome', use: { ...devices['iPad Pro 11'] } },
    {
      name: 'tablet-firefox',
      use: { ...devices['iPad Pro 11'], browserName: 'firefox' },
    },
    { name: 'tablet-safari', use: { ...devices['iPad Pro 11'] } },
    {
      name: 'tablet-edge',
      use: { ...devices['iPad Pro 11'], channel: 'msedge' },
    },
  ],

  // Webserver — only spin up local Vite if no remote BASE_URL given
  webServer: BASE_URL.startsWith('http://localhost')
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
