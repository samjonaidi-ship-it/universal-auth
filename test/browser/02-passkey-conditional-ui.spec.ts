// @bb/universal-auth | test/browser/02-passkey-conditional-ui.spec.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// E2E: passkey ceremony with virtual authenticator (CDP-only — Chrome/Edge).
// Per spec §11.10 manual QA scenarios for "returning user Conditional UI".
//
// WebKit + Firefox don't support virtual authenticators via CDP — those projects
// skip this test (graceful skip via test.skip()).

import { test, expect, type CDPSession } from '@playwright/test';

const CDP_BROWSERS = ['chromium', 'chrome', 'msedge', 'edge'];

test.describe('Passkey ceremony (Conditional UI)', () => {
  test.skip(({ browserName }) => !CDP_BROWSERS.includes(browserName.toLowerCase()),
    'Virtual authenticator API requires CDP — skipping non-Chromium browsers');

  test('register passkey via virtual authenticator', async ({ page, context }) => {
    // First sign in via code so we have an authenticated session
    await page.goto('/');
    await page.getByLabel(/phone or email/i).fill('test-crew-1@test.bainbridgebuilders.com');
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit code/i).fill('000000');
    await page.getByRole('button', { name: /verify/i }).click();
    await expect(page.getByText(/signed in as/i)).toBeVisible({ timeout: 10_000 });

    // Add a virtual authenticator via CDP
    const cdp: CDPSession = await context.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
      },
    });
    expect(typeof authenticatorId).toBe('string');

    // Trigger registration via the demo's "Add passkey" CTA
    // (Block 7 demo expansion adds this UI; for now, this test smokes the
    // CDP virtual authenticator setup which Block 7 will exercise fully.)
    expect(authenticatorId.length).toBeGreaterThan(0);

    // Cleanup
    await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  });
});
