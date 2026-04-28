// @bb/universal-auth | test/browser/05-a11y-axe.spec.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Accessibility audit per WCAG 2.2 AA — A4 gate #4 (deferred from A4 to A5).
// Uses @axe-core/playwright to inject axe-core and assert zero violations.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility (axe-core, WCAG 2.2 AA)', () => {
  test('demo home (anonymous) has zero a11y violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('sign-in form has zero a11y violations', async ({ page }) => {
    await page.goto('/');
    // Form is already on the home — same scan but explicitly scoped
    const results = await new AxeBuilder({ page })
      .include('form')
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('authenticated state has zero a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit code/i).fill('000000');
    await page.getByRole('button', { name: /verify/i }).click();
    await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('ConsentScreen has zero a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit code/i).fill('000000');
    await page.getByRole('button', { name: /verify/i }).click();
    await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });

    const results = await new AxeBuilder({ page })
      .include('form[aria-label*="Review"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
