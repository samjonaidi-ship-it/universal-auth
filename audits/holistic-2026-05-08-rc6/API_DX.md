# API/DX Audit — rc.6 Lookback | 2026-05-08

## Score: 8.6 / 10  (rc.4: 8.0 / 10)

**Up +0.6 from rc.4 because rc.5 closed every High and four of the seven Medium debt items the rc.4 audit surfaced**: D1 PCP exports (8 symbols re-exported from `src/react/index.ts:132-168`), D2 `signOut` signal at the React-type boundary (`src/react/useAuth.ts:46-47`), D3 `SDK_VERSION` literal sync (`src/config.ts:231` now `'1.1.0-rc.6'`, gated by `pnpm verify:version-sync`), D7 `AuthErrorCode` literal union (`src/errors.ts:44-73`), D8 `AuthProviderMissingError` (`src/errors.ts:285-295`, wired into `useAuth` + `useEntitlements`), D6 INTEGRATION_GUIDE v1.1 capability section (`docs/INTEGRATION_GUIDE.md:32-101`).

**Why not 9.0+:** four mediums + four lows from the rc.4 ledger remain open (D2 imperative-side `getAuth().signOut()` still no signal at `src/imperative/getAuth.ts:90`; D5 `__resetExtendabilityForTests` still on the public `./extendability` surface at `src/extendability/index.ts:33`; D9 `signIn` aliasing inversion across React vs imperative at `useAuth.ts:42` vs `getAuth.ts:54`; D10 zero `@example` JSDoc; D11 no `useAuthStatus` split; D12 `switchActivePersona` still throws plain `Error` at `useAuth.ts:66`; D13 scope-catalog docs; D14 `/sw` README note; D15 branch-coverage 84 not 85). Plus one **new rc.6-introduced drift**: `README.md:6` banner still reads `v1.1.0-rc.5 — Post-rc.4 debt cleanup` while the published package is `1.1.0-rc.6`. Same class as rc.4's D4. Test-count and bundle figures *were* refreshed in rc.6, but the version banner line was not.

The rc.5 hardening is real — `AuthErrorCode` is now a usable literal union, `AuthProviderMissingError` lets consumers `instanceof`-check, the 8 PCP exports unblock new BB Express integrations. rc.6 is a tests-and-docs maintenance ship: `git diff --stat v1.1.0-rc.5..v1.1.0-rc.6 -- src/` touches only `src/config.ts` (4 lines, the SDK_VERSION literal) — zero public-API changes.

---

## Public surface inventory (per subpath)

Read against `dist/types/*.d.ts` (build output current — `stat` confirms `dist/types/index.d.ts` is newer than `src/index.ts`). All 6 declared subpaths in `package.json:17-42` build cleanly to both `dist/esm/*.js` and `dist/types/*.d.ts`. `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm verify:readme` exit 0 (`verified 3 import statements (3 symbols) in README.md ✓`).

### `.` (main barrel — `src/index.ts`, 186 lines)

Surface unchanged from rc.4. ~52 runtime symbols + ~30 type-only symbols, including:

| Group | Source | Notes |
|---|---|---|
| `UniversalAuthConfig`, `initUniversalAuth`, `SDK_VERSION` | `src/config.ts` | `SDK_VERSION = '1.1.0-rc.6'` at `:231` (synced via CI gate) |
| `getAuth`, `AuthClient`, `ImperativeSessionSnapshot` | `src/imperative/getAuth.ts:46,41` | unchanged from rc.4 |
| `getAccessToken`, `getCurrentSessionId`, `hasLiveAccessToken`, `SessionTokens` | `src/core/token-manager.ts` (re-export) | unchanged |
| `setSession` (deprecated shim) | `src/index.ts:52` | `@deprecated`, routes through `reportSoftError` |
| `AuthSdkError` + 17 typed subclasses | `src/errors.ts` | + `AuthProviderMissingError` (rc.5 D8, line 285) — **18 classes total** |
| `AuthErrorCode` literal union | `src/errors.ts:44-73` | rc.5 D7 — **22 explicit codes + `(string & {})` widening** |
| `errorFromEnvelope` | `src/errors.ts:354` | covers all 17 server-canonical (rc.4 unchanged) |
| `ProvisioningBlocker`, `AuthErrorEnvelope` | `src/errors.ts:115,306` | unchanged |
| `Session`, `Identity`, `Persona`, `Entitlements`, `AgentContext`, `IdentityKind`, `SessionMeta` | `src/types/api.ts` | unchanged |
| `requestCode`, `verifyCode` (+ Input types) | `src/flows/code-flow.ts:54,81` | unchanged |
| `verifyEnrollmentToken`, `activateEnrollment`, `parseEnrollmentTokenFromUrl` | `src/flows/enroll-flow.ts` | unchanged |
| `signOut`, `signOutEverywhere`, `listSessions`, `revokeSession`, `ActiveSession` | `src/flows/recovery.ts` | unchanged |
| `startImpersonation`, `endImpersonation`, `recordImpersonationAction`, `onLocalClearDrift` (+ types) | `src/flows/impersonation.ts` | unchanged |
| `getPersonaRegistry`, `lookupPersona`, `PersonaRegistryEntry` | `src/flows/persona-registry-client.ts` | unchanged |
| `recordPermissionGrant`, `requestAndRecord` (+ types) | `src/flows/permission-grants.ts` | unchanged |
| `getConsentDocuments`, `bulkAcceptConsents`, `recordConsent`, `revokeConsent`, `listConsents` (+ types) | `src/flows/consent.ts` | unchanged |
| `isPasskeySupported`, `isConditionalUiSupported`, `registerPasskey`, `authenticatePasskey` (+ types) | `src/flows/passkey-flow.ts` | unchanged |
| `UniversalProfile` | re-export from `src/types/profile.ts` | unchanged |
| `hasFeature`, `hasAppAccess`, `getEntitlementsSnapshot`, `refreshEntitlements`, `onEntitlementsChange` | `src/core/entitlements.ts` | unchanged |
| `getSettings`, `getSettingsVersion`, `updateSettings`, `onSettingsChange`, `hydrateSettings`, `flushSettingsNow`, `applySettingsPatch`, `getPendingSettingsPatch`, `discardPendingSettingsPatch`, `SettingsShape` | `src/core/settings-sync.ts` | unchanged |
| `getSDKMetrics`, `SDKMetrics`, `emitEvent`, `startSessionWatcher`, `stopSessionWatcher`, `startSessionEvents`, `stopSessionEvents`, `onSessionChange` | `src/core/*.ts` | unchanged |
| `canAccess`, `canAccessBulk`, `invalidateAccessCache`, `onAccessChange` (+ ABAC types) | `src/core/abac.ts` | unchanged |

