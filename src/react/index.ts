// @bb/universal-auth | src/react/index.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// React subpath barrel — `@bainbridgebuilders/universal-auth/react`.
// Tree-shakeable named exports only (sideEffects: false).

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
export { useSettingsSync, type UseSettingsSyncReturn } from './useSettingsSync.js';
export { usePermissionGrants, type UsePermissionGrantsReturn } from './usePermissionGrants.js';

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
