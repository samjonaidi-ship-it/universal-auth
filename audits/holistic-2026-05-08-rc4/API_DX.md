# API/DX Audit — rc.4 Lookback | 2026-05-08

## Score: 8.0 / 10  (rc.2 audit: 8.5 / 10)

**Why down 0.5 from rc.2:** rc.4 itself ships zero public-API regressions and closes every rc.3 fixup the prior audit listed. But this re-audit, reading the FULL `src/react/` tree against `src/react/index.ts` and `package.json:exports`, surfaced a high-severity discoverability gap that the rc.2/rc.3 audits did not notice (or did not score against): seven shipped React components plus the `useIdentity()` hook that powers them are present in `dist/` but never re-exported from the public `react` barrel and have no documented import path. From the consumer's view they are effectively dead code. This is shipped DX debt, not a rc.4 regression — it's been latent at least since v1.0.0-rc.4 (2026-04-30) when `src/react/components/index.ts` was added without a matching public-barrel re-export. Plus three smaller drifts (`SDK_VERSION` literal, README version banner, INTEGRATION_GUIDE watermark) that should not survive an "evidence-based, no debt" lookback.

The rc.2-era P0+P1 wins all hold: 25/25 components have `className+style` (`MediaGallery.tsx:32-34` closes the rc.2 miss), 6/6 user-facing components use `forwardRef` named-function form, every public async surface accepts `signal` (37 hits across 13 files), `config.onError` plumbing is intact (5 `reportSoftError` call sites including the rc.3 `CodeEntry` fixup), 0 `any`, 0 `@ts-ignore`, README CI gate green. The shape is solid; the discoverability layer is the gap.

---

## Public surface inventory (per subpath)

Citations are file:line in `src/`. JSDoc column = is there a `/** ... */` block on the export site (yes / no / barrel-only). Example column = does `docs/INTEGRATION_GUIDE.md` show this symbol in code (yes / no).

### `.` (main barrel — `src/index.ts`)

| Symbol | Kind | Source | JSDoc | Example |
|---|---|---|---|---|
| `UniversalAuthConfig` | type | `src/config.ts:92` | yes (per-field) | yes (§6) |
| `initUniversalAuth` | async fn | `src/config.ts:234` | yes | yes (§3, §5b) |
| `SDK_VERSION` | const | `src/config.ts:225` | yes | no |
| `getAuth` | fn | `src/imperative/getAuth.ts:100` | yes | no (§5b uses React only) |
| `AuthClient` | type | `src/imperative/getAuth.ts:46` | yes (per method) | no |
| `ImperativeSessionSnapshot` | type | `src/imperative/getAuth.ts:41` | yes | no |
| `getAccessToken` | async fn | `src/core/token-manager.ts` (re-export) | yes | no |
| `getCurrentSessionId` | fn | `src/core/token-manager.ts` (re-export) | yes | no |
| `hasLiveAccessToken` | fn | `src/core/token-manager.ts` (re-export) | yes | no |
| `SessionTokens` | type | `src/core/token-manager.ts` (re-export) | yes | no |
| `setSession` (deprecated shim) | fn | `src/index.ts:52` | yes (`@deprecated`) | no |
| `AuthSdkError` | class | `src/errors.ts:25` | yes | no |
| 17 typed error subclasses | class | `src/errors.ts` | mixed (per-class brief) | no |
| `errorFromEnvelope` | fn | `src/errors.ts:274` | yes | no |
| `ProvisioningBlocker` | type | `src/errors.ts:58` | barrel-only | no |
| `AuthErrorEnvelope` | interface | `src/errors.ts:226` | yes | no |
| `Session`, `Identity`, `Persona`, `Entitlements`, `AgentContext`, `IdentityKind`, `SessionMeta` | types | `src/types/api.ts` | barrel-only | mixed |
| `requestCode` | async fn | `src/flows/code-flow.ts:54` | yes | no (form does it) |
| `verifyCode` | async fn | `src/flows/code-flow.ts:81` | yes | no |
| `RequestCodeInput`, `VerifyCodeInput` | types | `src/flows/code-flow.ts:18,25` | barrel | no |
| `verifyEnrollmentToken`, `activateEnrollment`, `parseEnrollmentTokenFromUrl` | async fns | `src/flows/enroll-flow.ts` | yes | partial |
| `EnrollVerifyResult`, `EnrollActivateInput`, `ConsentDocumentRef` | types | `src/flows/enroll-flow.ts` | barrel | no |
| `signOut`, `signOutEverywhere`, `listSessions`, `revokeSession` | async fns | `src/flows/recovery.ts` | yes | no |
| `ActiveSession` | type | `src/flows/recovery.ts:20` | barrel | no |
| `startImpersonation`, `endImpersonation`, `recordImpersonationAction`, `onLocalClearDrift` | fns | `src/flows/impersonation.ts` | yes | no |
| `StartImpersonationInput`, `ImpersonationDriftEvent` | types | `src/flows/impersonation.ts` | yes | no |
| `getPersonaRegistry`, `lookupPersona`, `PersonaRegistryEntry` | fns/type | `src/flows/persona-registry-client.ts` | yes | no |
| `recordPermissionGrant`, `requestAndRecord` | async fns | `src/flows/permission-grants.ts` | yes | no |
| `PermissionKey`, `PermissionState`, `RecordGrantInput` | types | `src/flows/permission-grants.ts` | barrel | no |
| `getConsentDocuments`, `bulkAcceptConsents`, `recordConsent`, `revokeConsent`, `listConsents` | async fns | `src/flows/consent.ts` | yes | partial (§5c) |
| `ConsentRecord`, `ListedConsent` | types | `src/flows/consent.ts` | yes | no |
| `isPasskeySupported`, `isConditionalUiSupported`, `registerPasskey`, `authenticatePasskey` | fns | `src/flows/passkey-flow.ts` | yes | partial |
| `RegisterPasskeyResult`, `AuthenticatePasskeyOptions`, `AuthenticatePasskeyResult` | types | `src/flows/passkey-flow.ts` | yes | no |
| `UniversalProfile` | type | re-export from `/profile` | barrel | no |
| `hasFeature`, `hasAppAccess`, `getEntitlementsSnapshot`, `refreshEntitlements`, `onEntitlementsChange` | fns | `src/core/entitlements.ts` | yes | no |
| `getSettings`, `getSettingsVersion`, `updateSettings`, `onSettingsChange`, `hydrateSettings`, `flushSettingsNow`, `applySettingsPatch`, `getPendingSettingsPatch`, `discardPendingSettingsPatch` | fns | `src/core/settings-sync.ts` | yes | no |
| `SettingsShape` | type | `src/core/settings-sync.ts` | barrel | no |
| `getSDKMetrics`, `SDKMetrics` | fn/type | `src/core/sdk-metrics.ts` | yes (§12.2 in INTEGRATION) | yes (§8) |
| `emitEvent` (alias of `emit`) | fn | `src/core/event-reporter.ts` | yes | no |
| `startSessionWatcher`, `stopSessionWatcher`, `startSessionEvents`, `stopSessionEvents`, `onSessionChange` | fns | `src/core/session-{watcher,events}.ts` + `src/core/token-manager.ts` | yes | no |
| `canAccess`, `canAccessBulk`, `invalidateAccessCache`, `onAccessChange` | fns | `src/core/abac.ts` | yes | no |
| `ResourceDescriptor`, `AccessCheck`, `AccessDecision`, `AccessDecisionEffect` | types | `src/core/abac.ts` | yes | no |