`dist/types/index.d.ts` is in sync (build output reads from same exports map).

### `./react` (`src/react/index.ts`, 168 lines)

**The rc.5-added 8 PCP symbols are confirmed in built output:**

| Symbol | `src/react/index.ts` line | `dist/types/react/index.d.ts` line | Status |
|---|---|---|---|
| `useIdentity`, `UseIdentityReturn`, `IdentityState` | 136-140 | 34 | ✓ exported |
| `MediaGallery`, `MediaGalleryProps` | 141-144 | 35 | ✓ exported |
| `AddressInput`, `AddressInputProps` | 145-148 | 36 | ✓ exported |
| `VehicleSection`, `VehicleSectionProps` | 149-152 | 37 | ✓ exported |
| `GearSection`, `GearSectionProps` | 153-156 | 38 | ✓ exported |
| `ComplianceDocsSection`, `ComplianceDocsSectionProps` | 157-160 | 39 | ✓ exported |
| `PropertySection`, `PropertySectionProps` | 161-164 | 40 | ✓ exported |
| `CompletenessBar`, `CompletenessBarProps` | 165-168 | 41 | ✓ exported |

D1 from the rc.4 audit is fully closed.

**Other React-subpath surface (unchanged from rc.4):**

| Symbol | Source | Confirmed in `dist/types/react/index.d.ts` |
|---|---|---|
| `AuthProvider` + 3 contexts + 4 context-value types + `AuthProviderProps` | `AuthProvider.tsx` | line 1 |
| `useAuth`, `UseAuthReturn` | `useAuth.ts` | line 2 |
| `useEntitlements`, `UseEntitlementsReturn` | `useEntitlements.ts` | line 3 |
| `useProfile`, `UseProfileReturn`, `ProfileState` | `useProfile.ts` | line 4 |
| `useImpersonation`, `UseImpersonationReturn` | `useImpersonation.ts` | line 5 |
| `ImpersonationDriftEvent` | re-export from flows | line 6 |
| `useSettingsSync`, `UseSettingsSyncReturn` | `useSettingsSync.ts` | line 7 |
| `usePermissionGrants`, `UsePermissionGrantsReturn` | `usePermissionGrants.ts` | line 8 |
| `useAccess`, `UseAccessReturn` | `useAccess.ts` | line 9 |
| `useAccessBulk`, `UseAccessBulkReturn` | `useAccessBulk.ts` | line 10 |
| `canAccess`, `canAccessBulk`, `invalidateAccessCache` + 4 ABAC types | re-export from `core/abac.ts` | line 11 |
| 16 components: `SignInForm`, `CodeEntry`, `PasskeyPrompt`, `OfflineIndicator`, `ImpersonationBanner`, `AppChooser`, `PersonaChooser`, `PersonaGuard`, `AgentStatusBanner`, `ConsentScreen` (+ `DEFAULT_REQUIRED_CONSENTS`), `ProfileSetupScreen`, `AvatarPicker`, `ContactInfoForm`, `PersonaFieldsForm`, `ProfileCompletenessBar`, `ConsentCenter`, `PermissionCenter`, `ConsentVersionWatcher` (+ `computeStale`), `DelegationCenter` | various | lines 12-31 |
| `useDelegatedGrants`, `UseDelegatedGrantsReturn` | `useDelegatedGrants.ts` | line 30 |
| 5 scope-catalog data exports | `scope-catalogs.ts` | line 32 |
| 7 delegation type re-exports | re-export from `flows/delegation.ts` | line 33 |

Total `./react` count: 25 components + 11 hooks + ABAC re-exports + types ≈ 60 named exports.

### `./sw` (`src/sw/index.ts`, 112 lines)

Unchanged from rc.4. Build target only — `src/sw/index.ts:112` ends with `export {};`. `dist/types/sw/index.d.ts` is a type-empty stub. The subpath is intentionally a build artifact (header at `:10-12`: "BUILT as a standalone SW bundle"). Still no README note that this isn't an importable subpath (D14, open).

### `./profile` (`src/profile/index.ts`, 64 lines)

Unchanged from rc.4. Re-exports `UniversalProfile`, `EmergencyContact`, `PersonaExtensions` types + 6 modules' worth of validators / completeness / persona-fields / profile-store / avatar primitives.

### `./extendability` (`src/extendability/index.ts`, 34 lines)

Unchanged from rc.4. Re-exports 3 adapter interfaces + 4 registry functions, of which `__resetExtendabilityForTests` (line 33) is **still on the public surface** — D5 from rc.4 audit, open.

### `./internal` (`src/internal/index.ts`, 13 lines)

Unchanged. Single re-export pair: `setSession`, `SessionTokens`. Header explicitly documents the unstable contract. ✓

---

## DX wins verification matrix (P1 + rc.3 + rc.5 + rc.6)

