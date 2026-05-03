// @samjonaidi-ship-it/universal-auth | src/internal/index.ts | v1.0.1 | 2026-05-01 | BB
// Internal subpath — exposes low-level surfaces that are NOT part of the
// stable public API. Anything imported from `@samjonaidi-ship-it/universal-auth/internal`
// is subject to change between minor versions. Use at your own risk.
//
// Phase C6 (v1.0.1 hardening): `setSession` was relocated here from the main
// barrel because it bypasses the canonical sign-in flows (code / passkey /
// enroll) and lets external callers inject session tokens directly. Most
// consumers should use `verifyCode` / `authenticatePasskey` / `activateEnrollment`
// instead. `setSession` remains exported here for non-SDK token sources
// (e.g., CalExp5 PIN-based sign-in via POST /auth/v1/pin/verify).

export { setSession, type SessionTokens } from '../core/token-manager.js';
