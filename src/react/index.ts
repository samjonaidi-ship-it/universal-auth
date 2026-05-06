// @samjonaidi-ship-it/universal-auth | src/react/index.ts | v1.0.6 | 2026-05-08 | BB
// React subpath barrel — `@samjonaidi-ship-it/universal-auth/react`.
// Tree-shakeable named exports only (sideEffects: false).
//
// v1.0.0-rc.4: + ConsentCenter, PermissionCenter, ConsentVersionWatcher.
// v1.0.5 (L3.4): + DelegationCenter, useDelegatedGrants, scope catalogs.
// v1.0.6 (rc.5 audit fix D1): + useIdentity, MediaGallery, AddressInput,
//   VehicleSection, GearSection, ComplianceDocsSection, PropertySection,
//   CompletenessBar. These were built into dist/ but never re-exported —
//   unreachable from any documented import path. Latent since v1.0.0-rc.4.

// Provider + contexts
export {
  AuthProvider,
  IdentityContext,
  EntitlementsContext,
  StatusContext,
  type AuthStatus,
  type IdentityContextValue,
  type EntitlementsContextValue,
  type StatusContextValue,
  type AuthProviderProps,
} from './AuthProvider.js';

// Public hooks per §D2.4
export { useAuth, type UseAuthReturn } from './useAuth.js';
export { useEntitlements, type UseEntitlementsReturn } from './useEntitlements.js';
export { useProfile, type UseProfileReturn, type ProfileState } from './useProfile.js';
export { useImpersonation, type UseImpersonationReturn } from './useImpersonation.js';
// v1.0.4 (L2.18) — drift event type re-exported so consumers can type their banners
export type { ImpersonationDriftEvent } from '../flows/impersonation.js';
export { useSettingsSync, type UseSettingsSyncReturn } from './useSettingsSync.js';
export { usePermissionGrants, type UsePermissionGrantsReturn } from './usePermissionGrants.js';

// L3.3 (v0.1.0) — ABAC hooks per ABAC_DESIGN_v1.0.md §5.1 + §8.1
export { useAccess, type UseAccessReturn } from './useAccess.js';
export { useAccessBulk, type UseAccessBulkReturn } from './useAccessBulk.js';
export {
  canAccess,
  canAccessBulk,
  invalidateAccessCache,
  type ResourceDescriptor,
  type AccessCheck,
  type AccessDecision,
  type AccessDecisionEffect,
} from '../core/abac.js';

// Components per §D2.5
export { SignInForm, type SignInFormProps } from './components/SignInForm.js';
export { CodeEntry, type CodeEntryProps } from './components/CodeEntry.js';
export { PasskeyPrompt, type PasskeyPromptProps } from './components/PasskeyPrompt.js';
export { OfflineIndicator, type OfflineIndicatorProps } from './components/OfflineIndicator.js';
export {
  ImpersonationBanner,
  type ImpersonationBannerProps,
} from './components/ImpersonationBanner.js';
export { AppChooser, type AppChooserProps } from './components/AppChooser.js';
export { PersonaChooser, type PersonaChooserProps } from './components/PersonaChooser.js';
export { PersonaGuard, type PersonaGuardProps } from './components/PersonaGuard.js';
export {
  AgentStatusBanner,
  type AgentStatusBannerProps,
} from './components/AgentStatusBanner.js';
export {
  ConsentScreen,
  DEFAULT_REQUIRED_CONSENTS,
  type ConsentScreenProps,
  type ConsentAudience,
} from './components/ConsentScreen.js';

// Profile components (Block 5)
export {
  ProfileSetupScreen,
  type ProfileSetupScreenProps,
  type ProfileSetupMode,
} from './components/ProfileSetupScreen.js';
export { AvatarPicker, type AvatarPickerProps } from './components/AvatarPicker.js';
export {
  ContactInfoForm,
  type ContactInfoFormProps,
} from './components/ContactInfoForm.js';
export {
  PersonaFieldsForm,
  type PersonaFieldsFormProps,
} from './components/PersonaFieldsForm.js';
export {
  ProfileCompletenessBar,
  type ProfileCompletenessBarProps,
} from './components/ProfileCompletenessBar.js';

// Block 6 (v1.0.0-rc.4) — Consent + Permission settings UIs
export {
  ConsentCenter,
  type ConsentCenterProps,
} from './components/ConsentCenter.js';
export {
  PermissionCenter,
  type PermissionCenterProps,
} from './components/PermissionCenter.js';
export {
  ConsentVersionWatcher,
  computeStale,
  type ConsentVersionWatcherProps,
} from './ConsentVersionWatcher.js';

// L3.4 (v1.0.5) — DelegationCenter per DELEGATION_CENTER_DESIGN_v1.0.md (LOCKED 2026-05-05)
export {
  useDelegatedGrants,
  type UseDelegatedGrantsReturn,
} from './useDelegatedGrants.js';
export {
  DelegationCenter,
  type DelegationCenterProps,
} from './components/DelegationCenter.js';
export {
  crewScopeCatalog,
  homeownerScopeCatalog,
  subcontractorScopeCatalog,
  supplierScopeCatalog,
  architectScopeCatalog,
} from './components/scope-catalogs.js';
export type {
  DelegatedGrant,
  Grantee,
  GranteeKind,
  GrantedVia,
  ScopeMeta,
  CreateDelegatedGrantInput,
  ListDelegatedGrantsResult,
} from '../flows/delegation.js';

// rc.5 (D1 audit fix) — Person-Centric Profile (PCP) hook + components.
// Built since v1.0.0-rc.4 but never re-exported. The PCP envelope hook
// (useIdentity) is the single-source-of-truth for the address book +
// asset/media collections that power BB's crew profile UX.
export {
  useIdentity,
  type UseIdentityReturn,
  type IdentityState,
} from './useIdentity.js';
export {
  MediaGallery,
  type MediaGalleryProps,
} from './components/MediaGallery.js';
export {
  AddressInput,
  type AddressInputProps,
} from './components/AddressInput.js';
export {
  VehicleSection,
  type VehicleSectionProps,
} from './components/VehicleSection.js';
export {
  GearSection,
  type GearSectionProps,
} from './components/GearSection.js';
export {
  ComplianceDocsSection,
  type ComplianceDocsSectionProps,
} from './components/ComplianceDocsSection.js';
export {
  PropertySection,
  type PropertySectionProps,
} from './components/PropertySection.js';
export {
  CompletenessBar,
  type CompletenessBarProps,
} from './components/CompletenessBar.js';
