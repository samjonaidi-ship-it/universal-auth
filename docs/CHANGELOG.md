# Changelog

All notable changes to `@bainbridgebuilders/universal-auth` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html) per SDK spec §14.

Citation convention: section-only (`§3.7`, `§D2.1`, `Appendix B`). Spec line numbers drift on every version bump; section numbers are stable.

## [Unreleased — targeting 1.0.0-rc.1]

### Block 6 Day 16-17 + look-back fixes (2026-04-25 — 2026-04-28)

**Unit-coverage push** (`agent/block-6-test-hardening` → main, commit `12dbfc4`):
- 14 new test files, +68 tests across previously-uncovered surfaces:
  - flows: `recovery`, `permission-grants`, `persona-registry-client`, `passkey-flow` (with `@simplewebauthn/browser` mocked — full register + authenticate ceremony, conditionalUI flag, cancellation events)
  - profile: `profile-store` (state machine, If-Match, 409 rehydrate, listeners), `persona-fields` (1h cache + coalesce)
  - imperative: `getAuth` (pins stub API shape so it can't drift before Block 7)
  - react hooks: `useProfile`, `useSettingsSync`, `usePermissionGrants`
  - UI components: `AvatarPicker`, `ContactInfoForm`, `ProfileCompletenessBar`, `ProfileSetupScreen` (3 modes)
  - offline: `sw-bridge` (SYNC_TAG export, no-op-when-unavailable, register-with-default-scope)
- Coverage: **56.89% → 76.51% lines / 78.99% → 80.04% branches / 74.68% → 78.81% funcs**
- Tests: 193 → 261 passing across 31 → 46 files

**Block 6 look-back remediation** (`agent/block-6-lookback-fixes` → main, commit `73198d4`):
- **Real bug fix — `profile-store.ts` generation guard**: `__resetProfileStoreForTests` was resetting state but not cancelling in-flight hydrate promises. A pending fetch from a prior test could resolve into the next test's fresh state with stale data.
  - Production-relevant, not just test-only: same race exists in real life if a user triggers `hydrateProfile()` then logs out before the response lands — the resolved profile would clobber the post-logout state.
  - Fix: monotonic `generation` counter bumped on every reset; `hydrateProfile` captures the generation at start, drops the result if it changed during the await.
- **Test setup hardening**: `test/unit/setup.ts` `unhandledRejection` filter expanded to swallow `ENOTFOUND` / `getaddrinfo` / `fetch failed` / `aborted` patterns — leaked-fetch noise from components that fetch in `useEffect` and unmount before the response lands. Real fetch errors still surface via SDK's try/catch in `core/client.ts:151`.

**2026-04-28 look-back remediation** (`agent/lookback-2026-04-28`):
- **Generation guard extended to `saveProfile`** — same race class affects saves, not just hydrates. If a logout interrupts a save, we now drop the result instead of clobbering post-logout state. Throws `Profile save aborted: session changed during save.` so the UI doesn't show a "saved" toast on a torn-down session.
- **Doc drift fixes** (in `BB_Platform_Specs/`):
  - `BB_MIGRATION_MAP.md` v1.1.0 → v1.2.0: shows actual applied state (`049b seat_pools`, `049c bridge_master_snapshot` renumbered from 058, `058 consent_documents` pulled forward from 073). HWM updated to `058_consent_documents`. `073` row marked RETIRED.
  - This CHANGELOG entry — back-fills Block 6 Day 16-17 work that wasn't logged when it landed.

**SSL infrastructure for `ct-bff.bainbridgebuilders.com`**:
- Custom domain registered on Railway BB-ControlTower service
- DNS records added at Porkbun (CNAME + `_railway-verify` TXT)
- SSL cert issued via Let's Encrypt (R13) + Fastly edge
- `https://ct-bff.bainbridgebuilders.com/healthz` → HTTP 200

**CT BFF migrations PR**: `samjonaidi-ship-it/BB_ControlTower#12` merged 2026-04-28T02:17:17Z. 13 migration files now in `main` (already applied to Neon prod 2026-04-25).

**No bundle size delta** — pure test + doc changes. Core 11.78 KB / 40 KB. Passkey 7.88 KB / 10 KB. SW 433 B / 5 KB.

### Block 5 + A4 audit sign-off (2026-04-24)

**Profile module** (§5.4) — new `/profile` subpath keeps `libphonenumber-js` out of the core bundle:
- `profile/presets.ts` — 20 SVG preset avatars; `pickPresetForIdentity` deterministic per identity hash
- `profile/avatar.ts` — JPEG compression (canvas, 82%, ≤1024px), `generateInitials`, `INITIALS_COLORS` (6-color palette), `resolveAvatar` 3-tier fallback (url → preset → initials), `uploadAvatar` (FormData), `clearAvatar`
- `profile/validators.ts` — `validatePhone` (libphonenumber → E.164), `validateEmail` (RFC-5322 pragmatic), `requiredFieldsPresent` (dot-path lookup)
- `profile/completeness.ts` — per-persona weighted scoring (60/30/10), hard cap at 59 when any required missing, 6-persona roster (crew/supplier/client/architect/subcontractor/admin)
- `profile/persona-fields.ts` — 1h-cached server registry (§5.4.6) with `getPersonaRoster(persona)`
- `profile/profile-store.ts` — state machine ('loading'|'ready'|'saving'|'error') + listeners + 409 conflict rehydrate
- `react/useProfile.ts` — REAL impl (replaces Block 4 stub) wrapping store + auto-hydrate on mount

**Profile components** (§D2.5):
- `<ProfileSetupScreen>` — 3 modes per §5.5.1 (automatic / guided / deferred)
- `<AvatarPicker>` — upload + preset grid + clear
- `<ContactInfoForm>` — display_name + email + phone + emergency_contact (persona-aware)
- `<PersonaFieldsForm>` — renders dynamically from server-driven registry
- `<ProfileCompletenessBar>` — `role="progressbar"` + missing-required hint

**Real passkey flow** (§3.1, was stub) — `flows/passkey-flow.ts`:
- `registerPasskey`, `authenticatePasskey` (Conditional UI optional)
- `isPasskeySupported`, `isConditionalUiSupported` probes
- Cancellation events (`passkey.cancelled` with phase metadata)

**Consent client** (§3.4 + §D2.6) — `flows/consent.ts`:
- `getConsentDocuments(audience)`, `bulkAcceptConsents([...])` (atomic), `recordConsent`, `revokeConsent`, `listConsents`

**Extendability** (§8.5) — interface-only, registry-backed:
- `NotificationChannelAdapter` (§8.5.2) — registry-dispatched
- `AuthFlowAdapter` (§8.5.3) — reserved
- `RiskSignalAdapter` (§8.5.1) — reserved

**Demo scaffold** at `demo/` — Vite + React + SDK wiring AuthProvider, SignInForm, ProfileSetupScreen, all banner/chooser components. Block 7 expands the kitchen-sink coverage per plan.

**Architecture changes:**
- New `/profile` subpath in `package.json exports` keeps libphonenumber-js out of the 40 KB core budget
- New `/extendability` subpath
- New `/react/styles.css` subpath — build pipeline now copies `src/react/components/styles.css` to `dist/`
- `core/client.ts` now passes `FormData` / `Blob` / `Uint8Array` bodies through unmodified (skips JSON.stringify for binary uploads)
- `scripts/build.ts` bundles 7 entry points (was 5)

**Block 5 unit tests — 46 new tests across 5 new files**: 7 preset, 12 avatar, 12 validator, 7 completeness, 5 consent, 3 extendability.

**Bundle delta** (post-A4): core **11.78 KB / 40 KB** (71% headroom), passkey **7.88 KB / 10 KB** (was 104 B stub), sw 433 B / 5 KB.

**Test count**: 147 → **193 passing** across 31 files.

**Audit report**: `audits/A4_feature_complete_2026-04-24.md` — 4/9 ✓ + 5 deferred-to-infra (server seeds, R2 bucket, migrations, demo deploy, no-deprecation-warnings runtime check).

### Block 4 look-back remediation (2026-04-24)
- **Bug fix — `<ImpersonationBanner>`**: original code cast `identity.acting_as` which doesn't exist on the session payload — banner would never render. `flows/impersonation` now exposes `getCurrentActingAs()` + `onActingAsChange()` pub-sub; `useImpersonation()` subscribes; banner reads reactive `actingAs` from hook.
- **Bug fix — `<AuthProvider>` hydration**: original code short-circuited to `anonymous` whenever no in-memory access token, breaking D10 cross-subdomain SSO (cookie-only sessions ignored on initial page load). Now always attempts `GET /me` on mount with `credentials: 'include'`; transitions to `anonymous` only on auth-class failures.
- **Gap fix — `<AppChooser>`**: omitted `apps` prop now falls back to `useEntitlements().app_access` (was hardcoded empty list).
- **Cleanup — `EntitlementsContext.hasFeature`**: removed redundant `hasFeatureRaw(k) || f.includes(k)` OR fallback; single source.
- **Initial-status fix**: `AuthProvider` now reads `navigator.onLine` when constructing initial status from `initialSession`.
- **Smoke tests added** for 8 previously-untested components (27 new tests): `SignInForm`, `CodeEntry`, `PasskeyPrompt`, `OfflineIndicator`, `ImpersonationBanner`, `AppChooser`, `PersonaChooser`, `AgentStatusBanner`. The 2 real bugs were caught by these tests during the look-back.
- **Test count**: 120 → **147 passing** across 25 files
- **Audit amendment**: `audits/A3_react_core_2026-04-24.md` Look-back remediation section logs the 5 issues + fixes + lesson learned

### Block 4 + A3 audit sign-off (2026-04-24)
- **AuthProvider with 3-context split** (§8.4): `IdentityContext` / `EntitlementsContext` / `StatusContext` — components subscribe to one context and don't re-render on others. Memoized snapshots with stable deps.
- **Public hooks (§5.2 + §D2.4):**
  - `useAuth` — identity / status / personas / activePersona / primary_persona / hasPersona / switchActivePersona / allFeatures / agent / signIn / requestCode / signOut / signOutEverywhere
  - `useEntitlements` — features / app_access / hasFeature / hasAppAccess
  - `useProfile` — Block 4 stub (full impl Block 5)
  - `useImpersonation` — start / end / recordAction
  - `useSettingsSync` — settings / version / update / hydrate (auto-hydrates on mount)
  - `usePermissionGrants` — record / requestAndRecord
- **Day 9 components:**
  - `<SignInForm>` — code-first 2-stage flow (destination → code) with optional passkey CTA
  - `<CodeEntry>` — single 6-digit input (autocomplete=one-time-code)
  - `<PasskeyPrompt>` — UI primitive; ceremony stays in `flows/passkey-flow.ts` (lazy chunk)
  - `<OfflineIndicator>` — subtle banner, status-driven
- **Day 9.5 components (D2.5):**
  - `<AppChooser>` — multi-app picker (D10)
  - `<PersonaChooser>` — multi-persona picker (D8) with optional remember-choice
  - `<PersonaGuard>` — UX-only route gate (D2.7); server is source of truth
  - `<AgentStatusBanner>` — disclosure for Tier-3 conversational surfaces (D13)
  - `<ConsentScreen>` — atomic hard-gate with `DEFAULT_REQUIRED_CONSENTS` constant matching Wizard §20 vocabulary (crew=9 / supplier=2 / subcontractor=3 / client=2 / architect=2 / admin=3); group-by-type rendering (legal / device / ai_assistant); submit disabled until all required checked
- **Day 10 component:** `<ImpersonationBanner>` — route-resilient (mounts in layout shell, NOT per-route)
- **Styles** (§8.5): single `components/styles.css` with `--bb-*` CSS custom properties only; consumer apps theme by overriding vars; min touch target 44px. Zero inline styles.
- **React barrel** (`src/react/index.ts`): exports all public hooks + components + types; tree-shakeable
- **Block 4 unit tests — 14 new tests** across 4 React test files: AuthProvider context-split smoke, useAuth contract (4 tests), PersonaGuard logic (3 tests), ConsentScreen crew 9-consent hard-gate (5 tests)
- **Test infrastructure**: added `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` + `react`/`react-dom` 19 to devDeps; `test/unit/setup.ts` registers `afterEach(cleanup)` so DOM doesn't leak between tests
- **Bundle delta** (post-A3): core 9.20 KB / 40 KB (77% headroom — React on subpath bundle, not core); passkey 104 B / 10 KB; sw 433 B / 5 KB
- **Audit report**: `audits/A3_react_core_2026-04-24.md` — 9/11 ✓ + 1 partial (Suspense `use()` Phase 2) + 1 deferred (axe-core to A4)

### Block 3 + A2 audit sign-off (2026-04-24)
- **Core modules** per spec §3 / §6 / §8 / §9:
  - `src/core/event-reporter.ts` — POST /events/v1/ingest with IDB-persisted queue, 10s/50-evt batching (§8.1), envelope auto-population (§6.3), UNKNOWN_EVENT_TYPE → permanent drop
  - `src/core/entitlements.ts` — hasFeature/hasAppAccess sync reads; stale-while-revalidate (§8.1); localStorage-backed with 7-day offline grace (§9.5)
  - `src/core/settings-sync.ts` — GET/PUT /identity/v1/settings with If-Match optimistic locking (§3.3), debounced 500ms write (§8.1), 409 → rehydrate + sync.conflict event
  - `src/core/session-watcher.ts` — 60s GET /auth/v1/me polling, visibility-gated (§8.2), ETag 304 support, AUTH_SESSION_REVOKED → clearSession
  - `src/core/sdk-metrics.ts` — getSDKMetrics() runtime observability (§12.2): refresh count/avg/p95, event batch stats, offline+event queue depth, last-error trail
- **Flow modules** per spec §3.1 / §3.1bis / §D2.6:
  - `src/flows/code-flow.ts` — requestCode() / verifyCode() with enumeration-safe wrapper
  - `src/flows/enroll-flow.ts` — verifyEnrollmentToken (POST-only, D3) + activateEnrollment (magic-link atomic commit); emits identity.employee_linked (D14)
  - `src/flows/recovery.ts` — signOut / signOutEverywhere / listSessions / revokeSession
  - `src/flows/impersonation.ts` — startImpersonation / endImpersonation / recordImpersonationAction
  - `src/flows/persona-registry-client.ts` — 1h in-memory cache with coalesced refresh (§D2.6)
  - `src/flows/permission-grants.ts` — recordPermissionGrant + requestAndRecord helper
- **Offline** per spec §9.4:
  - `src/offline/queue.ts` — IDB FIFO queue with maxQueueSize eviction (emits sync.failed per §9.4 footnote); dead-letter support
  - `src/offline/reconciler.ts` — full §9.4 status matrix (2xx delete / 4xx delete-non-429 / 5xx retry-backoff / 401 defer / 409 conflict / 429 defer); dead-letter after MAX_RETRIES=5
  - `src/offline/sw-bridge.ts` — SW registration + background-sync request + bidirectional messaging
  - `src/sw/index.ts` — real SW (replaces Day 1 stub): background-sync tag `bb-universal-auth-flush` → main-thread flush dispatch; logout → configurable cache purge (default `runtime`, `api`, `auth-session-features`)
- **Shared IDB handle refactor**: added `storage.getSharedDb()` so event-reporter, offline/queue, and sdk-metrics don't open their own connections (prevented a class of "No objectStore named X" init-order races)
- **DB test-isolation hardening**: `__resetDbForTests` now `deleteDB` after `close()` — guarantees fresh DB per test case; prevents row-count assertion flakes
- **`initUniversalAuth` wiring**: now configures event-reporter + settings-sync + offline.maxQueueSize from `UniversalAuthConfig`
- **Public barrel** expanded to export all Block 3 surfaces (flows, entitlement readers, settings-sync, sdk-metrics, session-watcher, emitEvent, onSessionChange)
- **Unit tests — 106 passing across 13 files** covering A2 gates #3-10, #12: FIFO insertion order, maxQueueSize eviction, reconciler 6-way status matrix, event envelope auto-population, enrollment activate → session install with D14 employee_id, settings If-Match + 409 rehydrate, entitlements 7-day grace cutoff
- **Bundle delta** (post-A2): core 9.19 KB / 40 KB (77% headroom), passkey 104 B / 10 KB, sw 433 B / 5 KB (91% headroom)
- **Audit report**: `audits/A2_flows_offline_2026-04-24.md` — 13/13 gates passed

### SDK spec v1.4.1 → v1.4.2 (2026-04-24)
- **Package-name clarification patch** in `BB_Platform_Specs/BB_UNIVERSAL_AUTH_SDK_SPEC.md`. Registry name locked as `@bainbridgebuilders/universal-auth` (the `@bb` npm/GitHub scope is permanently held by Benjamin Bock since 2008). Source-file watermarks and in-spec code samples continue to use the shorthand `@bb/universal-auth` for readability.

### A1 audit sign-off (2026-04-24)
- **Web Crypto → Web Worker** (§8.2): new `src/core/crypto-worker.ts` (DedicatedWorker with `self.importScripts` assertion on load, CryptoKey cache keyed by device input, message-based encrypt/decrypt/clearKeyCache); new `src/core/crypto-client.ts` (main-thread proxy to worker via `new Worker(new URL('./crypto-worker.js', import.meta.url), { type: 'module' })` with pure-crypto fallback for SSR/test); new `src/core/storage-crypto.ts` (pure PBKDF2 + AES-256-GCM primitives shared by worker and fallback)
- **Unit tests — 77 passing across 6 files** covering A1 gates #4, #5, #6, #10: mutex-coalesced refresh (5 concurrent → 1 call), 17 typed error classes + envelope factory, 3 mode-safety negative tests, device-id determinism, encrypt/decrypt round-trip + IV uniqueness + tamper fail, client headers + URL join + error mapping + 401 refresh-retry
- **Citation convention migration**: stripped SDK spec `L<n>` line numbers from 57 citations across code + audit report (drift after v1.4.0→v1.4.1 spec bump); section-only citations from here forward
- **Test infrastructure**: vitest config with `environment: 'happy-dom'`, `test/unit/setup.ts` with `fake-indexeddb/auto` + Node 25 `localStorage` shim (Node 25 ships broken stub unless `--localstorage-file` CLI arg) + BroadcastChannel stub
- **ESLint flat-config migration** (ESLint 9): `.eslintrc.cjs` → `eslint.config.js`; split config (typed for src/test, untyped for scripts); strict rules per plan CI/CD step 2
- **Bundle delta** (post-A1): core 5.51 KB / 40 KB (86% headroom), passkey 104 B / 10 KB, sw 13 B / 5 KB
- **Audit report**: `audits/A1_core_modules_2026-04-24.md` — 11 gates passed + 1 conditional on coverage (A2/A3 commitments attached)

### Block 2 Days 3-4 (2026-04-24)
- Core modules per spec §3 / §8 / §9 / §15:
  - `src/core/device-id.ts` — SHA-256(UA).hex.slice(0,32) with in-memory + optional localStorage cache; DPoP extension point for Phase 2 (§16.2)
  - `src/core/storage.ts` — encrypted IDB via `idb` wrapper; 4 stores (refresh_tokens, offline_queue, event_queue, dead_letter_queue); `toOwnedBytes()` shim for TS 5.5 BufferSource narrowing; graceful decryption failure
  - `src/core/token-manager.ts` — access in memory only (§15.1), encrypted refresh in IDB (§5.0 v1.4.0 — 90-day TTL); mutex-coalesced refresh (§8.2); BroadcastChannel cross-tab adoption (Shared Worker primary in A3+); session-change listener pattern; 30s refresh margin
  - `src/core/client.ts` — `X-Auth-Protocol-Version: v1` on every request; `Idempotency-Key` on mutations; Bearer auto-attach (opt-out via `anonymous:true`); 401 silent-refresh-retry; non-2xx → errorFromEnvelope typed throw; ETag 304 support
- `src/config.ts` — `initUniversalAuth()` wires `configureClient()` which registers the refresh callback into token-manager

### Block 1 Day 1 — Scaffold (2026-04-24)

- **Repository skeleton** per plan repo layout + SDK spec §4
  - `package.json` with production + dev deps per Appendix B; `sideEffects: false`; 3-subpath exports (root, `/react`, `/sw`)
  - `tsconfig.json` strict (ES2022, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
  - `.npmrc` for GitHub Packages under `@bainbridgebuilders` scope (renamed from `@bb` — `bb` GitHub user is taken by Benjamin Bock since 2008; GitHub Packages scope must match a claimable org namespace)
  - `.gitignore`, `README.md`, `docs/CHANGELOG.md`, `LICENSE` (proprietary)
- **Source stubs**
  - `src/index.ts` — public named-export barrel (no side effects)
  - `src/config.ts` — `UniversalAuthConfig` shape + `assertModeSafety` per §10.6
  - `src/errors.ts` — 17 typed error classes per §3.7 + §5.4.5 + v1.4.0 §3.4; `errorFromEnvelope()` factory; uses `no_app_registration` sub-code per plan Decision #20
  - `src/imperative/getAuth.ts` — non-React entry per §5.3 (stub)
  - `src/types/api.ts` — Session, Identity (incl. D14 `employee_id?: string | null` per plan Decision #19), Persona, Entitlements, AgentContext per §D2.1
  - `src/types/profile.ts` — UniversalProfile per §5.4.1
  - `src/react/index.ts`, `src/sw/index.ts`, `src/flows/passkey-flow.ts` — subpath reservations (lazy chunks in build)
- **Build + verification scripts** (all wired in CI)
  - `scripts/build.ts` — esbuild 5-entry split per §12.1; `tsc --emitDeclarationOnly` for `.d.ts`
  - `scripts/verify-bundle.ts` — `sideEffects:false` audit, no inline scripts, no barrel side effects
  - `scripts/verify-watermarks.ts` — CLAUDE.md §10 watermark enforcement on every `.ts`/`.tsx`
  - `scripts/verify-no-jose.ts` — forbids `jose`/`lodash`/`axios`/`zustand`/`moment`/`date-fns` in prod deps per §Appendix B
- **CI + release**
  - `.github/workflows/ci.yml` — lint + typecheck + test + build + size-check + 3 verify scripts + npm audit on every PR
  - `.github/workflows/release.yml` — `npm publish --provenance` on v* tag per §15.1
- **Docs + audits**
  - `docs/CHANGELOG.md` (this file), `audits/TEMPLATE.md` (A1-A6 blocking audit-phase template)

### Infrastructure & housekeeping
- GitHub repo: `BainbridgeBuilders/universal-auth` (private), transferred from `samjonaidi-ship-it` to the `BainbridgeBuilders` GitHub org when org was created
- CI pipeline debugged: YAML format quirk (multi-line `on:` trigger form rejected, flow-sequence form works); ESLint 9 flat-config migration; vitest `passWithNoTests` for scaffold-only commits
- `pnpm-lock.yaml` generated via `pnpm install --lockfile-only`; 460 packages resolved
