// @bainbridgebuilders/universal-auth | src/profile/index.ts | v1.0.1 | 2026-05-01 | BB
// `@bainbridgebuilders/universal-auth/profile` subpath — keeps libphonenumber-js
// out of the core 40 KB budget. Components in `/react` import from here lazily.

export type {
  UniversalProfile,
  EmergencyContact,
  PersonaExtensions,
} from '../types/profile.js';

export {
  PRESET_AVATARS,
  pickPresetForIdentity,
  findPresetByKey,
  type PresetAvatar,
} from './presets.js';

export {
  generateInitials,
  pickInitialsColor,
  resolveAvatar,
  compressJpeg,
  uploadAvatar,
  clearAvatar,
  INITIALS_COLORS,
  type AvatarRender,
} from './avatar.js';

export {
  validatePhone,
  validateEmail,
  requiredFieldsPresent,
  type PhoneValidationResult,
  type EmailValidationResult,
  type RequiredCheckResult,
} from './validators.js';

export {
  computeCompleteness,
  PERSONA_FIELD_ROSTERS,
  type CompletenessResult,
  type PersonaFieldRoster,
} from './completeness.js';

export {
  getPersonaFieldsRegistry,
  getPersonaRoster,
  type PersonaFieldsRegistry,
  type PersonaFieldRosterFromServer,
  type FieldDefinition,
  type FieldType,
} from './persona-fields.js';

export {
  getProfileSnapshot,
  onProfileChange,
  hydrateProfile,
  saveProfile,
  applyAvatarUpdate,
  // v1.0.1 (D1) — caller-side rebase on 409 sync.conflict.
  applyProfilePatch,
  getPendingProfilePatch,
  type ProfileState,
} from './profile-store.js';
