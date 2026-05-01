// @bainbridgebuilders/universal-auth | test/browser/03-multi-tab-sync.spec.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// E2E: multi-tab session sync via BroadcastChannel.
// Per spec §11.10 — "multi-tab login pickup" + "multi-tab forced-revoke".

import { test, expect } from '@playwright/test';

test.describe('Multi-tab session sync', () => {
  test('sign-in in tab A → tab B picks up session via BroadcastChannel', async ({
    context,
  }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    await tabA.goto('/');
    await tabB.goto('/');

    // Both tabs start anonymous
    await expect(tabA.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(tabB.getByRole('heading', { name: /sign in/i })).toBeVisible();

    // Sign in on tab A
    await tabA.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await tabA.getByRole('button', { name: /send code/i }).click();
    await tabA.getByLabel(/6-digit code/i).fill('000000');
    await tabA.getByRole('button', { name: /verify/i }).click();
    await expect(tabA.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });

    // Tab B should pick up the session via BroadcastChannel within ~1s
    await expect(tabB.getByText(/signed in as/i)).toBeVisible({ timeout: 5_000 });
  });

  test('sign-out in tab A → tab B drops to anonymous', async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    // Sign in tab A first
    await tabA.goto('/');
    await tabA.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await tabA.getByRole('button', { name: /send code/i }).click();
    await tabA.getByLabel(/6-digit code/i).fill('000000');
    await tabA.getByRole('button', { name: /verify/i }).click();
    await expect(tabA.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });

    // Tab B picks up session
    await tabB.goto('/');
    await expect(tabB.getByText(/signed in as/i)).toBeVisible({ timeout: 5_000 });

    // Sign out on tab A
    await tabA.getByRole('button', { name: /sign out/i }).click();
    await expect(tabA.getByRole('heading', { name: /sign in/i })).toBeVisible({
      timeout: 5_000,
    });

    // Tab B drops to anonymous within ~1s
    await expect(tabB.getByRole('heading', { name: /sign in/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});