| # | Claim | Status | Evidence |
|---|---|---|---|
| 1 | All 25 React components have `className?: string` | **✓ verified** | `grep -lE "className\?: string" src/react/components/*.tsx \| wc -l` → **25** |
| 2 | All 25 React components have `style?: CSSProperties` | **✓ verified** | `grep -lE "style\?: (CSSProperties\|React.CSSProperties)" src/react/components/*.tsx \| wc -l` → **25** |
| 3 | 6 user-facing components use named-function `forwardRef` | **✓ verified** | `grep -lE "= forwardRef" src/react/components/*.tsx` → SignInForm, CodeEntry, PasskeyPrompt, OfflineIndicator, ImpersonationBanner, AppChooser. Spot-check: `SignInForm.tsx:70` `forwardRef<HTMLFormElement, SignInFormProps>(`; `CodeEntry.tsx:49` same shape |
| 4 | `<SignInForm defaultDestination + onDestinationChange>` wired | **✓ verified** | `SignInForm.tsx:51,53,77-78,87,170` |
| 5 | All public async fns in flows + abac + entitlements + settings-sync + delegation accept `signal?` | **✓ verified** | 36 hits across the 8 modules. Spot checks: `code-flow.ts:56,83`; `consent.ts:31,49,63,78,97,114`; `delegation.ts:112,132,166,185`; `enroll-flow.ts:87,108`; `impersonation.ts:133,164`; `passkey-flow.ts:138`; `permission-grants.ts:39,67,121,143`; `persona-registry-client.ts:37,65`; `recovery.ts:37,70,99,113`; `abac.ts:103,135`; `entitlements.ts:334`; `settings-sync.ts:86,123,196,271` |
| 6 | rc.3-added `hydrateSettings`, `listDelegatedGrants`, `createDelegatedGrant`, `revokeDelegatedGrant`, `exportGrantsAsJson` all signal-aware | **✓ verified** | `settings-sync.ts:86`, `delegation.ts:111-112,132,166,185` |
| 7 | `config.onError` wired through soft-fail sites | **✓ 5 sites** | `grep -rn "reportSoftError" src/`: `index.ts:55` (deprecation shim); `core/token-manager.ts:355,460` (legacy refresh response, no navigator.locks); `core/client.ts:272` (DPoP fallback); `react/components/CodeEntry.tsx:87` (rc.3 generic-error pipe). Hook plumbing at `core/error-hook.ts:40` |
| 8 | rc.5 D1 — 7 PCP components + `useIdentity` re-exported | **✓ verified** | `src/react/index.ts:132-168` rc.5 audit-fix block. 8/8 symbols also present in `dist/types/react/index.d.ts:34-41` |
| 9 | rc.5 D2 — `signOut` / `signOutEverywhere` accept `signal?` at `useAuth` boundary | **✓ partially verified** | `useAuth.ts:46-47` `signOut: (options?: { signal?: AbortSignal }) => Promise<void>; signOutEverywhere: (options?: { signal?: AbortSignal }) => Promise<void>;`. **Imperative side still missing** — `getAuth.ts:90` `signOut(): Promise<void>;` no signal param. See **D2-imp** below. |
| 10 | rc.5 D7 — `AuthErrorCode` literal union | **✓ verified** | `src/errors.ts:44-73`. 22 explicit codes (15 §3.7 + 2 v1.4.0 + 4 SDK-internal soft-fail + `AUTH_PROVIDER_MISSING` + `UNKNOWN`) + `(string & {})` widening fallback at line 73. `AuthSdkError.code: AuthErrorCode` at line 83 |
| 11 | rc.5 D8 — `AuthProviderMissingError` | **✓ verified, with caveat** | `src/errors.ts:285-295` defines class. Wired in `useAuth.ts:23,54` (`throw new AuthProviderMissingError('useAuth')`) and `useEntitlements.ts:12,24` (`throw new AuthProviderMissingError('useEntitlements')`). **Caveat:** rc.5_VERIFICATION.md claimed `useProfile` was wired too, but `useProfile.ts` doesn't directly throw — it inherits `useAuth()`'s throw transitively (`useProfile.ts:39` `const { activePersona } = useAuth();`). This is fine in practice (you cannot get to `useProfile` without going through `useAuth`); just a doc-vs-impl mismatch. |
| 12 | rc.6 — pure tests + docs ship, no runtime API change vs rc.5 | **✓ verified** | `git diff --stat v1.1.0-rc.5..v1.1.0-rc.6 -- src/` → only `src/config.ts` (4 lines: `SDK_VERSION` bump rc.5 → rc.6 + watermark). Zero public-surface delta. |

---

## Type safety

