// @bb/universal-auth | src/extendability/auth-flow.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Per §8.5.3 — pluggable auth-flow adapter (OIDC federation, SAML, magic-link
// alternatives, etc.). v1 ships code-flow + passkey-flow as built-ins.
// Future enterprise SSO flows register via this interface.

export interface AuthFlowChallenge {
  flow_key: string;
  /** Server-issued challenge data — SDK passes through unchanged. */
  challenge: Record<string, unknown>;
}

export interface AuthFlowAssertion {
  flow_key: string;
  /** User-provided proof — credential, code, attestation, etc. */
  assertion: Record<string, unknown>;
}

export interface AuthFlowAttestation {
  flow_key: string;
  /** Registration material — credential public key, federated identity proof. */
  attestation: Record<string, unknown>;
}

export interface AuthFlowAdapter {
  flow_key: string;
  /** Optional human label for `<SignInForm>` flow-picker dropdown. */
  display_name?: string;
  /** Begin a sign-in ceremony — returns challenge from server. */
  beginAuthenticate?(): Promise<AuthFlowChallenge>;
  /** Complete the ceremony — returns assertion to send to /verify. */
  completeAuthenticate?(challenge: AuthFlowChallenge): Promise<AuthFlowAssertion>;
  /** Begin a registration ceremony (post-sign-in). */
  beginRegister?(): Promise<AuthFlowChallenge>;
  /** Complete registration — returns attestation. */
  completeRegister?(challenge: AuthFlowChallenge): Promise<AuthFlowAttestation>;
}