Counts (main barrel): ~52 runtime symbols + ~30 type-only symbols. Of the runtime symbols ≈ 7 appear in `INTEGRATION_GUIDE.md` code blocks (`initUniversalAuth`, `getSDKMetrics`, `useAuth` indirectly, `<SignInForm>` indirectly via §5a, `<ConsentVersionWatcher>` §5c, `<AuthProvider>` §3, register/authenticatePasskey §5b). The remaining ~45 runtime exports have **no example in INTEGRATION_GUIDE**. JSDoc coverage on public-export sites is high (almost every fn has at least a 1-3 line block); per-class brief docstrings on the 17 error subclasses.

### `./react` (`src/react/index.ts`)

| Symbol | Kind | Source | JSDoc | Example |
|---|---|---|---|---|
| `AuthProvider`, `AuthProviderProps` | component/type | `src/react/AuthProvider.tsx` | yes | yes (Quick Start) |
| `IdentityContext`, `EntitlementsContext`, `StatusContext` | React contexts | `src/react/AuthProvider.tsx` | barrel | no |
| `AuthStatus`, `IdentityContextValue`, `EntitlementsContextValue`, `StatusContextValue` | types | `src/react/AuthProvider.tsx` | barrel | no |
| `useAuth`, `UseAuthReturn` | hook/type | `src/react/useAuth.ts:41` | minimal (per-field) | yes (Quick Start) |
| `useEntitlements`, `UseEntitlementsReturn` | hook/type | `src/react/useEntitlements.ts:16` | minimal | no |
| `useProfile`, `UseProfileReturn`, `ProfileState` | hook/types | `src/react/useProfile.ts` | yes | no |
| `useImpersonation`, `UseImpersonationReturn` | hook/type | `src/react/useImpersonation.ts` | yes | no |
| `useSettingsSync`, `UseSettingsSyncReturn` | hook/type | `src/react/useSettingsSync.ts` | yes | no |
| `usePermissionGrants`, `UsePermissionGrantsReturn` | hook/type | `src/react/usePermissionGrants.ts` | yes | no |
| `useAccess`, `UseAccessReturn` | hook/type | `src/react/useAccess.ts` | yes | no |
| `useAccessBulk`, `UseAccessBulkReturn` | hook/type | `src/react/useAccessBulk.ts` | yes | no |
| `canAccess`, `canAccessBulk`, `invalidateAccessCache`, `ResourceDescriptor`, `AccessCheck`, `AccessDecision`, `AccessDecisionEffect` | re-exports from `core/abac.ts` | — | — | no |
| `useDelegatedGrants`, `UseDelegatedGrantsReturn` | hook/type | `src/react/useDelegatedGrants.ts` | yes | no |
| `ImpersonationDriftEvent` | type re-export | `src/flows/impersonation.ts` | barrel | no |
| `<SignInForm>`, `SignInFormProps` | component/type | `src/react/components/SignInForm.tsx:70` | yes | yes (§5a) |
| `<CodeEntry>`, `CodeEntryProps` | component/type | `src/react/components/CodeEntry.tsx:49` | yes | no |
| `<PasskeyPrompt>`, `PasskeyPromptProps` | component/type | `src/react/components/PasskeyPrompt.tsx:34` | yes | no |
| `<OfflineIndicator>`, `OfflineIndicatorProps` | component/type | `src/react/components/OfflineIndicator.tsx:17` | yes | no |
| `<ImpersonationBanner>`, `ImpersonationBannerProps` | component/type | `src/react/components/ImpersonationBanner.tsx:21` | yes | no |
| `<AppChooser>`, `AppChooserProps` | component/type | `src/react/components/AppChooser.tsx:38` | yes | no |
| `<PersonaChooser>`, `<PersonaGuard>`, `<AgentStatusBanner>` (+ Props) | components | various | yes | no |
| `<ConsentScreen>`, `DEFAULT_REQUIRED_CONSENTS`, `ConsentScreenProps`, `ConsentAudience` | component/data/types | `src/react/components/ConsentScreen.tsx` | yes | partial |
| `<ProfileSetupScreen>`, `ProfileSetupScreenProps`, `ProfileSetupMode` | component/types | `src/react/components/ProfileSetupScreen.tsx` | yes | no |
| `<AvatarPicker>`, `<ContactInfoForm>`, `<PersonaFieldsForm>`, `<ProfileCompletenessBar>` (+ Props) | components | various | yes | no |
| `<ConsentCenter>`, `<PermissionCenter>`, `<ConsentVersionWatcher>` (+ Props), `computeStale` | components | various | yes | partial (§5c) |
| `<DelegationCenter>`, `DelegationCenterProps` | component/type | `src/react/components/DelegationCenter.tsx` | yes | no |
| `crewScopeCatalog`, `homeownerScopeCatalog`, `subcontractorScopeCatalog`, `supplierScopeCatalog`, `architectScopeCatalog` | data | `src/react/components/scope-catalogs.ts` | barrel | no |
| `DelegatedGrant`, `Grantee`, `GranteeKind`, `GrantedVia`, `ScopeMeta`, `CreateDelegatedGrantInput`, `ListDelegatedGrantsResult` | types re-exported from `flows/delegation.ts` | — | yes (per-field) | no |

