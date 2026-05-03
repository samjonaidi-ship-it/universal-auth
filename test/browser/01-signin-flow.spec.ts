// @samjonaidi-ship-it/universal-auth | test/browser/01-signin-flow.spec.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// E2E: code-first sign-in flow per §11.10 manual QA scenario #1.
// Runs across all 12 Playwright projects — desktop/mobile/tablet × 4 browsers.

import { test, expect } from '@playwright/test';

test.describe('Sign-in flow (code-first)', () => {
  test('happy path — destination → code → authenticated state', async ({ page }) => {
    await page.goto('/');

    // Sign-in form should be visible (anonymous state)
    const heading = page.getByRole('heading', { name: /sign in/i });
    await expect(heading).toBeVisible();

    // Enter destination
    const destInput = page.getByLabel(/phone or email/i);
    await destInput.fill('test-crew-1@test.bainbridgebuilders.com');

    // Submit → code stage
    await page.getByRole('button', { name: /send code/i }).click();

    const codeHeading = page.getByRole('heading', { name: /enter your code/i });
    await expect(codeHeading).toBeVisible({ timeout: 10_000 });

    // Enter seeded code 000000 (test-mode bypass)
    const codeInput = page.getByLabel(/6-digit code/i);
    await codeInput.fill('000000');

    // Verify
    await page.getByRole('button', { name: /verify/i }).click();

    // Authenticated state — display name should appear
    await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });
  });

  test('rejects empty destination with inline error', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /send code/i }).click();
    await expect(page.getByRole('alert')).toContainText(/enter a phone/i);
  });

  test('rejects 5-digit code (must be exactly 6)', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit code/i).fill('12345');
    const submit = page.getByRole('button', { name: /verify/i });
    await expect(submit).toBeDisabled();
  });
});
