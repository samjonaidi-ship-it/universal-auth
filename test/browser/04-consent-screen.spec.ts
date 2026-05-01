// @bainbridgebuilders/universal-auth | test/browser/04-consent-screen.spec.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// E2E: <ConsentScreen> 9-consent crew hard-gate per spec §3.4 v1.4.0 + Wizard §20.
// Per spec §11.10 — "happy path enroll/code/consent/passkey/land".

import { test, expect } from '@playwright/test';

test.describe('ConsentScreen — 9-consent crew hard-gate', () => {
  test('renders all 9 required consents grouped by type', async ({ page }) => {
    // The demo's consent section renders a ConsentScreen with audience='crew'
    // (after sign-in). Sign in first.
    await page.goto('/');
    await page.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit code/i).fill('000000');
    await page.getByRole('button', { name: /verify/i }).click();
    await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });

    // Scroll to / find the consent section
    const consentSection = page.getByRole('form', { name: /review and accept/i });
    await consentSection.scrollIntoViewIfNeeded();
    await expect(consentSection).toBeVisible();

    // Should have exactly 9 required checkboxes (3 legal + 3 device + 3 ai_assistant)
    const checkboxes = consentSection.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(9);

    // Submit button should be DISABLED initially
    const submit = consentSection.getByRole('button', { name: /accept/i });
    await expect(submit).toBeDisabled();
  });

  test('submit enables only after ALL 9 consents are checked (atomic gate)', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit code/i).fill('000000');
    await page.getByRole('button', { name: /verify/i }).click();
    await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });

    const consentSection = page.getByRole('form', { name: /review and accept/i });
    const checkboxes = await consentSection.getByRole('checkbox').all();
    const submit = consentSection.getByRole('button', { name: /accept/i });

    // Check 8 of 9 — submit still disabled
    for (let i = 0; i < 8; i++) {
      await checkboxes[i]!.click();
    }
    await expect(submit).toBeDisabled();

    // Check the 9th — submit becomes enabled
    await checkboxes[8]!.click();
    await expect(submit).toBeEnabled();
  });
});