### `./react` — components present in `dist/` but **NOT exported from public barrel**

This is the discoverability gap. `src/react/components/index.ts` (`v1.0.0-rc.4`, 2026-04-30) exports the seven PCP components below, but `src/react/index.ts` does not re-export them, and `package.json:exports` does not expose `./react/components`. They build into `dist/esm/react/components/*.js` and have `.d.ts` files, but no documented import path.

| Symbol | Source | Status |
|---|---|---|
| `<MediaGallery>`, `MediaGalleryProps` | `src/react/components/MediaGallery.tsx:37` | unreachable from documented import paths |
| `<AddressInput>`, `AddressInputProps` | `src/react/components/AddressInput.tsx` | unreachable |
| `<VehicleSection>`, `VehicleSectionProps` | `src/react/components/VehicleSection.tsx` | unreachable |
| `<GearSection>`, `GearSectionProps` | `src/react/components/GearSection.tsx` | unreachable |
| `<ComplianceDocsSection>`, `ComplianceDocsSectionProps` | `src/react/components/ComplianceDocsSection.tsx` | unreachable |
| `<PropertySection>`, `PropertySectionProps` | `src/react/components/PropertySection.tsx` | unreachable |
| `<CompletenessBar>`, `CompletenessBarProps` | `src/react/components/CompletenessBar.tsx` | unreachable |
| `useIdentity` | `src/react/useIdentity.ts:225` | unreachable, but every PCP component above depends on it via internal import |

Verified with `Grep "PropertySection|VehicleSection|GearSection|ComplianceDocs|MediaGallery|AddressInput|CompletenessBar" src/react/index.ts` → 0 hits (only `ProfileCompletenessBar` matches partially). And `Grep "useIdentity" src/react/index.ts` → 0 hits. Consumer cannot import these by name. See **Debt inventory D1** below.

### `./sw` (`src/sw/index.ts`)

The SW subpath builds a standalone service-worker bundle (`dist/esm/sw/index.js`) that consumer apps serve at a fixed URL. Per `src/sw/index.ts:112` the file ends with `export {};` — there are **no public ESM exports**. The subpath is a build target, not an import target. `dist/types/sw/index.d.ts` is a type-empty stub. This is intentional (`src/sw/index.ts:13`: "BUILT as a standalone SW bundle") but worth noting in the inventory.

### `./profile` (`src/profile/index.ts`)

| Symbol | Kind | Source | JSDoc | Example |
|---|---|---|---|---|
| `UniversalProfile`, `EmergencyContact`, `PersonaExtensions` | types | `src/types/profile.ts` (re-export) | barrel | no |
| `PRESET_AVATARS`, `pickPresetForIdentity`, `findPresetByKey`, `PresetAvatar` | data/fns/type | `src/profile/presets.ts` | yes | no |
| `generateInitials`, `pickInitialsColor`, `resolveAvatar`, `compressJpeg`, `uploadAvatar`, `clearAvatar`, `INITIALS_COLORS`, `AvatarRender` | fns/data/type | `src/profile/avatar.ts` | yes | yes (`uploadAvatar` shown §1) |
| `validatePhone`, `validateEmail`, `requiredFieldsPresent`, `PhoneValidationResult`, `EmailValidationResult`, `RequiredCheckResult` | async fn / fns / types | `src/profile/validators.ts` | yes (`validatePhone` has full async-migration block) | no |
| `computeCompleteness`, `PERSONA_FIELD_ROSTERS`, `CompletenessResult`, `PersonaFieldRoster` | fn/data/types | `src/profile/completeness.ts` | yes | no |
| `getPersonaFieldsRegistry`, `getPersonaRoster`, `PersonaFieldsRegistry`, `PersonaFieldRosterFromServer`, `FieldDefinition`, `FieldType` | fns/types | `src/profile/persona-fields.ts` | yes | no |
| `getProfileSnapshot`, `onProfileChange`, `hydrateProfile`, `saveProfile`, `applyAvatarUpdate`, `applyProfilePatch`, `getPendingProfilePatch`, `ProfileState` | fns/type | `src/profile/profile-store.ts` | yes | no |

### `./extendability` (`src/extendability/index.ts`)

| Symbol | Kind | Source | JSDoc | Example |
|---|---|---|---|---|
| `NotificationChannelAdapter`, `NotificationDelivery`, `NotificationDeliveryResult` | types | `src/extendability/notification-channel.ts` | yes | no |
| `AuthFlowAdapter`, `AuthFlowChallenge`, `AuthFlowAssertion`, `AuthFlowAttestation` | types | `src/extendability/auth-flow.ts` | yes | no |
| `RiskSignalAdapter`, `RiskSignal`, `RiskScore` | types | `src/extendability/risk-signal.ts` | yes | no |
| `registerNotificationChannel`, `listNotificationChannels`, `getNotificationChannel`, `__resetExtendabilityForTests` | fns | `src/extendability/registry.ts` | yes | no |

`__resetExtendabilityForTests` is exported on the public surface — small surface-cleanliness debt (see D5).

### `./internal` (`src/internal/index.ts`)

| Symbol | Kind | Source |
|---|---|---|
| `setSession`, `SessionTokens` | fn / type | `src/core/token-manager.ts` |

Internal is intentionally minimal (the canonical home for `setSession`). The header in `src/internal/index.ts:1-11` documents its unstable contract clearly. ✓

---

## P0 + P1 + rc.3 DX wins — verification matrix

