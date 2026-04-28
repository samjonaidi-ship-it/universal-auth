// @bb/universal-auth | test/integration/passkey-simulator.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Minimal authenticator simulator for integration tests. NOT a real WebAuthn
// implementation — produces shapes the BFF can verify in test mode (where
// signature verification can be relaxed / bypassed).
//
// Real ceremony is exercised by Playwright in Block 6 Day 20-21 with virtual
// authenticators (`browser.addVirtualAuthenticator(...)`).

export interface SimulatedAuthenticator {
  credentialId: string;
  privateKey: string;
  counter: number;
}

/**
 * Build a registration response shape that satisfies the BFF's
 * test-mode verifier. Real WebAuthn would sign with the private key here.
 */
export async function generateRegistrationResponse(
  auth: SimulatedAuthenticator,
  options: unknown
): Promise<{ id: string; rawId: string; response: { attestationObject: string; clientDataJSON: string }; type: string; clientExtensionResults: Record<string, unknown> }> {
  void options;
  // base64url encoding of stub strings — BFF in test mode accepts these
  return {
    id: auth.credentialId,
    rawId: auth.credentialId,
    response: {
      attestationObject: btoa('test-attestation-' + auth.credentialId).replace(/=/g, ''),
      clientDataJSON: btoa(
        JSON.stringify({
          type: 'webauthn.create',
          challenge: 'test-challenge',
          origin: 'http://localhost:5174',
        })
      ).replace(/=/g, ''),
    },
    type: 'public-key',
    clientExtensionResults: {},
  };
}

/**
 * Build an authentication response shape. Increments the simulated counter
 * each call (BFF rejects replays where counter doesn't increase).
 */
export async function generateAuthenticationResponse(
  auth: SimulatedAuthenticator,
  options: unknown
): Promise<{
  id: string;
  rawId: string;
  response: { authenticatorData: string; clientDataJSON: string; signature: string };
  type: string;
  clientExtensionResults: Record<string, unknown>;
}> {
  void options;
  auth.counter += 1;
  return {
    id: auth.credentialId,
    rawId: auth.credentialId,
    response: {
      authenticatorData: btoa('test-auth-data-' + auth.counter).replace(/=/g, ''),
      clientDataJSON: btoa(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: 'test-challenge',
          origin: 'http://localhost:5174',
        })
      ).replace(/=/g, ''),
      signature: btoa('test-sig-' + auth.counter).replace(/=/g, ''),
    },
    type: 'public-key',
    clientExtensionResults: {},
  };
}