- **`any` count: 0.** `grep -rnE ": any[^a-zA-Z_]\|<any>\|as any\b" src/` → 0 hits (matches rc.4's clean count). ✓
- **`@ts-ignore` count: 0.** `grep -rn "@ts-ignore\|@ts-expect-error\|@ts-nocheck" src/` → 0 hits. ✓
- **`AuthErrorCode` exhaustiveness — partial.** `src/errors.ts:44-73` exports the literal union with all 22 explicit codes. **However, the trailing `\| (string & {})` widening fallback at line 73 means `switch (err.code)` cannot be made exhaustive.** Verified by writing a TS test file with `case` arms for all 22 codes and a `const _exhaustive: never = c;` final assertion: TS compiler errors with `Type 'string & {}' is not assignable to type 'never'` (TS2322). Consumers gain autocomplete + literal-type inference for the canonical 22, but the `default:` branch remains structurally required. This is a deliberate forward-compat tradeoff documented in the union's JSDoc at `errors.ts:30-43` — but the *cost* (no exhaustiveness) is not called out and consumers shouldn't expect it. See **D7-fu** in debt inventory.
- **17 server-canonical codes still typed with classes.** `errorFromEnvelope` (`errors.ts:354`) covers all 17 cases: 15 from §3.7 + `VALIDATION_PHONE_UNREACHABLE` + `CONSENT_REQUIRED`. ✓ unchanged from rc.4.
- **5 SDK-internal codes admitted by union but NOT classed.** `DPOP_FALLBACK`, `LEGACY_REFRESH_RESPONSE`, `NO_NAVIGATOR_LOCKS`, `CNF_JKT_MISMATCH`, `AUTH_PROVIDER_MISSING`. Of these, only `AUTH_PROVIDER_MISSING` has a class (`AuthProviderMissingError`, `errors.ts:285`). The other 4 are constructed as **plain `new Error('CODE: message ...')` objects** at `core/client.ts:269` (DPoP), `core/token-manager.ts:331,354,461` (CNF, LEGACY, NO_LOCKS) — the code is a string prefix in the message, not the `.code` field of an `AuthSdkError`. **Inconsistency:** the union admits these codes, but no `AuthSdkError` actually carries them. Consumers writing `if (err instanceof AuthSdkError && err.code === 'DPOP_FALLBACK')` will never match. See **D7-fu**.
- **Public-export shape stability:** `src/index.ts` named-only exports throughout. The only `export *` is `./errors.js` (line 67) — closed catalog of 18 typed classes, monotonic growth only. ✓
- **`exactOptionalPropertyTypes` discipline holds.** Spot-check at `getAuth.ts:107-108` (channel) and `errors.ts:357-359` (envelope opts) both omit-on-undefined rather than passing `undefined` literals. Pattern consistent.
- **One remaining plain-`Error` throw on the React surface:** `useAuth.ts:66` `throw new Error(\`Persona '${personaType}' not in this identity's personas\`)`. **D12 from rc.4 audit, still open.** This is not the AuthProvider-missing case — it's the persona-mismatch case. Consumers can't `instanceof PersonaInvalidError`-check.
- **5 hooks don't guard against missing AuthProvider:** `useImpersonation`, `useAccess`, `useAccessBulk`, `useSettingsSync`, `usePermissionGrants`, `useDelegatedGrants` (verified via `grep -nE "useContext\|useAuth\|...Context" src/react/use*.ts`). They read from singleton stores rather than React contexts, so they don't need an AuthProvider — that's deliberate architecture. `useIdentity` (`useIdentity.ts:226`) DOES use `useAuth()` and so transitively throws `AuthProviderMissingError` when called outside provider. Consistent design.

---

## Error handling completeness

- **18 typed error classes, all extending `AuthSdkError`** (rc.4 had 17; rc.5 added `AuthProviderMissingError`). Per-class breakdown:
  - 15 §3.7 server-canonical: `AuthCodeInvalid`, `AuthCodeExpired`, `AuthRateLimited`, `AuthSessionExpired`, `AuthSessionRevoked`, `ProvisioningIncomplete`, `PlanSuspended`, `FeatureNotEntitled`, `PasskeyUVRequired`, `DeviceUnrecognized`, `IdempotencyKeyReplay`, `AppNotRegistered`, `UnknownEventType`, `VersionIncompatible`, `MaintenanceMode`
  - 2 v1.4.0: `ValidationPhoneUnreachable`, `ConsentRequired`
  - 1 SDK-only: `AuthProviderMissingError`
- **Every server-canonical code mapped in `errorFromEnvelope` (`errors.ts:354-389`):** 17/17 cases plus a `default` branch that wraps unknown codes as base `AuthSdkError`. ✓
- **Cross-reference: 5 codes in the union are NOT classed.** `DPOP_FALLBACK`, `LEGACY_REFRESH_RESPONSE`, `NO_NAVIGATOR_LOCKS`, `CNF_JKT_MISMATCH` — constructed as `new Error('CODE: ...')` (plain Error with string prefix in message). `UNKNOWN` — used in `useAccess.ts:57` and `useAccessBulk.ts:58` as `new AuthSdkError('UNKNOWN', String(err))` for the wrap branch. So `UNKNOWN` does become an `AuthSdkError.code` value; the other 4 don't. This typed-vs-message-prefix split is unintuitive — see **D7-fu**.
- **`AuthProviderMissingError` wired into 2 hooks:** `useAuth.ts:54` + `useEntitlements.ts:24`. Other hooks that read context (`useImpersonation`, etc.) read singleton stores instead, so they don't need it. `useIdentity` and `useProfile` both wrap `useAuth()` and inherit its throw. **No other hook should throw `AuthProviderMissingError` than these two** — design is clean.
- **rc.3 fixup `CodeEntry` generic-error → onError pipe:** ✓ still wired at `CodeEntry.tsx:87` (`reportSoftError(err)` inside the non-`AuthSdkError` catch branch).
- **`switchActivePersona` still throws plain Error** (`useAuth.ts:66`) for "persona not in identity's personas". D12 from rc.4 audit. Cost: consumer can't `instanceof PersonaInvalidError`-check; falls to message-string matching.

---

## Documentation drift

### README.md

- **Quick-start works.** `pnpm verify:readme` returns `verified 3 import statements (3 symbols) in README.md ✓`. ✓
- **`README.md:6` says `**v1.1.0-rc.5 — Post-rc.4 debt cleanup**` but `package.json:3` is `1.1.0-rc.6`.** The version banner was not bumped when rc.6 shipped. **NEW drift in rc.6** — same class as rc.4's D4. The CHANGELOG narrative (rc.6 = "COV-1 finish + audit-followup housekeeping") is correct, but the README didn't get the line. Severity: low (consumers reading the README see a one-rc-old descriptor). See **D-rc6-banner** below.
- **`README.md:8` test count + branches refreshed in rc.6.** Now reads `Tests: 823/823 pass; coverage 90.72% lines / 84.72% branches / 92.81% functions / 90.72% statements (branch threshold currently 84; COV-1 backlog item tracks the final 0.28pp to 85 by GA)`. Matches rc.6 CHANGELOG (`docs/CHANGELOG.md:11-29`). ✓
- **`README.md:9` bundle figures still match rc.5 numbers** (`core 23.39 KB / react 36.21 KB / profile 15.29 KB / passkey-flow lazy-marginal 0.20 KB / sw 0.56 KB`). rc.6 changelog notes: "no change vs rc.5" for bundles. ✓
- **`README.md:46-51` Package layout** lists 6 subpaths (`.`, `/react`, `/sw`, `/profile`, `/extendability`, `/internal`). Matches `package.json:17-42`. ✓ Still no note that `/sw` is a build artifact only (D14, open).

### INTEGRATION_GUIDE.md

- **Watermark says `v1.1.0-rc.5 | 2026-05-08`** (line 1) — drifted at rc.6, but only by the version literal. The §32-101 v1.1 capability section is still accurate: rc.6 is a tests-and-docs-only ship per CHANGELOG. The 15 capability examples (DPoP, ABAC, DelegationCenter, defaultDestination, theming, AbortSignal, config.onError, hydrateSettings, useIdentity + PCP, AuthErrorCode + AuthProviderMissingError, bundle wins, assertApiBaseUrlSafety, entitlements HMAC, device ID, WebAuthn UV/UP) all match the actual exported API.
- **Spot-check rc.5 D6 fix items against actual surface:**
  - **§32 item 9 PCP example** imports `useIdentity, MediaGallery, AddressInput, VehicleSection` from `@samjonaidi-ship-it/universal-auth/react` — verified all 4 in `dist/types/react/index.d.ts:34-37`. ✓
  - **§32 item 4 SignInForm** uses `defaultDestination` + `onDestinationChange` — both present in `SignInForm.tsx:51,53`. ✓
  - **§32 item 6 AbortSignal** example calls `await requestCode(destination, { signal })` and `await listDelegatedGrants({ signal })` — `requestCode` accepts `signal` at `code-flow.ts:56`; `listDelegatedGrants` at `delegation.ts:111-112`. ✓
  - **§32 item 7 `config.onError`** — example wires the hook in `initUniversalAuth(...)`. `UniversalAuthConfig.onError` typed in `src/config.ts` (per the rc.4 audit), routes through `core/error-hook.ts:40 reportSoftError`. ✓
  - **§32 item 10 `AuthErrorCode` + `AuthProviderMissingError`** — both verified above. ✓
- **JSDoc completeness on rc.5/rc.6-added public symbols:**
  - `useIdentity` (`useIdentity.ts:225`) — **no `/** ... */` block on the export site.** The file header explains the hook (lines 1-17), but nothing on the function or the `UseIdentityReturn` interface (line 161). Per-method docs inside the interface are minimal-to-absent (32 fields, ~5 have one-line comments).
  - `MediaGalleryProps` (`MediaGallery.tsx:16-35`) — **per-field JSDoc, no top-level component docstring.** Same for `AddressInputProps`, `VehicleSectionProps`, `GearSectionProps`, `ComplianceDocsSectionProps`, `PropertySectionProps`, `CompletenessBarProps`. Discoverable in IDE hover at field level; component-level intent has to be inferred from the file header.
  - `AuthErrorCode` (`errors.ts:30-43`) — **good JSDoc** with example `switch` block (one-of-the-few `@example`-equivalent in the codebase, though it doesn't use the `@example` tag).
  - `AuthProviderMissingError` (`errors.ts:276-284`) — **good JSDoc** explaining when it throws.
- **`@example` JSDoc tags:** `grep -rn "@example" src/` → still 0 hits. D10 from rc.4 audit, open.

### docs/CHANGELOG.md rc.5/rc.6 entries

- **rc.6 entry (`CHANGELOG.md:11-67`):** accurate. Lists 3 new branch-test files + per-file branch-coverage delta + global delta (823/823 tests, 84.72% branches). Migration note ("Drop-in replacement. Zero source-code changes outside `package.json`, `src/config.ts:231` (SDK_VERSION literal), and the new test files.") matches `git diff --stat`.
- **rc.5 entry** — verified by `audits/holistic-2026-05-08-rc4/rc5_VERIFICATION.md` (committed at `4e16c5d`). 14/14 audit items + 4/4 supplemental clean.

---

## Verb taxonomy & naming

Unchanged from rc.4 — **no rc.5/rc.6 changes.** Two unresolved naming asymmetries:

- **`requestCode/verifyCode` standardized at flow layer** (`code-flow.ts:54,81`); ⚠ inconsistent at React + imperative layers:
  - `useAuth().signIn` (line 90 of useAuth.ts, returned from line 42) **= `verifyCodeFlow`**
  - `getAuth().signIn(params)` (line 104 of getAuth.ts) **delegates to `requestCode`**
  - **Same name, OPPOSITE operation across the two consumer surfaces.** D9 from rc.4 audit, open.
- **No `@deprecated` JSDoc on either `signIn` alias.** rc.2 CHANGELOG promised deprecation; rc.6 still ships clean (un-deprecated).
- **`useAuth().requestCode`** (line 91) DOES exist alongside `signIn` — so consumers have a name-aligned escape hatch, just no enforced-via-deprecation path off the inverted alias.

`hasPersona` (useAuth) vs `hasFeature` (useEntitlements) split per §8.4 context-split invariant — unchanged, still correct by design.

---

## Imperative API gaps

- **`getAuth().getUser()` — STILL NOT added.** `getAuth().getSession()` (`getAuth.ts:69,116-125`) returns `{session_id: string|null, is_authenticated: boolean}` only. The full `Identity` object is unreachable through the imperative client. Docstring at `getAuth.ts:38-39` still tells consumers to "call `/auth/v1/me` via the React `useAuth()` hook or fetch flows directly." **D-imp-getUser** below.
- **`getAuth().signOut()` accepts no `signal`** (`getAuth.ts:90`: `signOut(): Promise<void>;`). The underlying `flows/recovery.ts:36 signOut(options)` accepts `{signal}`; the imperative wrapper drops it. **D2-imp** in debt inventory — D2 was only half-fixed in rc.5 (React side wired at `useAuth.ts:46`, imperative side missed).
- **`UseAuthReturn.signOut` and `.signOutEverywhere` typed `(options?: { signal?: AbortSignal }) => Promise<void>`** — confirmed at `useAuth.ts:46-47`. ✓ React side is good.
- **Naming asymmetry**: `getAuth().signIn({destination, channel})` calls `requestCode`; `useAuth().signIn` IS `verifyCode`. D9.

---

## Theming surface depth

| Component group | `className` | `style` | `classNames` slot map | Slot keys |
|---|---|---|---|---|
| `<SignInForm>` | ✓ (51) | ✓ | ✓ (`SignInForm.tsx:59`) | `root`, `label`, `input`, `error`, `button` |
| `<CodeEntry>` | ✓ | ✓ | ✓ (`CodeEntry.tsx:37`) | same 5 |
| `<ContactInfoForm>` | ✓ | ✓ | ✓ (`ContactInfoForm.tsx:32`) | same 5 |
| `<PersonaFieldsForm>` | ✓ | ✓ | ✓ (`PersonaFieldsForm.tsx:35`) | same 5 |
| 14 other non-form components (`PasskeyPrompt`, `OfflineIndicator`, `ImpersonationBanner`, `AppChooser`, `PersonaChooser`, `PersonaGuard`, `AgentStatusBanner`, `ConsentScreen`, `ProfileSetupScreen`, `AvatarPicker`, `ProfileCompletenessBar`, `ConsentCenter`, `PermissionCenter`, `ConsentVersionWatcher`) | ✓ | ✓ | n/a | n/a |
| `<DelegationCenter>` | ✓ | ✓ | n/a | n/a |
| **7 PCP components** (`MediaGallery`, `AddressInput`, `VehicleSection`, `GearSection`, `ComplianceDocsSection`, `PropertySection`, `CompletenessBar`) | ✓ | ✓ | **none** | n/a |

**Form-style slot maps unchanged from rc.4.** The 4 form components keep the same 5-key shape and fallback semantics (`className ?? classNames?.root ?? 'bb-auth-…'`).

**The 7 PCP components only expose `className + style`** (verified — `grep -lE "classNames\?:" src/react/components/MediaGallery.tsx ... CompletenessBar.tsx` → 0 matches, and field-level inspection of `MediaGallery.tsx:16-35` confirms only `className?: string` + `style?: CSSProperties`). Consumers with multi-slot Tailwind/Emotion needs (e.g., `<MediaGallery>`-as-tile-grid with custom upload-tile styling) have to wrap-and-recompose. Consistent with `<DelegationCenter>` (also no classNames map), but **inconsistent with the form-components contract** — and the PCP components have a much richer subtree (gallery, upload tile, delete buttons, error region) than the form components. See **D-PCP-slots** below.

**Common Props base — none.** Each PCP Props interface independently re-declares `className?: string` + `style?: CSSProperties`. No shared `BaseStyleProps` extends. Pure duplication, ~14 lines of repeated declarations across 7 files. Not high-cost to maintain (the contract is stable), but a one-line `extends BaseStyleProps` would tighten the type story.

---

## rc.5 + rc.6 delta DX impact

### `useIdentity()` exposes test-only declarations in its per-module .d.ts

`dist/types/react/useIdentity.d.ts:14-22` declares:

```
export declare function __resetIdentityStoreForTests(): void;
export declare function __seedIdentityStoreForTests(env: ProfileEnvelope): void;
```

Plus the internal `interface ProfileEnvelope` (lines 4-12). These are **NOT re-exported from `src/react/index.ts`** (verified — `grep -nE "__resetIdentityStoreForTests\|__seedIdentityStoreForTests" src/react/index.ts src/index.ts` → 0 hits) and **NOT exposed via `package.json:exports`** (only `./react` is exposed, which resolves to `dist/types/react/index.d.ts` — a flat file that doesn't re-export the test helpers). So consumers cannot reach them through the documented import path.

**However**, the deep-import path `'@samjonaidi-ship-it/universal-auth/react/useIdentity'` is *technically* not reachable either because `package.json:exports` is restrictive and the bare `./react/useIdentity` subpath is not declared. So the leak is dist-side only — IDE consumers crawling the npm tarball *can* see these symbols if they navigate to the `.d.ts` directly, but they cannot import them.

**Severity: very low.** The `__`-prefix follows convention; no consumer should rely on these. Fix would be `/** @internal */` JSDoc + `tsconfig.declarationOnly` filter, or relocate the helpers to a `_test-only.ts` sibling. Not worth changing pre-GA.

### 7 PCP components — Props duplication, no slot maps

Confirmed above. Architectural pattern is "richer-subtree-but-thinner-theming-surface." Mismatch worth noting; not a regression.

### `AuthErrorCode` consumer ergonomics — exhaustive `switch` impossible

Verified empirically (TS test from §"Type safety"): even with all 22 explicit case arms, the union's trailing `(string & {})` widens away exhaustiveness. Consumers either need a `default:` (which defeats the point of the literal-union typing) or have to layer a wrapper:

```ts
function isCanonicalCode(c: string): c is Exclude<AuthErrorCode, string & {}> { ... }
```

**This is a real DX cost** of the otherwise-good rc.5 D7 fix. The trade is: forward-compat on unknown server codes vs exhaustiveness checking. Documenting the trade in the union's JSDoc would help consumers calibrate expectations. See **D7-fu** in debt inventory.

### rc.6 — pure tests-and-docs ship

`git diff --stat v1.1.0-rc.5..v1.1.0-rc.6 -- src/`:

```
 src/config.ts | 4 ++--
```

Single line change: `SDK_VERSION = '1.1.0-rc.5'` → `'1.1.0-rc.6'` plus watermark bump. Zero public-API delta. The rc.5 PCP exports survive intact; `AuthErrorCode` shape unchanged; everything else is test files + docs.

**Net rc.5+rc.6 public-surface delta:** +8 React exports (D1 fix), +1 error class (`AuthProviderMissingError`), +1 type alias (`AuthErrorCode`), `useAuth().signOut/signOutEverywhere` widen from `() => Promise<void>` to `(options?) => Promise<void>` (forward-compat — old call shape still works). All additive; zero breaking.

---

## Discoverability

- **`tsconfig` declarations emitted.** `dist/types/` exists; `stat` confirms `dist/types/index.d.ts` and `dist/types/react/index.d.ts` are newer than the corresponding `src/` files. `pnpm build` was last run at the v1.1.0-rc.6 commit. ✓
- **Subpath imports resolve in IDE.** All 6 declared subpaths in `package.json:17-42` build to both `dist/esm/{*}.js` AND `dist/types/{*}.d.ts`:

| `package.json:exports` key | esm artifact | types artifact |
|---|---|---|
| `.` | `dist/esm/index.js` | `dist/types/index.d.ts` |
| `./react` | `dist/esm/react/index.js` | `dist/types/react/index.d.ts` |
| `./react/styles.css` | `dist/esm/react/components/styles.css` | n/a (CSS asset) |
| `./sw` | `dist/esm/sw/index.js` | `dist/types/sw/index.d.ts` |
| `./profile` | `dist/esm/profile/index.js` | `dist/types/profile/index.d.ts` |
| `./extendability` | `dist/esm/extendability/index.js` | `dist/types/extendability/index.d.ts` |
| `./internal` | `dist/esm/internal/index.js` | `dist/types/internal/index.d.ts` |

All 7 verified present on disk.

- **`SDK_VERSION` literal sync.** `src/config.ts:231` `SDK_VERSION = '1.1.0-rc.6'` matches `package.json:3` `"version": "1.1.0-rc.6"`. Verified by `pnpm verify:version-sync` (CI gate). ✓
- **No `./react/components` subpath export** — and no need for it now that the PCP components are re-exported from the main `./react` barrel (D1 closed). ✓

---

## Debt inventory (full table)

Mapping legend: ✓ closed since rc.4 audit; ⏳ partial; ✗ open; 🆕 introduced post-rc.4.

| ID | Status | Severity | File:line | Issue | Consumer pain | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| D1 | ✓ closed (rc.5) | — | `src/react/index.ts:132-168` | 7 PCP components + `useIdentity` re-exported. Verified in `dist/types/react/index.d.ts:34-41`. | — | — | — |
| D2 (React) | ✓ closed (rc.5) | — | `src/react/useAuth.ts:46-47` | `signOut/signOutEverywhere` accept `{signal?}`. | — | — | — |
| **D2-imp** | ⏳ open | Medium | `src/imperative/getAuth.ts:90` | `signOut(): Promise<void>` — imperative side still no signal param. The underlying `recovery.ts:36` accepts it. | TanStack-Query / SWR consumers using imperative API can't cancel a sign-out. | One-line type widening: `signOut(options?: { signal?: AbortSignal }): Promise<void>` and pass through to `recoverySignOut(options)` at line 148. | 10 min |
| D3 | ✓ closed (rc.5) | — | `src/config.ts:231` + `scripts/verify-version-sync.ts` | `SDK_VERSION` matches `package.json` and CI gate prevents recurrence. | — | — | — |
| D4 | ✓ partially closed (rc.5/rc.6) | — | `README.md:8,9` | Test count + bundle figures refreshed in rc.6. | — | — | — |
| **D-rc6-banner** | 🆕 open | Low | `README.md:6` | Banner reads `v1.1.0-rc.5 — Post-rc.4 debt cleanup` while package is `1.1.0-rc.6`. New instance of D4-class drift introduced by the rc.6 release process. | Consumer skim sees one-rc-old descriptor. | Update line 6 to `v1.1.0-rc.6 — COV-1 finish + audit-followup housekeeping` (matches CHANGELOG header). | 2 min |
| D5 | ✗ open | Medium | `src/extendability/index.ts:33` | `__resetExtendabilityForTests` still on public `./extendability` subpath. | Surface cleanliness — consumer autocomplete shows it. | Move to `./internal` subpath OR add `/** @internal */` JSDoc + production-mode no-op guard. | 15 min |
| D6 | ✓ closed (rc.5) | — | `docs/INTEGRATION_GUIDE.md:32-101` | v1.1 capability section with 15 numbered items + migration recipe. | — | — | — |
| **D6-watermark** | 🆕 open | Low | `docs/INTEGRATION_GUIDE.md:1` | Watermark `v1.1.0-rc.5 \| 2026-05-08` not bumped to rc.6. Content is still accurate (rc.6 = no API change vs rc.5). | Same minor staleness signal as the README banner. | Bump watermark literal to `v1.1.0-rc.6`. | 1 min |
| D7 | ✓ closed (rc.5) | — | `src/errors.ts:44-73,83` | `AuthErrorCode` literal union exported, `AuthSdkError.code` re-typed. | — | — | — |
| **D7-fu** | 🆕 open | Low | `src/errors.ts:73` (the `\| (string & {})` fallback) and `src/core/{client,token-manager}.ts` (4 plain Errors with code-prefix messages) | Two follow-ups on the rc.5 D7 fix: (a) consumers cannot make `switch (err.code)` exhaustive (verified by TS test → TS2322 on `never`) because of the `(string & {})` widening; (b) 4 SDK-internal codes (`DPOP_FALLBACK`, `LEGACY_REFRESH_RESPONSE`, `NO_NAVIGATOR_LOCKS`, `CNF_JKT_MISMATCH`) appear in the union but no `AuthSdkError` instance carries them — they're thrown as plain `new Error('CODE: msg')`. | (a) Consumer who learns "literal union enables exhaustive switch" hits a TS2322 surprise. (b) Consumer doing `if (e instanceof AuthSdkError && e.code === 'DPOP_FALLBACK')` will never match. | (a) Add a JSDoc note on `AuthErrorCode` documenting the trade ("admit unknown future codes; consumers needing exhaustive-switch should call a typeguard like `isCanonicalCode(c)`"). (b) Promote the 4 SDK-internal codes to `AuthSdkError` instances at the throw sites, OR remove them from the union if message-prefix is the intended contract. Pick one; current state is ambiguous. | 30 min for (a); 1 h for (b) |
| D8 | ✓ closed (rc.5) | — | `src/errors.ts:285-295`, `useAuth.ts:54`, `useEntitlements.ts:24` | `AuthProviderMissingError` wired. | — | — | — |
| D9 | ✗ open | Low | `src/react/useAuth.ts:42`, `src/imperative/getAuth.ts:54` | `useAuth().signIn` = `verifyCode` (post-OTP); `getAuth().signIn` = `requestCode` (pre-OTP). Same name, opposite operation. | Consumer who learned imperative API gets wrong mental model on React API and vice versa. | Deprecate both `signIn` aliases via `@deprecated` JSDoc; promote `useAuth().verifyCode` and `getAuth().requestCode` as canonical. Schedule v1.2 removal. | 1 h |
| D10 | ✗ open | Low | `src/index.ts` (entire), all exports | 0 `@example` JSDoc blocks across ~52 main-barrel runtime exports. | IDE hovers show purpose but not usage. | Add 5-10-line `@example` blocks on top-10 most-used. Note: `AuthErrorCode` already has an example-equivalent in its JSDoc body but doesn't use the `@example` tag. | 4 h |
| D11 | ✗ open | Low | `src/react/useAuth.ts` | `useAuth()` returns 12 fields + subscribes to 2 contexts. No `useAuthStatus()` split for header-style consumers. | Components needing only `status` re-render on persona-switch / agent-context change. | Add `useAuthStatus()` (10-line hook reading `StatusContext` only). Don't break existing `useAuth()`. | 30 min |
| D12 | ✗ open | Low | `src/react/useAuth.ts:66` | `switchActivePersona` throws plain `Error` for "persona not in identity's personas". | Consumer can't `instanceof PersonaInvalidError`. Out-of-pattern with the typed-error catalog. | Define `PersonaInvalidError extends AuthSdkError` (code `'PERSONA_INVALID'` — would need to be added to `AuthErrorCode` union). | 15 min |
| D13 | ✗ open | Low | `src/react/components/scope-catalogs.ts` | 5 `*ScopeCatalog` data exports with no JSDoc on export sites. | Consumers wiring `<DelegationCenter>` for custom personas reverse-engineer conventions. | One-paragraph table per catalog. | 1 h |
| D14 | ✗ open | Low | `README.md:46-51`, `src/sw/index.ts:112` | `/sw` subpath has zero runtime exports. | Discoverability — autocomplete user finds nothing. | One-line README addition: "`/sw` is a build artifact only; consumer apps serve it as a static SW URL." | 5 min |
| D15 | ⏳ partial | Low | `vitest.config.ts:40` | Branch threshold raised 83 → 84 in rc.5 + COV-1 partial restoration. Measured 84.72% (rc.6). Remaining gap to 85: 0.28pp in `storage.ts` IDB-upgrade callbacks. | Quality signal still 1pp short of original 85 floor. | rc.6 BACKLOG TEST-1 / COV-1 documents the gap; deferred to v1.1.0 GA. | 4 h (fake-IDB-with-version-injection harness) |
| **D-imp-getUser** | ✗ open (P2-13 from rc.2) | Medium | `src/imperative/getAuth.ts` (entire) | `getAuth().getSession()` returns `{session_id, is_authenticated}` only. No imperative path to full `Identity`. | Non-React consumers (Node, vanilla JS) must hand-roll `/auth/v1/me` fetch + envelope parse. | Add `getUser(): Promise<Identity \| null>` that calls `/auth/v1/me` via `core/client.ts` + handles unauthenticated state. | 1.5 h |
| **D-PCP-slots** | 🆕 open | Low | 7 PCP component files | PCP components only expose `className + style`; no `classNames` slot map. Inconsistent with form-components contract. | Consumers with multi-slot styling needs (e.g., custom upload-tile in `<MediaGallery>`) wrap-and-recompose. | Add per-component `classNames` slot maps. Suggested keys: `MediaGallery` → `{ root, grid, tile, uploadTile, deleteButton, errorRegion }`; `AddressInput` → `{ root, input, helper, error }`; etc. | 3 h |
| **D-PCP-base** | 🆕 open | Low | 7 PCP component files | Each Props interface independently re-declares `className?: string` + `style?: CSSProperties`. Pure duplication. | Type story slightly weaker; bug surface for "did we add className to every Props?" | Define `BaseStyleProps { className?: string; style?: CSSProperties; }` once; have all 25 components' Props interfaces `extends BaseStyleProps`. | 30 min |
| **D-useIdentity-jsdoc** | 🆕 open | Low | `src/react/useIdentity.ts:225` and `:161` | `useIdentity` function and `UseIdentityReturn` interface have no `/** ... */` block on the export site. The 32-field interface has minimal per-field docs. | IDE hover on `useIdentity` shows `function useIdentity(): UseIdentityReturn` with no doc. | Add 3-5-line block on the function (purpose, when to use vs `useProfile`, hydration semantics) + per-field-group section comments. | 30 min |
| **D-useIdentity-test-leak** | 🆕 open | Very Low | `dist/types/react/useIdentity.d.ts:14-22` | `__resetIdentityStoreForTests` and `__seedIdentityStoreForTests` are visible in the dist `.d.ts`. NOT reachable through `package.json:exports` (which only declares the barrel), so consumers cannot import them — but the symbols leak into the published tarball's type emit. | Negligible. | Add `/** @internal */` JSDoc + tsconfig declarationOnly filter, OR move helpers to `_test-only.ts` sibling and gate from production exports. | 30 min |

---

## Recommendations (ranked, with effort)

1. **(D-rc6-banner + D6-watermark, 3 min total, Low)** Fix the two new release-time drifts. README banner line 6 → `v1.1.0-rc.6 — COV-1 finish + audit-followup housekeeping`; INTEGRATION_GUIDE line 1 watermark literal → `v1.1.0-rc.6`. Both are sub-5-min fixes that close the only debt rc.6 itself introduced.
2. **(D2-imp, 10 min, Medium)** Widen `getAuth().signOut` signature to `(options?: { signal?: AbortSignal }) => Promise<void>` and pass through. This finishes the rc.5 D2 fix.
3. **(D-imp-getUser, 1.5 h, Medium)** Add `getAuth().getUser(): Promise<Identity \| null>`. The largest remaining imperative-API gap. Closes the original rc.2 P2-13 backlog item that rc.4/rc.5/rc.6 didn't touch.
4. **(D7-fu, 30 min for (a), 1 h for (b), Low-Medium)** Add JSDoc note on `AuthErrorCode` documenting the exhaustive-switch limitation; resolve the 4-codes-without-classes ambiguity (either promote them to `AuthSdkError` instances, or remove from the union). Pick a side; current state is ambiguous.
5. **(D5, 15 min, Medium)** Move `__resetExtendabilityForTests` off the public `./extendability` subpath (or add `/** @internal */`).
6. **(D12, 15 min, Low)** `PersonaInvalidError extends AuthSdkError` for `useAuth.ts:66`. Add `'PERSONA_INVALID'` to `AuthErrorCode`.
7. **(D-PCP-base, 30 min, Low)** Define a shared `BaseStyleProps` and have all 25 components' Props extend it. Pure refactor, removes duplication.
8. **(D-useIdentity-jsdoc, 30 min, Low)** Add JSDoc on `useIdentity` + `UseIdentityReturn`. Highest IDE-hover-quality lift per minute.
9. **(D9, 1 h, Low)** Deprecate `signIn` aliases. Plan v1.2 removal.
10. **(D11, 30 min, Low)** `useAuthStatus()` hook (additive).
11. **(D-PCP-slots, 3 h, Low)** Add `classNames` slot maps to 7 PCP components.
12. **(D14, 5 min, Low)** README note that `/sw` is a build artifact only.
13. **(D13, 1 h, Low)** Per-catalog documentation for `scope-catalogs.ts`.
14. **(D10, 4 h, Low)** `@example` JSDoc blocks on top-10 exports.
15. **(D15, 4 h, Low)** Restore branch-coverage gate to 85.

**Top 5 (D-rc6-banner + D6-watermark + D2-imp + D-imp-getUser + D7-fu(a) + D5), total ~3 hours**, would close every remaining medium-and-up debt item and lift the score to ~9.0. The big dollar-effort lifts (D10 examples, D-PCP-slots, D15 coverage) are GA-window investments rather than rc.6→rc.7 hotfixes.

---

*Audit performed 2026-05-08 against `@samjonaidi-ship-it/universal-auth@1.1.0-rc.6` (commit `80ad904`, tag `v1.1.0-rc.6`). All evidence file:line cited inline; all paths absolute under `C:\Users\samjo\Desktop\BB_Universal_Auth\`. Read-only; zero source modifications. `pnpm typecheck`, `pnpm lint`, `pnpm verify:readme` all exit 0 at the audited commit. `dist/` build output is current vs `src/` per `stat`-based modification-time comparison.*