| # | Claim | Status | Evidence |
|---|---|---|---|
| 1 | All 25 React components have `className?: string` | **✓ verified** | Grep `className\?: string` → 25/25 files (`AddressInput`, `AgentStatusBanner`, `AppChooser`, `AvatarPicker`, `CodeEntry`, `CompletenessBar`, `ComplianceDocsSection`, `ConsentCenter`, `ConsentScreen`, `ContactInfoForm`, `DelegationCenter`, `GearSection`, `ImpersonationBanner`, `MediaGallery`, `OfflineIndicator`, `PasskeyPrompt`, `PermissionCenter`, `PersonaChooser`, `PersonaFieldsForm`, `PersonaGuard`, `ProfileCompletenessBar`, `ProfileSetupScreen`, `PropertySection`, `SignInForm`, `VehicleSection`) |
| 2 | All 25 React components have `style?: CSSProperties` | **✓ verified** | Same Grep, same 25 files |
| 3 | rc.3 fixed MediaGallery (was rc.2 outlier) | **✓ verified** | `MediaGallery.tsx:32-34` adds className+style; header `// v1.1.1 (P1-A fixup, 2026-05-06)` confirms |
| 4 | 6 user-facing components use `forwardRef` named-function form | **✓ verified** | `grep -lE "= forwardRef"` → SignInForm, CodeEntry, PasskeyPrompt, OfflineIndicator, ImpersonationBanner, AppChooser. All use `forwardRef<X, Y>(function Name(...) {...})` form (verified in SignInForm:70 and CodeEntry:49) |
| 5 | `<SignInForm defaultDestination + onDestinationChange>` wired | **✓ verified** | `SignInForm.tsx:51,53,77,87,170` |
| 6 | Every public async fn in flows + abac + entitlements + settings-sync accepts `signal?: AbortSignal` | **✓ mostly verified** | 37 hits across 13 files. Spot-checks: `requestCode:54-67`, `verifyCode:81-99`, `signOut:36-52`, `revokeSession:111-119`, `listSessions:98-105`, `canAccess:100-118`, `canAccessBulk:133-165`, `refreshEntitlements:312-321`, `flushSettingsNow:270-277`, `hydrateSettings:85-92`, `updateSettings:121-129`, `startImpersonation:131-142`, `endImpersonation:163-171`, `recordPermissionGrant:37-44`, `requestAndRecord:65-93`, `listPermissionGrants:119-129`, `revokePermissionGrant:140-148`, `getConsentDocuments:29`, `bulkAcceptConsents:47`, `recordConsent:60`, `revokeConsent:76`, `listConsents:96`, `listAllConsents:113`, `verifyEnrollmentToken:87-94`, `activateEnrollment:108-123`, `getPersonaRegistry:36`, `lookupPersona:63`, `registerPasskey:138-148`, `authenticatePasskey:221-270`, `listDelegatedGrants:111-117`, `createDelegatedGrant:130-147`, `revokeDelegatedGrant:164-171`, `exportGrantsAsJson:184-187`. Two surface-level holes remain — see D2. |
| 7 | rc.3 added `hydrateSettings`, `listDelegatedGrants`, `createDelegatedGrant`, `revokeDelegatedGrant`, `exportGrantsAsJson` — all signal-aware | **✓ verified** | 5/5 — `settings-sync.ts:85`, `delegation.ts:111,130,164,184` |
| 8 | `config.onError` wired through soft-fail sites | **✓ 5 sites** | Grep `reportSoftError` (calls only): `index.ts:55` (`setSession` shim), `token-manager.ts:355` (legacy refresh response), `token-manager.ts:460` (no navigator.locks), `client.ts:272` (DPoP fallback), `CodeEntry.tsx:87` (rc.3 fixup). Module at `src/core/error-hook.ts:40` runs hook in try/catch (lines 41-53), falls through to `console.warn` if no hook or hook throws. |

### One additional `console.warn` site (out-of-band of `reportSoftError`)

`src/core/error-hook.ts:49` does its own `console.warn` when the consumer's hook itself throws. That is correct (it's the pattern's own escape hatch) — flagging only because it's the one console.warn call that isn't part of `reportSoftError` itself.

---

## Type safety

- **`any` count: 0.** Grep `: any\b` in `src/` → 1 hit, but it's inside a comment line (`src/core/client.ts:41`: "Soft-fallback (`useDpop: 'auto'`): any DPoP-build error..." — the word "any" is English not TypeScript). Genuine `: any` annotations: zero. ✓
- **`@ts-ignore` count: 0.** ✓
- **`AuthErrorCode` literal-union type: NOT exported.** `AuthSdkError.code` remains typed as `readonly code: string` (`src/errors.ts:26`). The 17 codes (`AUTH_CODE_INVALID`, `AUTH_CODE_EXPIRED`, `AUTH_RATE_LIMITED`, `AUTH_SESSION_EXPIRED`, `AUTH_SESSION_REVOKED`, `PROVISIONING_INCOMPLETE`, `PLAN_SUSPENDED`, `FEATURE_NOT_ENTITLED`, `PASSKEY_UV_REQUIRED`, `DEVICE_UNRECOGNIZED`, `IDEMPOTENCY_KEY_REPLAY`, `APP_NOT_REGISTERED`, `UNKNOWN_EVENT_TYPE`, `VERSION_INCOMPATIBLE`, `MAINTENANCE_MODE`, `VALIDATION_PHONE_UNREACHABLE`, `CONSENT_REQUIRED`) are wired only as string literals in `errorFromEnvelope`'s switch (`src/errors.ts:281-308`). Consumers doing `if (e.code === '…')` get no autocomplete and no exhaustiveness check. P2-B in the rc.2 audit's recommendations. **Still open.**
- **Public-export shape stability:** `src/index.ts` and `src/react/index.ts` use named-only exports throughout. No `export *` from anything that could rotate (the only `export *` is `./errors.js`, which is a closed catalog of 17 typed classes). ✓
- **`exactOptionalPropertyTypes` discipline holds:** spot-check at `getAuth.ts:107` and `code-flow.ts:67` — both omit `signal: undefined` rather than passing it. Pattern is consistent.
- **Three remaining plain-`Error` throws on the React surface:** `useAuth.ts:45`, `useAuth.ts:60`, `useEntitlements.ts:19`. All three should be typed `AuthProviderMissingError` / similar. P2-A in the rc.2 audit recommendations. **Still open.** No other React-surface plain Errors found.

