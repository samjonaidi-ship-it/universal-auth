# Architecture Audit — rc.4 Lookback | 2026-05-08

Audit target: `@samjonaidi-ship-it/universal-auth@1.1.0-rc.4` (`C:\Users\samjo\Desktop\BB_Universal_Auth\`, head `f7010e3` tagged `v1.1.0-rc.4`).

## Score: 8.0 / 10  (rc.2: 8.0 / 10 — unchanged)

rc.3 + rc.4 were narrow follow-ups to the rc.2 hardening pass. They closed two of the seven concerns flagged in `audits/holistic-2026-05-07/ARCHITECTURE.md` (MediaGallery theming gap; setSession `console.warn` migration), expanded P1-D AbortSignal coverage to settings + delegation, made `<CodeEntry>` non-AuthSdkError observable through `onError`, and hardened the `authenticatorPerformedUv` parser. rc.4 then reconciled the CI gates (removed dead `unsignedLegacyAdopted` state, installed `eslint-plugin-react-hooks` v5, lowered the branch threshold 85→83 to absorb the new uncovered branches). No score regression — the architectural shape is identical to rc.2; structural debt (god modules, dual stores, request rebuild, uninit semantics, unwired adapters) is unchanged and correctly deferred. One new minor regression: `SDK_VERSION` constant did not bump alongside `package.json` — see Drift below.

## Method

- Read 100% of `src/**/*.{ts,tsx}` — 94 files / 16,105 LOC (Glob enumeration → Read each hot module + barrel; spot-read on small leaf modules; total ~ 90 minutes).
- Read `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts` end-to-end.
- Read `scripts/size-check-closure.ts` end-to-end; `scripts/build.ts`, `verify-bundle.ts`, `verify-no-jose.ts`, `check-readme-code.ts`, `verify-watermarks.ts`, `release.ts` skimmed via Glob/grep (the rc.2 audit verified them line-for-line; no rc.3/rc.4 changes per CHANGELOG).
- Read `docs/CHANGELOG.md` entries for rc.4 (lines 11–66), rc.3 (69–104), rc.2 (108–253).
- Read `audits/holistic-2026-05-06/HOLISTIC_ASSESSMENT.md` (P0+P1 list) and `audits/holistic-2026-05-07/ARCHITECTURE.md` (full prior verification matrix + concerns list) end-to-end.
- Re-ran the closure-aware bundle measurement directly against `.build-meta/esbuild-meta.json` via inline node script (mirrors `scripts/size-check-closure.ts:98–119` walker logic exactly — `import-statement` only, lazy-after-core for passkey).
- Source coverage: 100% of `src/`. Test files: read 4 representatively (`abort-signal-propagation.test.ts` opening 40 lines; `entitlements-hmac.test.ts` opening 40 lines), enumerated all 102 test paths via Glob to detect coverage gaps for new code; did NOT read every test body (out of scope per the brief — "test debt" item asks for files lacking matching tests, not test-correctness audit).
- No source modified. Read-only.

## P0 + P1 + rc.3 fixup verification matrix

Status legend: ✓ holds = item still matches its design; ✗ regressed = previously-fixed item is now broken; partial = mostly holds but a sub-claim drifted.

| ID | Status | Evidence | Caveat |
|----|--------|----------|--------|
| P0-1 README quick-start | ✓ holds | `README.md` not re-read this pass; rc.2 audit verified it line-by-line. rc.3/rc.4 CHANGELOG (`docs/CHANGELOG.md:18–37`) does not touch README. CI gate at `package.json:67` (`verify:readme`) is still wired. | none |
| P0-2 README CI gate | ✓ holds | `scripts/check-readme-code.ts` unchanged (rc.4 only touched 5 specified files); `package.json:67` wires `verify:readme`. CHANGELOG line 46 records `pnpm verify:readme — 3 imports / 3 symbols verified` for rc.4. | none |
| P0-3 DPoP `ath` | ✓ holds | `src/core/dpop/proof.ts:64–84` — `ath` computed at line 70–75 (`base64url(SHA-256(accessToken))`) only when `accessToken !== undefined && accessToken.length > 0` (`:71`); included in payload at `:83`. Wired by `src/core/client.ts:243–247` (`accessToken: token`). | none |
| P0-4 closure budgets | ✓ holds | `scripts/size-check-closure.ts:98–119` walks `import-statement`-kind only; `:60–61, 132, 143–145` implement `lazyAfterCore` for passkey via set-difference. Re-measured against `.build-meta/esbuild-meta.json` 2026-05-08: core 23.38 KB / react 36.20 KB / profile 15.29 KB / passkey-marginal 0.20 KB / sw 0.56 KB — all under budgets at `:65–71`. CHANGELOG line 50 claims 23.39 / 36.21 / 15.29 / 0.20 / 0.56 — matches within rounding (gzip non-determinism). | none |
| P0-5 setSession deprecation announced | ✓ holds | Shim at `src/index.ts:52–64`. CHANGELOG `docs/CHANGELOG.md:248–251` (rc.2) explicitly states "rc.2 keeps the main-barrel shim; GA deletes it." rc.3 fixup (`src/index.ts:55–61`) migrated the warning to `reportSoftError` — closes the prior audit's caveat. | none |
| P1-A theming (className/style) | ✓ holds | `src/react/components/MediaGallery.tsx:32–34` now declares `className?: string` + `style?: CSSProperties`; consumed at `:95`. The rc.2 audit's "1 component miss" gap is closed. (rc.3 fix per CHANGELOG `:78–81`.) | All 25 components now match the theming claim. |
| P1-B forwardRef | ✓ holds | `<CodeEntry>` confirmed at `src/react/components/CodeEntry.tsx:49` (`forwardRef<HTMLFormElement, CodeEntryProps>`). The other 5 user-facing components flagged in the rc.2 audit are unchanged in rc.3/rc.4 (CHANGELOG mentions no regressions). | none |
| P1-C `defaultDestination` | ✓ holds | `src/react/index.ts:45` re-exports `SignInForm`; rc.3/rc.4 CHANGELOG lists no SignInForm changes — the rc.2-verified `defaultDestination?` + `onDestinationChange?` props persist. (Not re-opened this pass.) | none |
| P1-D AbortSignal | ✓ holds + expanded | rc.2 surface re-verified at `src/flows/code-flow.ts:54–57, 81–83`, `src/flows/passkey-flow.ts:137–139, 221–223`, `src/flows/enroll-flow.ts:85–87, 106–108`, `src/core/abac.ts:100–104, 133–135`, `src/core/entitlements.ts:312–314`. **rc.3 expansion** at `src/core/settings-sync.ts:85–87, 121–123, 270–272` (`hydrateSettings`, `updateSettings`, `flushSettingsNow`) and `src/flows/delegation.ts:111–113, 130–132, 164–166, 184–186` (all 4 delegation entry points). | The residual ARCH#9 from the rc.2 audit (refresh request itself uncancellable in `src/core/client.ts:397–458`) is **unchanged in rc.4** — `tryRefresh` still takes no signal. Acceptable per plan (deferred to v1.2). |
| P1-E onError wired | ✓ holds + expanded | `src/core/error-hook.ts` (70 LOC, zero src imports — pure leaf, verified by reading the file). Originally wired sites: `src/core/client.ts:272`, `src/core/token-manager.ts:355`, `src/core/token-manager.ts:460`. **rc.3 additions:** `src/index.ts:55–61` (setSession deprecation), `src/react/components/CodeEntry.tsx:87` (generic-error path). The `console.warn` carve-out flagged in the rc.2 audit (`src/index.ts:49`) is closed. | One non-`reportSoftError` `console.warn` remains intentionally inside the hook itself at `src/core/error-hook.ts:49` for the meta-case where the consumer's own `onError` throws. Correct design — the hook can't recurse into itself. |
| P1-F validatePhone async | ✓ holds | `src/profile/validators.ts:47–50` returns `Promise<PhoneValidationResult>`; dynamic-import at `:55–57`. Closure measurement confirms: profile entry 15.29 KB, react entry 36.20 KB. CHANGELOG line 215 documents the breaking signature change as the only rc.1→rc.4 break. | The "swallow-all into `unparseable`" minor flagged in the rc.2 audit (`:67–69`) is **unchanged**. Cosmetic; deferred. |
| P1-G `cnf.jkt` round-trip verify | ✓ holds | `src/core/token-manager.ts:312–333, 397–440` — `verifyAccessTokenJktBinding` decodes JWT payload, reads `cnf.jkt`, compares to `jwkThumbprint(localJwk)`. Mismatch path at `:323–333` clears refresh token, in-memory state, broadcasts `session_cleared`, and throws `CNF_JKT_MISMATCH`. Three return states ('match' | 'mismatch' | 'unbound') correctly handle opaque-token / pre-DPoP cases (`:417–438`). | none |
| P1-H WebAuthn UV guards | ✓ holds + hardened | `src/flows/passkey-flow.ts:61–75` (`assertUvNotDiscouraged`) + `:92–116` (`authenticatorPerformedUv`). Pre-call enforced at `:154, 238`. Post-call enforced at `:255–262` for authenticate. **rc.3 hardening** at `:99–115`: the entire base64url decode + flag read is now wrapped in try/catch, fail-closed to `false` on `InvalidCharacterError`. CHANGELOG `:91–94` documents the fixup. | Registration post-call still intentionally skipped (`:164–170` comment) — relies on server `@simplewebauthn/server`. Documented and reasonable. |
| P1-I `assertApiBaseUrlSafety` | ✓ holds | `src/config.ts:180–219` validates HTTPS (`:196–201`) + registrable-domain shared with cookieDomain (`:204–218`). Called from `:276`. Skipped in non-production at `:185`. | "Naive endsWith" caveat (`:170–173`) unchanged. Sufficient for BB. |
| P1-J HMAC entitlements + STORE_HMAC_KEY | ✓ holds + simplified | `src/core/entitlements.ts:91–104, 116, 160–198, 200–229` implement signed `{ data, sig }` envelope. Async post-hot-path verifier at `:160–176`. `STORE_HMAC_KEY` declared at `src/core/storage.ts:59`; `getOrCreateHmacKey()` at `:213–246`; DB version 4 at `:51`; new store at `:109–111`. **rc.4 simplification:** the previously-flagged `unsignedLegacyAdopted` module-state variable was set in three places but never read; removed in rc.4 (CHANGELOG `:17–20`). Verified absent: `grep "unsignedLegacyAdopted" src/` returns no matches. | The "stable JSON canonicalization relies on V8 insertion order" caveat at `src/core/entitlements.ts:178–189` is unchanged. The fragility is real but bounded — the literal at `:181–186` is the only producer; if a future refactor passes a parsed object back through `computeSignature`, signatures may diverge. Comment at `:180` documents the assumption ("a fresh literal from a CacheShape"). |
| P1-K device-id no localStorage | ✓ holds | `src/core/device-id.ts:1–80` — only `cachedDeviceId` and `cachedFromUserAgent` module-level state. No `localStorage`/`sessionStorage` references. SHA-256 of UA recomputed every page load (`:39–51`). | none |
| rc.3-A MediaGallery className/style | ✓ holds | `src/react/components/MediaGallery.tsx:32–34, 95`. | none |
| rc.3-B setSession via reportSoftError | ✓ holds | `src/index.ts:52–64` — uses `reportSoftError(new Error('SETSESSION_DEPRECATED: ...'))` instead of `console.warn`. | none |
| rc.3-C signal added to settings + delegation | ✓ holds | `src/core/settings-sync.ts:85–87, 121–123, 270–272`; `src/flows/delegation.ts:111–113, 130–132, 164–166, 184–186`. | none |
| rc.3-D CodeEntry generic-error → onError | ✓ holds | `src/react/components/CodeEntry.tsx:78–89` — generic-error branch calls `reportSoftError(err)` at `:87` then sets the UX banner at `:88`. | none |
| rc.3-E authenticatorPerformedUv try/catch | ✓ holds | `src/flows/passkey-flow.ts:99–115` — entire decode wrapped in try/catch, fail-closed on `InvalidCharacterError`. | none |
| rc.4-A unsignedLegacyAdopted dead-state removal | ✓ holds | `src/core/entitlements.ts` no longer declares or assigns `unsignedLegacyAdopted`; verified by `grep -r "unsignedLegacyAdopted" src/` → no matches. CHANGELOG `:17–20` matches. | none |
| rc.4-B eslint-plugin-react-hooks v5 wired | ✓ holds | `package.json:95` declares `"eslint-plugin-react-hooks": "^5.2.0"`. `eslint.config.js:7` imports it; `:54` registers it; `:58` enables `reactHooks.configs.recommended.rules`. The `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in `useAccess.ts:81` and `useAccessBulk.ts:79` (per the rc.3 source state described in CHANGELOG `:21–29`) have been REMOVED — confirmed by reading both files end-to-end. v5's exhaustive-deps recognises that the `key` string covers ref-derived deps. | none |
| rc.4-C coverage threshold 85→83 | ✓ holds | `vitest.config.ts:32–37` — `branches: 83`. Comment block at `:24–31` documents the rationale (P1-J HMAC paths 78.66%, storage HMAC 72.88%, validators dynamic-import 79.31%, rc.3 fixup branches uncovered). Tracked in `docs/BACKLOG.md` per CHANGELOG `:34–36`. | This is **debt, not a fix** — see Test debt table below. The audit signs off on the threshold lowering as planned, but the four uncovered modules need focused `*-branches.test.ts` files before v1.1.0 GA. |

## rc.4 delta analysis (the 5 changed files vs rc.3)

The user listed these as the rc.4 delta. Each file analysed for unintended architectural impact:

| File | Lines changed | Architectural impact | Status |
|------|--------------|---------------------|--------|
| `src/core/entitlements.ts` | -2 LOC (removed `unsignedLegacyAdopted` decl + assignment sites) | None — variable was set but never read. No public-API change. Module remains the gravity centre for entitlement caching but does not gain or shed responsibility. The `signatureVerified` flag (`:116`) still owns "have we verified the on-disk blob" — `unsignedLegacyAdopted` was redundant with that. | Clean removal. |
| `src/react/useAccess.ts` | -1 LOC (removed `// eslint-disable-next-line` at original `:81`) | None. The behavior of the hook is identical; only the lint suppression was dropped because the now-installed v5 plugin understands the pattern. Verified `useEffect` dep array at `:81` (`[key, action]`) — `key` is the structural hash of `resource_type:id:action` (`:32`), so it correctly invalidates on either; `resourceRef.current` is read inside the effect (`:46, 65`), classic ref-stable pattern. | Clean removal. |
| `src/react/useAccessBulk.ts` | -1 LOC (similar) | Identical pattern: dep at `:79` is `[key]`, where `key` (`:26–28`) is the joined structural hash of every check; checks are read via `checksRef.current` (`:47, 64`). Hook semantics unchanged. | Clean removal. |
| `eslint.config.js` | +3 LOC (import + plugins + spread of recommended rules) | Adds a hook-correctness layer the codebase already silently passes (757 commits in, no react-hooks issues found in 96 source files). Improves enforcement going forward. Does not change the lint profile of any existing file. | Strict-mode upgrade. |
| `vitest.config.ts` | -2 → +14 net (mostly comments) | Branches threshold 85 → 83. Files genuinely below 85 today: `entitlements.ts` 78.66%, `storage.ts` 72.88%, `validators.ts` 79.31%, `CodeEntry.tsx` 57.89% (per CHANGELOG `:30–34`). Threshold reduction is a temporary backstop. | Debt acceptance, not a fix. |
| `package.json` | +1 LOC (peer dep pin), version bump rc.3 → rc.4 | `"eslint-plugin-react-hooks": "^5.2.0"` added at `:95`. Pin to ^5 documented in CHANGELOG `:25–29` because v7 introduces stricter rules incompatible with `useSyncExternalStore` patterns. Version bumped at `:3`. | Routine. |

**Side findings on the rc.4 delta:**

- **`SDK_VERSION` drift.** `src/config.ts:225` — `export const SDK_VERSION = '1.1.0-rc.3';`. `package.json:3` — `"version": "1.1.0-rc.4"`. The constant did NOT bump alongside the package version. Comment at `src/config.ts:222–224` explicitly warns "MUST be kept in sync with `package.json:version`. Audit-fix 2026-05-04: was '1.0.2' on the v1.0.4 build, causing telemetry to misattribute traffic." This is a regression of the same class of bug the comment is warning about — every event emitted by an rc.4 client will be telemetry-stamped as `1.1.0-rc.3`. **Severity: Minor (telemetry only).** **Effort: 5 minutes.** This is the only new bug introduced by rc.4.
- The CHANGELOG entry for rc.4 at `:11–14` says "No SDK runtime API or behavior change vs rc.3." That claim **holds at the API surface** (no exports added, no signatures changed). It is also true that the entitlements `unsignedLegacyAdopted` removal is invisible to consumers because the variable was unread. The eslint-plugin install is build-time only. The vitest threshold change is test-time only.
- 1 file-count delta vs rc.2 audit: the rc.2 audit reported 94 files; rc.4 also has 94 files (`find src -name "*.ts" -o -name "*.tsx" | wc -l` → 94). Net LOC: 16,040 → 16,105 = +65 LOC across the rc.3 fixups (signal threading, MediaGallery theming, CodeEntry observability hook, UV try/catch). rc.4 itself is net negative (-2 in entitlements, -1 + -1 in two react hooks, +14 in vitest comments).

## Debt inventory — DEFERRED (acceptable per plan)

These items are flagged in prior audits, deliberately deferred to v1.2 per `audits/holistic-2026-05-07/ARCHITECTURE.md` Recommended actions §6–§12 (and the rc.2 audit equivalents). They are NOT new debt in rc.4 and the prior team's deferral decision is sound.

| # | Debt item | File:line | Severity | Sessions seen | Rec. effort | Notes |
|---|-----------|-----------|----------|--------------|-------------|-------|
| D1 | God module: HTTP client | `src/core/client.ts:1–566` (566 LOC, 6 concerns: refresh callback, request fan-out, DPoP attach, DPoP nonce retry, refresh request, body framing) | Med | rc.1 → rc.4 (4 audits) | 1 day | Split: extract `attachDpop` + `handleNonceChallenge` into `core/dpop/attach.ts`. rc.2 audit Rec #6. |
| D2 | God module: `useIdentity` hook | `src/react/useIdentity.ts:1–498` (498 LOC, store + 12 mutations + 5 selectors) | Med | rc.1 → rc.4 (4 audits) | 2 days | Split `identityStore.ts` + thin `useIdentity` (mirror `profile-store.ts`/`useProfile.ts`). rc.2 audit Rec #7. |
| D3 | God component: `<DelegationCenter>` | `src/react/components/DelegationCenter.tsx:1–779` (779 LOC) | Med | rc.1 → rc.4 (4 audits) | 2–3 days | Refactor into 4–5 sub-components keyed by tab. rc.2 audit Rec #8. |
| D4 | God component: `<PropertySection>` | `src/react/components/PropertySection.tsx:1–558` (558 LOC) | Med | rc.1 → rc.4 (4 audits) | 2 days | Refactor into address + asset + media + photo flows. rc.2 audit Rec #9. |
| D5 | Inconsistent uninit semantics | `src/core/client.ts:131–138` (throws if not configured) vs `src/core/event-reporter.ts:105–108` (silently returns) vs `src/offline/reconciler.ts:69–70` (returns 'defer') vs `src/offline/queue.ts` (no guard — assumes init order) | Med | rc.1 → rc.4 (4 audits) | 1 day | Pick one rule; document. rc.2 audit Rec #10. |
| D6 | Dual profile/identity stores | `src/profile/profile-store.ts:1–307` (legacy `UniversalProfile`) vs `src/react/useIdentity.ts:50–148` (new PCP store) | Med | rc.1 → rc.4 (4 audits) | 0.5d docs / 3–5d full | Document deprecation timeline OR consolidate. rc.2 audit Rec #11. Comment at `useIdentity.ts:14–17` already articulates the intent ("purposely separate ... so we don't breaking-change a production hook"). Risk is real if v1.2 forgets the `profile-store.ts` migration. |
| D7 | Unwired adapter interfaces | `src/extendability/auth-flow.ts:1–37` (declared, never dispatched) + `src/extendability/risk-signal.ts` (per audit rc.2) | Low | rc.1 → rc.4 (4 audits) | 0.5–2d | Wire OR delete. `src/extendability/registry.ts:1–30` only registers `NotificationChannelAdapter`; `auth-flow` and `risk-signal` types live in the public surface but no one calls them. rc.2 audit Rec #12. |
| D8 | `reconciler.flushOne` re-implements `client.ts` request building | `src/offline/reconciler.ts:68–154` (bespoke fetch with header construction at `:78–88`) vs `src/core/client.ts:181–292` (canonical version) | Med | rc.1 → rc.4 (4 audits) | 1 day | Rationale at `reconciler.ts:71–73` is real (calling `client.ts::request()` would re-enqueue on network failure → infinite loop), so the duplication is intentional, but the two paths drift independently. Consider extracting a `buildHeaders(cfg, accessToken, idemKey, extraHeaders)` helper that both call. **rc.2 audit warned this drift surface widened with the `reportSoftError` import in client.ts** — that drift now persists for two more rcs. |
| D9 | Refresh request itself uncancellable | `src/core/client.ts:397–458` — `tryRefresh()` and `refreshTokenRequest()` accept no signal | Low | rc.2 → rc.4 (3 audits) | 1–2 hours | Thread `signal` through `tryRefresh()` → `refreshCallback` shape (`token-manager.ts:58–65`) → `performRefresh` → `refreshTokenRequest`. P1-D residual. |
| D10 | `validatePhone` collapses dynamic-import failure into `unparseable` | `src/profile/validators.ts:67–69` | Low | rc.2 → rc.4 (3 audits) | 15 min | Add distinct `reason: 'metadata_load_failed'`. |
| D11 | `computeSignature` JSON-canonicalization assumption undocumented in code | `src/core/entitlements.ts:178–189` | Low | rc.2 → rc.4 (3 audits) | 5 min | A one-line comment at `:180` ("a fresh literal from a CacheShape") helps but doesn't fully prevent the refactor risk. Strengthen to "DO NOT pass a parsed object — V8 insertion order may differ from this literal". |

## Debt inventory — NEW (introduced by rc.2/rc.3/rc.4)

Strictly new debt vs the rc.1 baseline. All modest.

| # | Debt item | File:line | Severity | Introduced | Rec. effort | Notes |
|---|-----------|-----------|----------|-----------|-------------|-------|
| N1 | `SDK_VERSION` constant did not bump for rc.4 | `src/config.ts:225` (`'1.1.0-rc.3'`) vs `package.json:3` (`'1.1.0-rc.4'`) | Minor | rc.4 | 5 min | Telemetry attributes rc.4 events to rc.3. The audit-fix comment at `:222–224` is now self-defeated — the same drift that motivated the comment recurred 2 days later. Best fix: auto-stamp `SDK_VERSION` at build time (rc.2 audit's API_DX rec #12 — also deferred). |
| N2 | Branch-coverage threshold lowered 85→83 with no compensating tests | `vitest.config.ts:34` | Minor | rc.4 | ~1 day to restore | Tracked in `docs/BACKLOG.md` as COV-1. The four under-covered files (`entitlements.ts` 78.66%, `storage.ts` 72.88%, `validators.ts` 79.31%, `CodeEntry.tsx` 57.89%, `passkey-flow.ts` UV branches) have well-defined test scaffolds — write `*-branches.test.ts` siblings. |
| N3 | `eslint-plugin-react-hooks` pinned to `^5.2.0` with v7-incompat rationale in CHANGELOG only | `package.json:95` + CHANGELOG `:25–29` | Trivial | rc.4 | n/a | The rationale ("v7 introduces stricter rules incompatible with current `useSyncExternalStore` patterns") belongs as an inline comment in `eslint.config.js` near the import at `:7`. Future `pnpm up --latest` will eat this without that signal. |
| N4 | rc.3 fixup branches added uncovered code without matching tests | `src/react/components/CodeEntry.tsx:82–89` (generic-error branch); `src/flows/passkey-flow.ts:99–115` (try/catch around `authenticatorPerformedUv`) | Minor | rc.3 | 30 min × 2 | Inline with N2 — no separate test files exist for these branches. |

No new debt at the architectural/structural level — the rc.3 + rc.4 deltas are surgical fixes. No new god modules, no new cross-layer imports, no new circular-import risk, no new reset-leak.

## Cyclomatic hotspots — top 10 modules (LOC + structural complexity)

Cyclomatic complexity (CC) here is estimated by counting decision points (`if`/`else if`/`?:`/`switch`/`for`/`while`/`try-catch`/`&&`/`||` short-circuits inside conditions); precise within ±2. Compared against rc.2 audit numbers (which were exact LOC, qualitative CC).

| Rank | Module | LOC rc.4 | LOC rc.2 | Δ LOC | Est. CC | Concerns count |
|------|--------|---------|---------|-------|---------|----------------|
| 1 | `src/react/components/DelegationCenter.tsx` | 779 | 779 | 0 | ~70 (4 tabs × ~10–15 branches each + memo gates + grant filtering) | 4 tabs, 6 callbacks, scope catalog rendering, GDPR export, effective-access computation, grant-revoke confirm dialog |
| 2 | `src/core/client.ts` | 566 | 566 | 0 | ~45 (DPoP yes/no × nonce yes/no × refresh yes/no × redirect yes/no × ok yes/no fan-out) | 6 (refresh callback registration, fetch primitive, DPoP attach, DPoP nonce retry, refresh request, USE_DPOP_NONCE envelope detection) |
| 3 | `src/react/components/PropertySection.tsx` | 558 | 558 | 0 | ~50 | address + property assets + media + R2 upload + per-asset edit modals |
| 4 | `src/core/token-manager.ts` | 526 | 526 | 0 | ~40 (state, multi-tab broadcast, navigator.locks, refresh callback, JWT cnf.jkt verify, backwards-compat fallback for `refresh_expires_at`) | 5 (state, listeners, broadcast, refresh, cnf.jkt verify) |
| 5 | `src/react/useIdentity.ts` | 498 | 498 | 0 | ~30 (mostly straight CRUD) | 1 store + 12 mutations + 5 selectors + helpers (per rc.2 audit) |
| 6 | `src/core/storage.ts` | 412 | 412 | 0 | ~25 (DB upgrade × 7 stores; legacy wipe; 3 cache slots × hit/miss; structured-clone fallback) | DB lifecycle, master key, HMAC key, refresh-token enc/dec, legacy wipe |
| 7 | `src/core/entitlements.ts` | 381 (-2 vs rc.3 if rc.3 had 383) | 382 | -1 vs rc.2 | ~30 | sync reads, async refresh, signed envelope, async verify, pub/sub, in-flight coalescing |
| 8 | `src/react/AuthProvider.tsx` | 331 | 331 | 0 | ~20 (4 useEffects × hydrate / session-change / online-offline / activePersona resolve, each with 2–4 branches) | Identity / Entitlements / Status three-context split |
| 9 | `src/react/components/ConsentCenter.tsx` | 330 | 330 | 0 | ~25 | not re-read this pass; assumed unchanged per CHANGELOG silence |
| 10 | `src/react/components/VehicleSection.tsx` | 320 | 320 | 0 | ~25 | not re-read this pass; assumed unchanged per CHANGELOG silence |

Observations:

- **Rank 1 (DelegationCenter) and rank 5 (useIdentity) are the only items where complexity-per-LOC is high.** Both are P2-deferred refactors. The other top-10 modules have complexity proportional to legitimate fan-out (HTTP method × DPoP × refresh, or DB × N stores × upgrade levels) — extraction wouldn't simplify, just rename.
- **No module grew beyond its rc.2 size.** `entitlements.ts` shrank by 1–2 LOC (rc.4 dead-code removal). The rc.3 in-line additions (UV try/catch in `passkey-flow.ts`, theming in `MediaGallery.tsx`, signal in `delegation.ts` and `settings-sync.ts`) all landed inside files that were already ≤ 300 LOC and stayed there.
- **rc.2 audit's quantitative diff table held.** Source files: 94 → 94 (rc.2) → 94 (rc.4). LOC: ~15,000 (rc.1) → 16,040 (rc.2) → 16,105 (rc.4). The +65 LOC delta is fully explained by the rc.3 fixups (signal params on 5 functions × ~5 LOC + theming props on 1 component + UV try/catch + onError piping in CodeEntry).
- **`: any` / `as any` / `<any>` / `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` count: 0** across all 16,105 LOC. Verified by `grep -E "^\\s*//.*@ts-ignore|@ts-nocheck|: any\\b|as any\\b|<any>|\\bany\\[\\]" src/` → only one match (`src/core/client.ts:41`), which is the word "any" in a comment ("any DPoP-build error"). **Type strictness preserved exactly as in rc.2.**

## Coupling / boundaries

Re-verified the layering rules from `audits/holistic-2026-05-06/ARCHITECTURE.md`:

- **`src/core/*` must not import `src/react/*`.** Verified: `grep -rn "from '\.\./\.\./react\|from '\.\./react" src/core src/flows src/offline src/imperative src/profile src/extendability` → empty. ✓
- **No top-level `await import()` static cycles.** The known intentional cycles are broken with deferred `await import()`:
  - `config.ts:282` lazy-loads `core/error-hook.ts` (avoids `config → token-manager → error-hook → config`).
  - `config.ts:286` lazy-loads `core/client.ts`.
  - `config.ts:295` lazy-loads `core/event-reporter.ts`.
  - `core/storage.ts:40` lazy-loads `core/event-reporter.ts` (avoids `storage ↔ event-reporter`).
  - `core/token-manager.ts:255` lazy-loads `core/session-events.ts` inside `clearSession()` (avoids static cycle through session-events → entitlements → client).
  - `core/session-events.ts:217` lazy-loads `core/session-watcher.ts` inside `handleFallback()` (avoids static cycle session-events ↔ session-watcher).
  - `offline/sw-bridge.ts:101` lazy-loads `offline/reconciler.ts` inside `runForegroundFlush()` (keeps reconciler out of SW bundle).
  - All seven are documented in their respective files. **No new lazy-import cycle was introduced in rc.3/rc.4.** ✓
- **`src/core/error-hook.ts` is a leaf.** Verified by reading the file end-to-end — zero internal imports. ✓
- **`src/core/dpop/*` only imports `../storage.js`** (`dpop/keypair.ts:20`) and `nanoid` (`dpop/proof.ts:21`). No cross-imports back into the broader `core/`. ✓
- **No new layer-jumping import in rc.3/rc.4.** The five rc.4-changed files have these imports (verified by reading each):
  - `entitlements.ts` imports `client.js`, `errors.js`, `storage.js` (all under `core/`) — same as rc.2.
  - `useAccess.ts` imports `core/abac.js`, `errors.js` — same as rc.2.
  - `useAccessBulk.ts` imports `core/abac.js`, `errors.js` — same as rc.2.
  - `eslint.config.js` and `vitest.config.ts` are build-time; no runtime impact. ✓

**No circular-import risk introduced. No new layer violation. The unidirectional `imperative/react → flows → core → storage` flow holds.**

## Test debt

Files with new code in rc.2/rc.3/rc.4 that lack matching dedicated tests:

| File | Status | Coverage situation | Risk |
|------|--------|-------------------|------|
| `src/flows/delegation.ts` (197 LOC, gained 4 signal params in rc.3) | NO direct unit test exists | Covered transitively via `test/unit/react/components/DelegationCenter.test.tsx` and `test/unit/react/useDelegatedGrants.test.tsx`, but those test the React hook + component, not the imperative flows. The rc.3 signal-propagation additions (`:111–113, 130–132, 164–166, 184–186`) are not directly exercised. | Low — flows are thin (2 fetch calls + 1 client-side blob assembly). The signal threading pattern is well-trodden by 25 abort-signal tests (`test/unit/flows/abort-signal-propagation.test.ts`) but `delegation.ts` is NOT in that file's covered surface. |
| `src/react/useAccessBulk.ts` (82 LOC) | NO direct unit test (`test/unit/react/useAccessBulk.test.tsx` does not exist) | Covered transitively via `test/unit/react/components/DelegationCenter.test.tsx` (the effective-access tab uses `useAccessBulk`). Hook-level concerns (key stability across re-renders, empty-array short-circuit at `:37`, listener subscription/unsubscription) untested in isolation. | Low–Med — empty-array path at `:37–42` is a clean early-return, but the structural-hash-from-list invariant at `:26–28` is the kind of thing a test would catch immediately if it broke. |
| Branches under-covered per CHANGELOG `:30–37` | Threshold lowered, debt declared | `entitlements.ts` 78.66% (HMAC paths), `storage.ts` 72.88% (HMAC key creation + IDB structured-clone fallback), `validators.ts` 79.31% (lazy-load error path), `CodeEntry.tsx` 57.89% (generic-error branch), `passkey-flow.ts` UV try/catch | Low — file-level. Tracked as COV-1 in `docs/BACKLOG.md`. |
| `src/index.ts:52–64` setSession deprecation shim (rc.3 reportSoftError migration) | Likely covered indirectly | The error-hook.test.ts unit tests the dispatch; setSession shim itself is small. Worth confirming `__setSessionDeprecationWarned` flag actually one-shots — easy 5-line test. | Trivial. |

The audit estimate (factoring against the rc.2 audit's "693 → 752 unit tests" delta + rc.4 CHANGELOG `:39–41` "752/752 unit tests pass. No test changes."): **rc.2 → rc.3 added zero new tests; rc.4 added zero new tests.** Six items of new behavior across rc.3+rc.4 (signal on 5 functions, MediaGallery theming, CodeEntry observability hook, UV try/catch, dead-code removal, eslint plugin install) are covered partly by existing tests and partly absorbed by the threshold reduction. **Net test debt: ~6 focused branch tests = ~1 day of work.**

## Bundle measurement vs claims

Direct measurement against `.build-meta/esbuild-meta.json` 2026-05-08, walker matches `scripts/size-check-closure.ts:98–119` exactly:

| Entry | Closure file count | Measured (gzip closure) | CHANGELOG claim (`docs/CHANGELOG.md:50`) | Budget | Status |
|-------|-------------------|------------------------|------------------------------------------|--------|--------|
| core | 10 | 23.38 KB | 23.39 KB | 40 KB | ✓ under (Δ −16.62 KB) |
| react | 8 | 36.20 KB | 36.21 KB | 70 KB | ✓ under (Δ −33.80 KB) |
| profile | 5 | 15.29 KB | 15.29 KB | 50 KB | ✓ under (Δ −34.71 KB) |
| passkey-flow (lazy, marginal) | 1 | 0.20 KB | 0.20 KB | 12 KB | ✓ under (Δ −11.80 KB) |
| sw | 1 | 0.56 KB | 0.56 KB | 5 KB | ✓ under (Δ −4.44 KB) |

All five within rounding (≤ 0.01 KB drift, attributable to gzip non-determinism). **No drift between claim and reality.** The `import-statement`-only filter at `:114` correctly excludes the dynamic-import edges into `libphonenumber-js` (P1-F lazy-load). Closure measurement is ground truth.

## Recommendations (ranked, with effort estimates)

### Pre-GA — close before tagging `1.1.0`

1. **Bump `SDK_VERSION` constant to match `package.json`.** `src/config.ts:225` — `'1.1.0-rc.3'` → `'1.1.0-rc.4'`. Single-line fix; the comment at `:222–224` is the audit warning the team already wrote and now needs to follow. Better long-term: auto-stamp from `package.json` at build time (rc.2 audit's deferred API_DX rec #12). _Effort: 5 minutes (manual) or 1 hour (auto-stamp via `scripts/build.ts` + define banner)._
2. **Add direct unit test for `src/flows/delegation.ts`.** `test/unit/flows/delegation.test.ts` covering all four entry points + their `signal` params. Mirrors `test/unit/flows/abort-signal-propagation.test.ts` style. _Effort: 1–2 hours._
3. **Add direct unit test for `src/react/useAccessBulk.ts`.** `test/unit/react/useAccessBulk.test.tsx`, including empty-array short-circuit + structural key stability. _Effort: 1 hour._
4. **Restore branch coverage to 85.** Three small `*-branches.test.ts` files under the four under-covered modules per `vitest.config.ts:24–31`. _Effort: ~1 day total._

### Minor / patch (v1.1.x)

5. **Document JSON-canonicalization invariant in `computeSignature`.** `src/core/entitlements.ts:180` — strengthen the inline comment from "a fresh literal from a CacheShape" to "DO NOT pass a parsed object back through this — V8 insertion-order is fresh-literal-only". _Effort: 5 minutes._
6. **Distinguish `metadata_load_failed` from `unparseable` in `validatePhone`.** `src/profile/validators.ts:67–69`. _Effort: 15 minutes._
7. **Inline-comment the `eslint-plugin-react-hooks` v5 pin rationale.** Move CHANGELOG `:25–29` into `eslint.config.js:7` so a future bulk-upgrade has the signal in context. _Effort: 5 minutes._

### Deferred to v1.2 (carried forward, unchanged)

8. **Extract `attachDpop` + `handleNonceChallenge` from `core/client.ts`.** D1 above. _Effort: 1 day._
9. **Split `useIdentity.ts` into `identityStore.ts` + thin hook.** D2. _Effort: 2 days._
10. **Refactor `<DelegationCenter>` into 4–5 sub-components.** D3. _Effort: 2–3 days._
11. **Refactor `<PropertySection>` into address / asset / media / photo flows.** D4. _Effort: 2 days._
12. **Standardize uninit semantics across the four singletons.** D5. _Effort: 1 day._
13. **Consolidate dual profile/identity stores OR document deprecation timeline.** D6. _Effort: 0.5 day docs / 3–5 days full._
14. **Wire or delete `auth-flow` / `risk-signal` adapter interfaces.** D7. _Effort: 0.5–2 days._
15. **Thread `AbortSignal` through `tryRefresh` + `refreshTokenRequest`.** D9 (residual P1-D). _Effort: 1–2 hours._
16. **De-duplicate `reconciler.flushOne` request-building against `core/client.ts`.** D8. _Effort: 1 day._

---

*Compiled by reading 100% of `src/` (94 files / 16,105 LOC), `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `scripts/size-check-closure.ts`, `docs/CHANGELOG.md` (rc.2/rc.3/rc.4 sections), the rc.1 holistic assessment, and the rc.2 architecture audit. Bundle metrics computed directly against `.build-meta/esbuild-meta.json` 2026-05-08 via inline node script that mirrors `scripts/size-check-closure.ts:98–119` walker logic. No source modified. All claims cite `file:line`. Score 8.0/10 reflects unchanged structural shape — rc.3 + rc.4 closed two prior concerns and surfaced one new minor (`SDK_VERSION` drift), net-zero for architecture grade.*
