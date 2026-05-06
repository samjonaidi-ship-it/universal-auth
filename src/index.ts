// @samjonaidi-ship-it/universal-auth | src/index.ts | v1.0.4 | 2026-05-04 | BB
// Public barrel — named exports only (tree-shakeable per §8.2).
//
// v1.0.1 (Phase C6): `setSession` relocated to `/internal` subpath. The
// main-barrel export below is a deprecation shim that warns once on first
// call and delegates to the internal implementation. Slated for removal in
// v1.1 — consumers should migrate to:
//   import { setSession } from '@samjonaidi-ship-it/universal-auth/internal';
//
// rc.3 additions: direct imperative token-manager surface (`getAccessToken`,
// `getCurrentSessionId`, `hasLiveAccessToken`) so non-React consumers (e.g.
// CalExp5's api-base.js wrapper) can read the current bearer token without
// going through the React context tree. `getAuth()` upgraded from Day-1
// stub to a real client wrapping these + sign-out flow.

export type { UniversalAuthConfig } from './config.js';
export { initUniversalAuth, SDK_VERSION } from './config.js';

// Imperative (non-React) entry point per §5.3
export { getAuth, type AuthClient, type ImperativeSessionSnapshot } from './imperative/getAuth.js';

// rc.3: direct token-manager exports so non-React consumers can pull a
// fresh bearer token without instantiating the AuthClient. Useful for
// thin wrappers like CalExp5's api-base.js that need to inject
// `Authorization: Bearer <token>` on every fetch.
export {
  getAccessToken,
  getCurrentSessionId,
  hasLiveAccessToken,
  type SessionTokens,
} from './core/token-manager.js';

// v1.0.1 (Phase C6): `setSession` deprecation shim. The canonical home is
// now `@samjonaidi-ship-it/universal-auth/internal`. This shim warns once
// on first call, then delegates. Removed in v1.1.
import { setSession as _setSessionInternal, type SessionTokens as _SessionTokens } from './core/token-manager.js';

let __setSessionDeprecationWarned = false;

/**
 * @deprecated Since v1.0.1 — import from `@samjonaidi-ship-it/universal-auth/internal` instead.
 * This main-barrel re-export will be removed in v1.1. `setSession` bypasses the
 * canonical sign-in flows (code / passkey / enroll) and is intended only for
 * non-SDK token sources (e.g., legacy PIN-based sign-in).
 */
export function setSession(tokens: _SessionTokens): void {
  if (!__setSessionDeprecationWarned) {
    __setSessionDeprecationWarned = true;
    console.warn(
      '[universal-auth] setSession is deprecated from the main barrel as of v1.0.1. ' +
        'Import it from "@samjonaidi-ship-it/universal-auth/internal" instead. ' +
        'This shim will be removed in v1.1.'
    );
  }
  _setSessionInternal(tokens);
}

// Error classes per §3.7 (17 total)
export * from './errors.js';

// Public types per §types/
export type {
  Session,
  Identity,
  Persona,
  Entitlements,
  AgentContext,
  IdentityKind,
  SessionMeta,
} from './types/api.js';
// Profile type re-exports moved to "Profile module" section below.

// Flow surfaces (Block 3)
export { requestCode, verifyCode, type RequestCodeInput, type VerifyCodeInput } from './flows/code-flow.js';
export {
  verifyEnrollmentToken,
  activateEnrollment,
  parseEnrollmentTokenFromUrl,
  type EnrollVerifyResult,
  type EnrollActivateInput,
  type ConsentDocumentRef,
} from './flows/enroll-flow.js';
export {
  signOut,
  signOutEverywhere,
  listSessions,
  revokeSession,
  type ActiveSession,
} from './flows/recovery.js';
export {
  startImpersonation,
  endImpersonation,
  recordImpersonationAction,
  onLocalClearDrift,
  type StartImpersonationInput,
  type ImpersonationDriftEvent,
} from './flows/impersonation.js';
export {
  getPersonaRegistry,
  lookupPersona,
  type PersonaRegistryEntry,
} from './flows/persona-registry-client.js';
export {
  recordPermissionGrant,
  requestAndRecord,
  type PermissionKey,
  type PermissionState,
  type RecordGrantInput,
} from './flows/permission-grants.js';
export {
  getConsentDocuments,
  bulkAcceptConsents,
  recordConsent,
  revokeConsent,
  listConsents,
  type ConsentRecord,
  type ListedConsent,
} from './flows/consent.js';

// Passkey (Block 5 — replaces Day 1 stub)
export {
  isPasskeySupported,
  isConditionalUiSupported,
  registerPasskey,
  authenticatePasskey,
  type RegisterPasskeyResult,
  type AuthenticatePasskeyOptions,
  type AuthenticatePasskeyResult,
} from './flows/passkey-flow.js';

// Profile module — exposed via the `/profile` subpath to keep libphonenumber-js
// out of the core 40 KB budget (§12.1). Re-export only the type for convenience.
export type { UniversalProfile } from './types/profile.js';

// Entitlement + settings + observability surfaces
export {
  hasFeature,
  hasAppAccess,
  getEntitlementsSnapshot,
  refreshEntitlements,
  onEntitlementsChange,
} from './core/entitlements.js';
export {
  getSettings,
  getSettingsVersion,
  updateSettings,
  onSettingsChange,
  hydrateSettings,
  flushSettingsNow,
  // v1.0.1 (C8) — caller-side rebase on 409 sync.conflict.
  applySettingsPatch,
  getPendingSettingsPatch,
  discardPendingPatch as discardPendingSettingsPatch,
  type SettingsShape,
} from './core/settings-sync.js';
export { getSDKMetrics, type SDKMetrics } from './core/sdk-metrics.js';
export { emit as emitEvent } from './core/event-reporter.js';
export {
  startSessionWatcher,
  stopSessionWatcher,
} from './core/session-watcher.js';
export { onSessionChange } from './core/token-manager.js';

// L3.3 (v0.1.0) — ABAC imperatives per ABAC_DESIGN_v1.0.md §5.1 + §8.2
export {
  canAccess,
  canAccessBulk,
  invalidateAccessCache,
  onAccessChange,
  type ResourceDescriptor,
  type AccessCheck,
  type AccessDecision,
  type AccessDecisionEffect,
} from './core/abac.js';