---

## Error handling completeness

- **`AuthSdkError` subclass hierarchy:** 17 subclasses present, all extending `AuthSdkError` (`src/errors.ts:69-215`). Each subclass passes a hardcoded code string to `super()`. `errorFromEnvelope` covers all 17 cases plus a default branch that wraps unknown codes as base `AuthSdkError`. ✓
- **`AuthProviderMissingError`:** **NOT implemented.** rc.2 audit listed this as P2-9 deferred. rc.4 still throws plain `new Error("…useAuth() called outside <AuthProvider>…")` at `useAuth.ts:45` and matching message at `useEntitlements.ts:19`. The `core/error-hook.ts` infrastructure is now in place, so wiring cost dropped to ~30 min, but it didn't land. **Still open.**
- **rc.3 fixup `CodeEntry` generic-error → onError pipe:** ✓ verified at `CodeEntry.tsx:87` (`reportSoftError(err)`) inside the non-`AuthSdkError` branch, with the comment block at lines 82-86 explaining the fix. UX banner at line 88 unchanged.
- **`switchActivePersona` throws plain Error** (`useAuth.ts:60`) for "persona not in identity's personas". Same class as the AuthProvider misuse — should be a typed `AuthSdkError` subclass with a code (`PERSONA_INVALID` or similar). Minor; no rc.2/rc.3 audit mention. New finding here.

---

## Documentation drift

### README.md

