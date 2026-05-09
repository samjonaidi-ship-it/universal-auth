// @samjonaidi-ship-it/universal-auth | test/integration/02-passkey-ceremony.test.ts | v1.0.1 | 2026-05-09 | BB
// Integration test #2 per spec §11.3 — full passkey register + authenticate ceremony.
//
// Real WebAuthn requires a browser (handled in Block 6 Day 20-21 Playwright matrix).
// This integration test uses @simplewebauthn/server's verification helpers
// to simulate the authenticator side, exercising the full BFF endpoints:
//   POST /auth/v1/passkey/register/options
//   POST /auth/v1/passkey/register/verify
//   POST /auth/v1/passkey/authenticate/options
//   POST /auth/v1/passkey/authenticate/verify

import { describe, it, expect } from 'vitest';
import { bff, signInSeeded } from './helpers.js';
import {
  generateRegistrationResponse,
  generateAuthenticationResponse,
  type SimulatedAuthenticator,
} from './passkey-simulator.js';

describe('Integration #2 — passkey ceremony (§11.3)', () => {
  it('register options → verify, then authenticate options → verify', async () => {
    // Sign in via code first to get an authenticated session
    const session = await signInSeeded('test-crew-1');

    // ── REGISTER ──
    const optionsRes = await bff<Record<string, unknown>>(
      '/auth/v1/passkey/register/options',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cookie: session.cookie,
        body: {},
      }
    );
    expect(optionsRes.status).toBe(200);
    expect(optionsRes.body).toHaveProperty('challenge');

    // Simulate the authenticator side
    const authenticator: SimulatedAuthenticator = {
      credentialId: crypto.randomUUID(),
      privateKey: 'test-private-key',
      counter: 0,
    };
    const attestation = await generateRegistrationResponse(
      authenticator,
      optionsRes.body
    );

    const verifyRes = await bff<{ ok: boolean; credentialId: string }>(
      '/auth/v1/passkey/register/verify',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cookie: session.cookie,
        testMode: true,
        body: attestation,  // flat — BFF reads req.body.id for the credential ID
      }
    );
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.ok).toBe(true);

    // ── AUTHENTICATE — fresh login using the just-registered passkey ──
    const authOptions = await bff<Record<string, unknown>>(
      '/auth/v1/passkey/authenticate/options',
      {
        method: 'POST',
        testMode: true,
        body: { identityId: session.identity.identity_id },
      }
    );
    expect(authOptions.status).toBe(200);

    const assertion = await generateAuthenticationResponse(
      authenticator,
      authOptions.body
    );

    const authVerify = await bff<{
      access_token: string;
      session_id: string;
      identity: { identity_id: string };
    }>('/auth/v1/passkey/authenticate/verify', {
      method: 'POST',
      testMode: true,
      // Spread assertion flat (id/rawId/response/type) + add identityId.
      // device_id is derived server-side from request headers, not from body.
      body: { ...assertion, identityId: session.identity.identity_id },
    });
    expect(authVerify.status).toBe(200);
    expect(authVerify.body.access_token).toBeTypeOf('string');
    expect(authVerify.body.identity.identity_id).toBe(session.identity.identity_id);
  });
});
