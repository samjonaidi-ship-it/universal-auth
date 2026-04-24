// @bb/universal-auth | src/index.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Public barrel — named exports only (tree-shakeable per §8.2).

export type { UniversalAuthConfig } from './config.js';
export { initUniversalAuth, SDK_VERSION } from './config.js';

// Imperative (non-React) entry point per §5.3
export { getAuth } from './imperative/getAuth.js';

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
export type { UniversalProfile } from './types/profile.js';

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
  type StartImpersonationInput,
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

// Entitlement + settings + observability surfaces
export {
  hasFeature,
  hasAppAccess,
  getEntitlementsSnapshot,
  refreshEntitlements,
} from './core/entitlements.js';
export {
  getSettings,
  getSettingsVersion,
  updateSettings,
  onSettingsChange,
  hydrateSettings,
  flushSettingsNow,
  type SettingsShape,
} from './core/settings-sync.js';
export { getSDKMetrics, type SDKMetrics } from './core/sdk-metrics.js';
export { emit as emitEvent } from './core/event-reporter.js';
export {
  startSessionWatcher,
  stopSessionWatcher,
} from './core/session-watcher.js';
export { onSessionChange } from './core/token-manager.js';