- **Quick-start works.** `pnpm verify:readme` ran clean: `verified 3 import statements (3 symbols) in README.md ✓`. ✓
- **`README.md:6` says version "v1.1.0-rc.3 — Post-rc.2 audit fixups (published 2026-05-06; composite audit score 8.4/10)"**. Drifted: package is `1.1.0-rc.4`. The README didn't get bumped when rc.4 was tagged. **Documentation drift.**
- **`README.md:8` claims "Tests: 614/614 pass; coverage 92.67% lines / 85.32% branches".** Drifted: rc.4 changelog (`docs/CHANGELOG.md:48`) reports `752/752 pass, coverage 90.44 / 83.74 / 92.77 / 90.44`. The 614/85.32 numbers were the v1.0.4 figures. **Documentation drift.**
- **`README.md:9` claims "core 11.93 KB / passkey 7.95 KB / sw 488 B"**. Drifted: rc.4 changelog (`docs/CHANGELOG.md:50`) reports `core 23.39 / react 36.21 / profile 15.29 / passkey-marginal 0.20 / sw 0.56 KB`. The README numbers are from rc.1 (closure-aware was pre-`size-check-closure.ts`). **Documentation drift.**
- **`README.md:46-51` "Package layout"**: 6 subpaths listed (`.`, `/react`, `/sw`, `/profile`, `/extendability`, `/internal`). Matches `package.json:17-43`. ✓ — but does NOT mention the existence of `/react/components` (which has 7 components nominally accessible in the package's PCP layer that are unreachable from documented import paths). Minor.

### INTEGRATION_GUIDE.md

- **Watermark v1.0.4 / 2026-05-04** (line 1). The doc covers v1.0.1 / v1.0.2 / v1.0.3 / v1.0.4 release notes (lines 11-31) but **does not mention v1.0.5, v1.1.0-rc.1, rc.2, rc.3, or rc.4**. That means: DPoP, SSE, ABAC, `useAccess`, `useAccessBulk`, `<DelegationCenter>`, `useDelegatedGrants`, scope catalogs, `useSettingsSync`, `hydrateSettings`, `applySettingsPatch`/`applyProfilePatch`, `validatePhone-async-migration`, `assertApiBaseUrlSafety`, `config.onError`, `defaultDestination` on `<SignInForm>`, classNames slot maps, `forwardRef` on user-facing components, and `signal` plumbing — none of these have an integration example.
- Verified: `Grep "v1.1.0-rc."` → 0 hits in INTEGRATION_GUIDE.md.
- **§3 quick-start example** still imports `getAuth` (line 78 of INTEGRATION_GUIDE) and shows `<AuthProvider>` + `useAuth` from `/react`. The shape is correct but matches v1.0.4's surface, not rc.4's expanded one.
- **No DPoP / SSE / ABAC / DelegationCenter / Settings / `onError` integration recipe.** This is the single largest documentation gap discovered in this re-audit.
- **No Sentry recipe.** rc.2 audit specifically called out the 3-line Sentry wiring as a strength; that recipe should land in INTEGRATION_GUIDE §8 — `Sentry shim (per spec §12.3)` exists at line 352 but doesn't reference `config.onError`.

### JSDoc completeness on public surface

- **`@example` blocks:** Grep `@example` in `src/` → **0 hits**. rc.2 audit listed this as concern 17 (P2-I deferred). **Still open.**
- Most public exports have a 1-3 line `/** ... */` describing intent. The error subclasses have brief one-liners. The `getAuth` interface methods have multi-line descriptions (`getAuth.ts:46-91`). `assertApiBaseUrlSafety` has a 19-line block (`config.ts:160-178`). Coverage is good for *what*; the gap is *how / when / why* via examples.

---

## Verb taxonomy & naming

- **`requestCode`/`verifyCode` standardized**: ✓ at the flow layer (`code-flow.ts:54,81`). ⚠ inconsistent at the React + imperative layers:
  - `useAuth.ts:35` aliases `signIn: typeof verifyCodeFlow` and exports both `requestCode` and `signIn` (= `verifyCode`). A consumer reading `useAuth().signIn(...)` thinks they're requesting a code; it's actually verifying one.
  - `getAuth.ts:54` defines `signIn(params: { destination, channel })` which delegates to `requestCode`. Same name, opposite operation.
  - Net: consumer who learns "signIn" from one surface gets the wrong mental model on the other. P2-C in rc.2 recommendations. **Still open.**
- **No deprecation tag** on either `signIn` alias yet. CHANGELOG rc.2 promised a "deprecate `useAuth().signIn`" but the function carries no `@deprecated` JSDoc as of rc.4 (`useAuth.ts:35`).
- **`hasPersona` (on `useAuth`) vs `hasFeature` (on `useEntitlements`):** Different hooks, similar API shape. rc.2 audit listed as concern 16. Reasonable architectural split (per `§8.4 context-split invariant` per `useAuth.ts:5`); the asymmetry is by design. ✓ kept.

---

## Imperative API gaps

- **`getAuth().getUser()` — NOT added.** P2-13 deferred. `getAuth().getSession()` returns only `{session_id, is_authenticated}` (`getAuth.ts:41-44`); the full `Identity` object is not reachable through the imperative client. The docstring at `getAuth.ts:38-40` explicitly tells consumers to "call `/auth/v1/me` via the React `useAuth()` hook or fetch flows directly" — meaning non-React consumers must hand-roll the call. **Still open.**
- **`getAuth().signOut()` accepts no `signal`.** `getAuth.ts:90` is `signOut(): Promise<void>`. The underlying `flows/recovery.ts:36 signOut(options)` does accept `signal`, so this is a parameter loss at the imperative-client surface. Minor (sign-out is rarely cancellable in practice).
- **`UseAuthReturn.signOut` and `.signOutEverywhere` typed `() => Promise<void>`** (`useAuth.ts:37-38`). Same issue — the underlying flows accept signal but the React-surface type erases it. The `signOutFlow` runtime can still be passed signals but TypeScript won't accept them through the hook's typed binding. Minor signal-erosion at the public hook layer.
- **No imperative `requestCode` shape mismatch:** `getAuth().signIn({destination, channel})` vs `useAuth().requestCode({destination, channel})` — same shape, different name. The name mismatch (P2-6 in rc.2 audit) is unresolved.

---

## Theming surface depth

| Component | `className` | `style` | `classNames` slot map | Slot keys |
|---|---|---|---|---|
| `<SignInForm>` | ✓ | ✓ | ✓ (`SignInForm.tsx:22-28,59`) | `root`, `label`, `input`, `error`, `button` |
| `<CodeEntry>` | ✓ | ✓ | ✓ (`CodeEntry.tsx:11-17,37`) | `root`, `label`, `input`, `error`, `button` |
| `<ContactInfoForm>` | ✓ | ✓ | ✓ (`ContactInfoForm.tsx:32`) | (verified import; same 5-key shape) |
| `<PersonaFieldsForm>` | ✓ | ✓ | ✓ (`PersonaFieldsForm.tsx:35`) | (verified; same 5-key shape) |
| Other 21 components | ✓ | ✓ | not applicable / not exposed | n/a |

All four form-style components carry the slot map. The mental model is consistent: same five slot names, same fallback semantics (`className ?? classNames?.root ?? 'bb-auth-…'` per `SignInForm.tsx:135` and `CodeEntry.tsx:98`). MUI/Chakra-grade for an auth SDK — strength preserved.

---

## rc.4 delta DX impact

- **`unsignedLegacyAdopted` removal:** Grep `unsignedLegacyAdopted` in `src/` → 0 hits. Was a module-level state flag in `core/entitlements.ts` set in 3 places and never read; pure dead state. Public observables: zero — it was never exported, never read, never logged. ✓ no consumer impact.
- **`eslint-plugin-react-hooks@5` install + removal of two `// eslint-disable-next-line` comments** at `useAccess.ts` and `useAccessBulk.ts`: zero runtime impact, zero typed-surface impact. ✓
- **Coverage threshold lowered 85→83 (branches only):** does not affect the public API; it's a CI gate. Worth a note in our debt inventory because it's tracked in `docs/BACKLOG.md` as COV-1.
- **Net rc.4 public-surface delta: zero.** This audit's score change is driven by previously-latent debt this review surfaces, not by anything rc.4 added or removed.

---

## Discoverability

- **`tsconfig` declarations emitted:** `dist/types/` exists with `.d.ts` files for every source file (verified `ls dist/types`). The build (`pnpm build`) produces both `dist/esm/` and `dist/types/`. ✓
- **Subpath imports resolve in IDE:** `dist/types/index.d.ts` matches `src/index.ts` re-exports verbatim. `dist/types/react/index.d.ts`, `dist/types/sw/index.d.ts`, `dist/types/profile/index.d.ts`, `dist/types/extendability/index.d.ts`, `dist/types/internal/index.d.ts` all present. `package.json:exports` "types" condition resolves each one. ✓
- **`./react/components` IS NOT in `package.json:exports`** but `dist/esm/react/components/*.js` and `dist/types/react/components/*.d.ts` are emitted. Consumers attempting `import { MediaGallery } from '@samjonaidi-ship-it/universal-auth/react/components'` get a `package.json:exports` block (default ESM resolution). They cannot reach the seven PCP components by their declared names. See D1.
- **`./react/styles.css`:** ✓ exposed; resolves to `./dist/esm/react/components/styles.css`. Verified `dist/esm/react/components/styles.css` exists.
- **`SDK_VERSION` literal drift:** `src/config.ts:225` `export const SDK_VERSION = '1.1.0-rc.3'`, but `package.json:3` is `"1.1.0-rc.4"`. The version stamped on every event + every outbound HTTP request is one rc behind. The comment at `config.ts:222-224` explicitly says "MUST be kept in sync with `package.json:version`" and the stale-stamp incident from v1.0.4 is mentioned in the docstring. Same class of bug, same module, again. P2-H ("auto-stamp from package.json") is the right fix; the manual maintenance contract is not being kept. **Telemetry-misattribution risk; documented in dev panel `getSDKMetrics()`.** See D3.

---

## Debt inventory

| ID | Severity | File:line | Issue | Consumer pain | Age | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| **D1** | **High** | `src/react/index.ts` (entire), `package.json:17-43` (no `./react/components` subpath) | 7 PCP React components (`MediaGallery`, `AddressInput`, `VehicleSection`, `GearSection`, `ComplianceDocsSection`, `PropertySection`, `CompletenessBar`) plus `useIdentity` hook are built into `dist/` but never re-exported from the public `react` barrel and have no documented import path. | Consumers can't import these by name; they appear nowhere in README or INTEGRATION_GUIDE; new BB Express PCP integrations have to either (a) add private deep-import escape hatches or (b) duplicate the components. | Latent since v1.0.0-rc.4 (2026-04-30) — `src/react/components/index.ts` was added without matching public re-export | (a) Re-export the seven components + `useIdentity` from `src/react/index.ts`, OR (b) add a `./react/components` subpath in `package.json:exports`. (a) keeps the single React subpath story simple. | 30 min |
| **D2** | Medium | `src/imperative/getAuth.ts:90`, `src/react/useAuth.ts:37-38` | `getAuth().signOut()`, `useAuth().signOut`, `useAuth().signOutEverywhere` typed without `signal?: AbortSignal`. Underlying `flows/recovery.ts:36,69` accept it; the public-surface types erase it. | TanStack-Query / SWR / Strict-Mode consumers can't cancel a sign-out the way they cancel everything else. Inconsistent with the rest of the rc.2 P1-D pass. | rc.2 (signal pass missed these at the React/imperative wrapper layer) | Two-line type widening on each surface; runtime already supports it. | 15 min |
| **D3** | Medium | `src/config.ts:225` | `SDK_VERSION = '1.1.0-rc.3'` literal while `package.json:3` is `'1.1.0-rc.4'`. | Telemetry from rc.4 in production gets attributed to rc.3 in the events table. Same class of bug as the v1.0.2→v1.0.4 incident the docstring explicitly references. | rc.4 (literal not bumped during the rc.3→rc.4 lint-fix pass) | Auto-stamp at build time from `package.json` (P2-H from rc.2 audit). One-line fix to push to rc.4 immediately, plus the build automation. | 5 min hotfix + ~1 h automation |
| **D4** | Medium | `README.md:6,8,9` | Version banner says rc.3, test count 614/614, bundle figures 11.93/7.95/0.488 KB — all from v1.0.4. Actual rc.4 numbers per CHANGELOG: 1.1.0-rc.4, 752/752, core 23.39/react 36.21/profile 15.29/passkey-marginal 0.20/sw 0.56 KB. | Consumer skimming the README forms wrong expectations and hits surprises (especially the bundle-size delta). | rc.4 release didn't bump README. | Update three lines. Consider a release-script step that rewrites these from CHANGELOG. | 5 min hotfix + 30 min automation |
| **D5** | Medium | `src/extendability/index.ts:33` | `__resetExtendabilityForTests` is exported on the public `./extendability` subpath. The double-underscore convention signals "test-only", but it's reachable from a documented consumer subpath. | Surface cleanliness — consumer autocomplete shows it. Misuse risk is small (the function only resets a Map). | v1.0.0-rc.1 | Move to `./internal` subpath OR rename without leading `__` and document it as a real reset hook. Easiest: gate behind `if (NODE_ENV !== 'production')` at module init. | 15 min |
| **D6** | Medium | `docs/INTEGRATION_GUIDE.md:1` | Watermark v1.0.4 / 2026-05-04. No mention of DPoP, SSE, ABAC, DelegationCenter, useAccess, useDelegatedGrants, useSettingsSync, hydrateSettings, validatePhone-async-migration, classNames slot maps, forwardRef, defaultDestination, signal plumbing, config.onError, assertApiBaseUrlSafety. The doc reflects a 4-rc-old surface. | New consumer following the guide misses 9 features and 1 breaking-change (`validatePhone` is now async). Audit's "READMEs match v1.1 API" check fails for the deeper integration doc. | rc.1 onward (every minor surface change since v1.0.4) | Add new section §10 "v1.1 surface additions" with 1-paragraph + 5-line example each for: DPoP toggle, SSE toggle, useAccess hook, DelegationCenter mount, config.onError → Sentry, validatePhone-async migration, signal/AbortController pattern. | 2 h |
| **D7** | Medium | `src/errors.ts:26` | `AuthSdkError.code` typed `string`, not a literal-union (`AuthErrorCode = 'AUTH_CODE_INVALID' \| 'AUTH_CODE_EXPIRED' \| ... \| 'CONSENT_REQUIRED'`). | Consumers writing `if (e.code === 'AUTH_CODE_INVALID')` get no autocomplete and no exhaustiveness on `switch(e.code)`. P2-B in rc.2 recommendations, still open. | v1.0.0-rc.1 | Add `export type AuthErrorCode = ...` union; type `AuthSdkError.code: AuthErrorCode \| string` (string for the unknown-code default branch in `errorFromEnvelope`). | 30 min |
| **D8** | Medium | `src/react/useAuth.ts:45,60`, `src/react/useEntitlements.ts:19` | Three plain `throw new Error(...)` sites on the React surface. P2-A from rc.2 audit. | Consumers can't programmatically discriminate "missing AuthProvider" from any other Error. Provider-mount bugs in production can't be caught by `if (e instanceof AuthProviderMissingError)`. | rc.1 onward | Add `AuthProviderMissingError extends AuthSdkError` (code `'AUTH_PROVIDER_MISSING'`); add `PersonaInvalidError` for `useAuth.ts:60`. Wire two lines per site. | 30 min |
| **D9** | Low | `src/react/useAuth.ts:35` | `signIn` aliased to `verifyCode` on `useAuth`, but `getAuth().signIn` aliases to `requestCode`. Same name, opposite operation across surfaces. | Consumer who learned the imperative API gets wrong mental model on the React API. | rc.1 onward | Deprecate both `signIn` aliases via `@deprecated` JSDoc; add `useAuth().verifyCode` + `getAuth().requestCode`. Schedule v1.2 removal of `signIn`. P2-C, still open. | 1 h |
| **D10** | Low | `src/index.ts` (entire), all exports | 0 `@example` JSDoc blocks across ~52 main-barrel runtime exports (Grep `@example` → 0). rc.2 audit P2-I (deferred). | IDE hovers show purpose but not usage. Discoverability lift is a one-line "show me an example" for consumers in editor. | rc.1 onward | Add 5-10-line `@example` blocks on the top-10 most-used: `initUniversalAuth`, `getAuth`, `requestCode`, `verifyCode`, `<SignInForm>`, `<CodeEntry>`, `useAuth`, `useEntitlements`, `canAccess`, `<DelegationCenter>`. | 4 h |
| **D11** | Low | `src/react/useAuth.ts` (entire) | `useAuth()` returns 12 fields and subscribes to 2 contexts. P2-12 from rc.2 audit. Splitting into `useAuthStatus()` + `useAuthIdentity()` would let `<header>`-style consumers avoid identity re-renders. | Components that only need `status` re-render on persona-switch / agent-context change. | rc.1 onward | Add `useAuthStatus()` (10-line hook). Don't break existing `useAuth()`. | 30 min |
| **D12** | Low | `src/react/useAuth.ts:60` | `switchActivePersona` throws plain `Error` (not `AuthSdkError`). | Consumer can't `instanceof` the persona-mismatch error. Out-of-pattern with the rest of the typed-error catalog. | rc.1 onward | Define `PersonaInvalidError extends AuthSdkError` with code `'PERSONA_INVALID'`. | 15 min |
| **D13** | Low | `src/react/components/scope-catalogs.ts` | Five `*ScopeCatalog` data exports (`crewScopeCatalog`, `homeownerScopeCatalog`, `subcontractorScopeCatalog`, `supplierScopeCatalog`, `architectScopeCatalog`) with no JSDoc on the export sites or in INTEGRATION_GUIDE. The shape `Record<string, ScopeMeta>` is known but the per-persona scope conventions (which scopes mean what) are not documented. | Consumers wiring `<DelegationCenter>` for a custom persona must reverse-engineer the catalog conventions. | v1.0.5 | One-paragraph table per catalog. | 1 h |
| **D14** | Low | `src/sw/index.ts:112` | `./sw` subpath has zero runtime exports (`export {}`). It's intentionally a build target, but the subpath behaves identically to a no-op import; an autocomplete user trying `import {…} from '@samjonaidi-ship-it/universal-auth/sw'` finds nothing. | Discoverability — confusing. | rc.1 | Note it explicitly in README "Package layout": "`/sw` is a build artifact only; consumer apps serve it as a static SW URL." | 5 min |
| **D15** | Low | `vitest.config.ts` | Branch-coverage gate dropped 85→83 in rc.4 (CHANGELOG line 36-39). Tracked as COV-1 in `docs/BACKLOG.md`. | Not directly DX; quality signal weakens until fixed. | rc.4 | Restore 85 by adding focused branch tests for `entitlements.ts:78.66%`, `storage.ts:72.88%`, `CodeEntry.tsx generic-error 57.89%`, passkey UV try/catch. v1.1.0 GA target. | 4 h |

---

## Recommendations (ranked, with effort)

1. **(D1, 30 min, High) Re-export the 7 PCP components + `useIdentity()` from `src/react/index.ts`.** Highest-leverage single fix in this audit. Closes the discoverability gap and makes the existing PCP work in `src/react/components/` actually consumable by name. Test: import each from `@samjonaidi-ship-it/universal-auth/react` in a smoke consumer, confirm types resolve.
2. **(D3 + D4, 10 min, Medium) Fix the three drift literals (SDK_VERSION, README version, README test/bundle stats).** Trivial hotfix; protects telemetry attribution.
3. **(D2, 15 min, Medium) Add `signal` parameter to `signOut`/`signOutEverywhere` on both `useAuth` return type and `getAuth()` AuthClient.** Runtime already supports it; this is a type-only widening.
4. **(D8, 30 min, Medium) `AuthProviderMissingError` + `PersonaInvalidError`.** With `error-hook.ts` infrastructure in place this is now low-cost. Closes rc.2 P2-A + D12 in one pass.
5. **(D7, 30 min, Medium) Export `AuthErrorCode` literal-union and re-type `AuthSdkError.code: AuthErrorCode`.** Big autocomplete win for consumers.
6. **(D6, 2 h, Medium) INTEGRATION_GUIDE.md §10 covering rc.1-rc.4 surface additions.** The largest doc gap. Even a thin pass (§10.1 DPoP toggle, §10.2 SSE toggle, §10.3 ABAC + useAccess, §10.4 DelegationCenter, §10.5 config.onError → Sentry, §10.6 validatePhone async migration, §10.7 signal/AbortController pattern) would close most of the deficit.
7. **(D9, 1 h, Low) Deprecate the two `signIn` aliases; introduce `useAuth().verifyCode` + `getAuth().requestCode`.** Plan removal in v1.2.
8. **(D11, 30 min, Low) `useAuthStatus()` hook.** Pure addition; doesn't touch `useAuth()`.
9. **(D5, 15 min, Low) Move `__resetExtendabilityForTests` off the public `./extendability` subpath.**
10. **(D10, 4 h, Low) `@example` JSDoc blocks on top-10 exports.** Highest-effort, lowest-urgency item. Lift IDE-hover quality.
11. **(D14, 5 min, Low) README note that `/sw` is a build target, not an importable subpath.**
12. **(D13, 1 h, Low) Per-catalog documentation for `scope-catalogs.ts`.**
13. **(D15, 4 h, Low) Restore branch-coverage gate to 85.**

**Top 5 (D1 + D3+D4 + D2 + D8 + D7), total ~2 hours**, would close the high+medium debt surfaced by this lookback and lift the score back to 8.5+. Top 6 (adding D6 INTEGRATION_GUIDE pass) gets it to ~9.0 because that's the largest single documentation gap blocking new-consumer adoption today.

---

*Audit performed 2026-05-08. All evidence file:line cited inline; all paths absolute under `C:\Users\samjo\Desktop\BB_Universal_Auth\`. Read-only; no source modifications. Verified against published `@samjonaidi-ship-it/universal-auth@1.1.0-rc.4` (commit `f7010e3`).*
