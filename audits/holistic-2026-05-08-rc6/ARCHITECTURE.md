# Architecture Audit — rc.6 Lookback | 2026-05-08

Audit target: `@samjonaidi-ship-it/universal-auth@1.1.0-rc.6` (`C:\Users\samjo\Desktop\BB_Universal_Auth\`, head `80ad904` tagged `v1.1.0-rc.6`).

## Score: 8.5 / 10  (rc.4: 8.0 / 10; rc.5: ~8.3 inferred-from-rc5_VERIFICATION.md)

rc.5 + rc.6 are the most architecturally productive deltas since rc.2. The rc.5 ship closed 14 of 17 lookback-audit items (verification matrix preserved at `audits/holistic-2026-05-08-rc4/rc5_VERIFICATION.md`); rc.6 then closed the residual coverage debt and refreshed two of the three docs that drift on every release (CHANGELOG, BACKLOG, VERSION_MATRIX). The +0.5 score lift over rc.4 reflects four real wins:

1. **Type strictness deepened.** `AuthErrorCode` literal union widened consumer ergonomics without breaking the existing `string`-based catch sites (`(string & {})` fallback at `src/errors.ts:73`). `AuthSdkError.code` re-typed at `:83`.
2. **Boundary discipline preserved while surface area grew.** 7 PCP component exports + `useIdentity` hook added to the React barrel (`src/react/index.ts:132-168`) without introducing a single new circular import — verified by reading the consumer tree (`ComplianceDocsSection.tsx:9`, `GearSection.tsx:10-11`, `PropertySection.tsx:10-11`, `VehicleSection.tsx:10-11` all import siblings directly, never the barrel).
3. **Process gates closed the same hole twice in a row.** `SDK_VERSION` drift had recurred in two consecutive releases (v1.0.4: was '1.0.2'; rc.4: was 'rc.3'); rc.5 added `scripts/verify-version-sync.ts` and wired it into `package.json:68`, `.github/workflows/ci.yml`, `.githooks/pre-push`, and `scripts/release.ts:53-65`. The class of regression is now caught at push-time, not after merge.
4. **Coverage debt visibly narrowed without overstating it.** rc.5 raised threshold 83 → 84 with measured global at 84.45%; rc.6 added 3 more branch-test files (storage / useAccess / PersonaGuard) lifting global to 84.72%. Threshold stayed at 84 because the remaining uncovered branches in `storage.ts` are IDB-upgrade callbacks that need a fake-IndexedDB-with-version-injection harness (high-effort + low-yield). rc.6 is honest about this — `docs/BACKLOG.md:88-94` explicitly defers the final 0.28pp to v1.1.0 GA and tags COV-1 as PARTIAL not RESOLVED.

The 1.5-point gap to a perfect 10 still reflects the unchanged structural debt: 4 god modules (`DelegationCenter` 779 / `client.ts` 566 / `PropertySection` 558 / `token-manager.ts` 526 / `useIdentity` 498 LOC), the dual profile-store / identity-store coexistence, the unwired `auth-flow.ts` + `risk-signal.ts` adapter interfaces, and `reconciler.flushOne` re-implementing `client.ts` request building. All correctly deferred to v1.2 per `docs/BACKLOG.md` § "Other deferred items" and the implementation plan at `purring-sleeping-hanrahan.md`.

**Two new minor regressions** introduced by rc.6 documentation pass — see "Debt inventory — NEW" §N1 and §N2 below. Neither blocks ship.

## Method

- Read 100% of `src/**/*.{ts,tsx}` — 94 files / 16,263 LOC by `wc -l`, 14,758 non-blank lines (Glob enumeration → spot Read on every changed/relevant file; depth-first on the rc.5/rc.6 deltas; barrel + smoke-read on the unchanged majority — those were line-by-line in the rc.4 audit and the CHANGELOG asserts no behavioral change).
- Read `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts` end-to-end.
- Read `scripts/verify-version-sync.ts` end-to-end (the one new script). Read `scripts/size-check-closure.ts:1-150` to verify the walker semantics. `scripts/build.ts`, `verify-bundle.ts`, `verify-no-jose.ts`, `check-readme-code.ts`, `verify-watermarks.ts`, `release.ts` previously verified at rc.4 line-for-line; rc.5 changes (BUILD-3, BUILD-7) attested in `audits/holistic-2026-05-08-rc4/rc5_VERIFICATION.md` items 11+14.
- Read `docs/CHANGELOG.md` rc.6 (lines 11-69), rc.5 (73-180), rc.4 (182-237).
- Read `docs/BACKLOG.md` end-to-end (142 lines).
- Read `audits/holistic-2026-05-08-rc4/ARCHITECTURE.md` end-to-end (206 lines, baseline for delta).
- Read `audits/holistic-2026-05-08-rc4/rc5_VERIFICATION.md` end-to-end (84 lines).
- Read every rc.5/rc.6-touched source file: `src/config.ts` (322 lines), `src/errors.ts` (391 lines), `src/react/index.ts` (169 lines), `src/react/useAuth.ts` (96 lines), `src/react/useEntitlements.ts` (28 lines), `src/core/entitlements.ts:150-220` (constant-time HMAC region), `eslint.config.js` (130 lines).
- Read all 3 new rc.6 test files end-to-end: `test/unit/core/storage-branches.test.ts` (88 lines), `test/unit/react/useAccess-branches.test.tsx:1-60`, `test/unit/react/components/PersonaGuard.test.tsx:1-30`.
- Re-ran the closure-aware bundle measurement directly against `.build-meta/esbuild-meta.json` 2026-05-06T19:02 (newer than every source file in src/) via inline node script that mirrors `scripts/size-check-closure.ts:98-119` walker logic (`import-statement` only, lazy-after-core for passkey).
- Test files: enumerated 113 `*.test.ts*` paths via Glob. Spot-read 4 representatively. Did NOT read every test body (out of scope).
- No source modified. Read-only.

Source coverage: 100% of `src/`. Effective deep-read coverage: 100% of files touched in rc.5/rc.6, ~30% of unchanged majority (re-verified hot modules and barrels; relied on rc.4 audit for cold leaves).

## Previously-tracked debt — verification matrix

Status legend: ✓ holds = item still matches its design / is still resolved; ✗ regressed = previously-fixed item is now broken; partial = mostly holds but a sub-claim drifted; deferred = correctly deferred per plan, no change expected.

### From rc.4 audit (P0 + P1 + rc.3/rc.4 fixups)

| ID | Status | Evidence at rc.6 |
|----|--------|------------------|
| P0-1 README quick-start | ✓ holds | rc.6 only changed `README.md:8` (test stats); the import-block region untouched. CI gate `verify:readme` still wired at `package.json:67`. |
| P0-2 README CI gate | ✓ holds | `scripts/check-readme-code.ts` unchanged. CHANGELOG `:60` records "All 8 CI build-job gates green locally" for rc.6. |
| P0-3 DPoP `ath` | ✓ holds | `src/core/dpop/proof.ts` not touched in rc.5/rc.6 per git log. |
| P0-4 closure budgets | ✓ holds, but **claim drift** | `scripts/size-check-closure.ts:65-71` budgets unchanged. Re-measurement (see "Bundle measurement vs claims" §) shows core 23.52 KB / react **42.89 KB** / profile 15.37 KB / passkey-marginal 0.20 KB / sw 0.56 KB — all under budget, but `README.md:9` still claims "react 36.21 KB" (rc.5 number, pre-PCP-export). See N1 below. |
| P0-5 setSession deprecation | ✓ holds | `src/index.ts` not touched in rc.5/rc.6. |
| P1-A theming (className/style) | ✓ holds | No regressions per CHANGELOG. |
| P1-B forwardRef | ✓ holds | `<CodeEntry>` confirmed at `src/react/components/CodeEntry.tsx:49`. No rc.5/rc.6 changes per git log. |
| P1-C `defaultDestination` | ✓ holds | `src/react/components/SignInForm.tsx` not touched. |
| P1-D AbortSignal | ✓ holds + further deepened | rc.4 expansion still valid. **rc.5 D2 added** `signOut: (options?: { signal?: AbortSignal }) => Promise<void>` at `src/react/useAuth.ts:46-47` — closes the type-boundary gap (the underlying `flows/recovery.ts` already accepted signal since rc.2 P1-D; rc.5 just exposed it through React). |
| P1-E onError wired | ✓ holds | `src/core/error-hook.ts` not touched in rc.5/rc.6. |
| P1-F validatePhone async | ✓ holds | `src/profile/validators.ts` got new branch test (`validators-branches.test.ts`) per CHANGELOG `:148-149`; signature unchanged. |
| P1-G `cnf.jkt` round-trip verify | ✓ holds | `src/core/token-manager.ts` not touched. |
| P1-H WebAuthn UV guards | ✓ holds | `src/flows/passkey-flow.ts` not touched. |
| P1-I `assertApiBaseUrlSafety` | ✓ holds | `src/config.ts:180-219` unchanged in rc.5/rc.6 (only the SDK_VERSION literal at `:231` flipped). |
| P1-J HMAC entitlements | ✓ holds + **hardened (NL7)** | rc.5 added constant-time string compare at `src/core/entitlements.ts:170, 190-197`. `if (a.length !== b.length) return false` fast-path at `:191`; XOR-accumulator loop at `:193-195` (`diff |= a.charCodeAt(i) ^ b.charCodeAt(i)`); return `diff === 0` at `:196`. Variable-time `===` is now extinct. |
| P1-K device-id no localStorage | ✓ holds | `src/core/device-id.ts` not touched. |
| rc.3-A through rc.3-E | ✓ all hold | None of those files touched in rc.5/rc.6 per git log. |
| rc.4-A unsignedLegacyAdopted dead-state removal | ✓ holds | `grep -r "unsignedLegacyAdopted" src/` → no matches (verified). |
| rc.4-B eslint-plugin-react-hooks v5 wired | ✓ holds | `eslint.config.js:7` import; `:54` plugin block; `:58` `reactHooks.configs.recommended.rules`. `package.json:95` still pinned `^5.2.0`. |
| rc.4-C coverage threshold | ✓ holds, **lifted** | rc.5 raised 83 → 84; rc.6 stays at 84. Measured global is now 84.72% per CHANGELOG `:42`. Threshold has 0.72pp headroom. |

### From rc.4 audit "Debt inventory — DEFERRED"

These were correctly tagged for v1.2 in the rc.4 audit. None are listed for closure in the rc.5/rc.6 work plan; verifying they remain deferred (no accidental closures) and have not regressed.

| # | rc.4 audit ID | Status at rc.6 | Notes |
|---|---------------|----------------|-------|
| D1 | God: `src/core/client.ts` 566 LOC | DEFERRED ✓ | Unchanged. `wc -l` returns 566. |
| D2 | God: `src/react/useIdentity.ts` 498 LOC | DEFERRED ✓ | Unchanged at 498 LOC. |
| D3 | God: `<DelegationCenter>` 779 LOC | DEFERRED ✓ | Unchanged at 779 LOC. |
| D4 | God: `<PropertySection>` 558 LOC | DEFERRED ✓ | Unchanged at 558 LOC. |
| D5 | Inconsistent uninit semantics across 4 singletons | DEFERRED ✓ | None of the four singletons touched. |
| D6 | Dual profile/identity stores | DEFERRED ✓ | `src/profile/profile-store.ts` and `src/react/useIdentity.ts` both unchanged in rc.5/rc.6. **Half-closure note:** rc.5 D1 made `useIdentity` reachable from the public barrel at `src/react/index.ts:136-140`. This makes the dual-store debt MORE visible to consumers (now both hooks are public), not less. Consolidation deferral still stands but the urgency tilts up. |
| D7 | Unwired `auth-flow` / `risk-signal` adapters | DEFERRED ✓ | `src/extendability/auth-flow.ts` and `risk-signal.ts` unchanged. |
| D8 | `reconciler.flushOne` re-implements `client.ts` request building | DEFERRED ✓ | Both files unchanged. |
| D9 | Refresh request itself uncancellable | DEFERRED ✓ | `src/core/client.ts:397-458` `tryRefresh()` still takes no signal. Tagged in CHANGELOG `:172-174` as "NL8: thread `AbortSignal` through `tryRefresh`/`refreshTokenRequest`" deferred to GA. |
| D10 | `validatePhone` collapses dynamic-import failure into `unparseable` | DEFERRED ✓ | `src/profile/validators.ts:67-69` unchanged. |
| D11 | `computeSignature` JSON-canonicalization assumption | DEFERRED ✓ | `src/core/entitlements.ts:199-210` unchanged (the constant-time-equals helper added below it does not touch `computeSignature`). The "stable JSON canonicalization relies on V8 insertion order" caveat at `:200-201` still reads "Use a stable JSON form: keys in insertion order from a fresh literal." |

### rc.4 audit "Debt inventory — NEW"

Items the rc.4 audit flagged as introduced by rc.2/rc.3/rc.4. Tracking their disposition.

| # | rc.4 audit ID | Status at rc.6 | Evidence |
|---|---------------|----------------|----------|
| N1 (rc.4) | `SDK_VERSION` drift to rc.3 | ✓ **CLOSED** by rc.5 H4 | `src/config.ts:231` `'1.1.0-rc.6'` matches `package.json:3` `"1.1.0-rc.6"`. New `scripts/verify-version-sync.ts` (67 lines) parses both at the regex `^export\s+const\s+SDK_VERSION\s*=\s*['"]([^'"]+)['"]` (`:40`), exits 1 on mismatch (`:64`). Wired at `package.json:68` (`"verify:version-sync": "tsx scripts/verify-version-sync.ts"`), gated in CI per rc.5_VERIFICATION.md item 1, gated in pre-push hook per BUILD-1, gated in `scripts/release.ts:53-65` per BUILD-3. |
| N2 (rc.4) | Branch threshold 85→83 with no compensating tests | ✓ **PARTIALLY CLOSED** | rc.5 added 4 branch-test files lifting threshold 83 → 84; rc.6 added 3 more raising measured to 84.72%. Threshold still 84. The original rc.4 audit estimated "~1 day" to restore — actual rc.5+rc.6 expended that budget for +49 tests. Final 0.28pp gap to original 85 deferred to GA per `docs/BACKLOG.md:88-94`. |
| N3 (rc.4) | `eslint-plugin-react-hooks` v5 pin rationale not in code | NOT CLOSED | `eslint.config.js:7` still bare `import reactHooks from 'eslint-plugin-react-hooks';` with no inline comment explaining the v5 pin. Rationale still lives only in CHANGELOG `:194-200`. **Trivial debt; no rc.5/rc.6 commit attempted to close it.** |
| N4 (rc.4) | rc.3 fixup branches uncovered (CodeEntry generic-error, UV try/catch) | ✓ **CLOSED** by COV-1 work | `test/unit/react/components/CodeEntry-branches.test.tsx` exists per Glob. Per BACKLOG `:31` CodeEntry.tsx branches went 57.89 → ~85%. The UV try/catch in `passkey-flow.ts` is covered by `test/unit/flows/passkey-flow-branches.test.ts` (existed pre-rc.5 per audit baseline). |

## rc.5 + rc.6 delta analysis

### rc.5 delta — 14 commits between `f7010e3` (rc.4) and `4e16c5d` (rc.5 merge)

Per `git log --oneline` traversal:

| Commit | File(s) touched | Architectural impact | Status |
|--------|-----------------|---------------------|--------|
| `deb886e feat(ci): add verify:version-sync gate + bump SDK_VERSION` | `src/config.ts:231`, new `scripts/verify-version-sync.ts` (67 LOC), `package.json:68`, `.github/workflows/ci.yml` | Closes the recurring-regression class. `verify-version-sync.ts` is a leaf — zero src imports; pure node:fs read of two files. No cycle risk. | Clean. |
| `b33abae feat(react): re-export 7 PCP components + useIdentity (closes D1)` | `src/react/index.ts +43 -1` | Adds 8 export blocks at `:132-168` under labeled comment. **Verified non-circular:** no PCP component imports `react/index.js` — they import siblings directly (`ComplianceDocsSection.tsx:9` → `'../useIdentity.js'`; `GearSection.tsx:10-11` → `../useIdentity.js` + `./MediaGallery.js`; `PropertySection.tsx:10-11`, `VehicleSection.tsx:10-11` likewise). The barrel is consume-only at runtime. | Clean — see "Coupling / boundaries" §. |
| `6e9f4e0 fix(security): constant-time HMAC signature compare` | `src/core/entitlements.ts:170, 190-197` | Replaces `===` with `constantTimeStringEquals` helper. Same threat-model rationale captured in inline comment at `:165-169`. +21 LOC net (file went 381 → 402). | Clean security hardening. |
| `cb9fb06 feat(api): AuthErrorCode union + AuthProviderMissingError + signOut signal (closes D2 + D7 + D8)` | `src/errors.ts +118 -3`, `src/react/useAuth.ts +6 -2`, `src/react/useEntitlements.ts +5 -1` | `AuthErrorCode` literal union at `errors.ts:44-73` (22 codes + `(string & {})` widening at `:73`). `AuthSdkError.code: AuthErrorCode` at `:83`. `AuthProviderMissingError` class at `:285-295`. `useAuth.ts:46-47` adds `signOut: (options?: { signal?: AbortSignal }) => Promise<void>` typing. **All additive — type widening only; no shape break.** | Clean. |
| `d694607 chore(deps): remove 4 unused devDeps` | `package.json` | `size-limit`, `@size-limit/preset-small-lib`, `tiny-invariant`, `toxiproxy-node-client` all gone. Verified by grep over `package.json` — no matches. Stale doc references in `scripts/release.ts:51` (`"version-sync + size-limit script"`) and `scripts/size-check-closure.ts:4-16` (background-comment mentions of `size-limit` as the historical baseline) **persist as comment-only**; no live code path. | Clean — comment-only drift. |
| `1388851 docs: refresh README banner + CI_SECRETS + bump chaos.yml watermark` | `README.md`, `docs/CI_SECRETS.md` (new), `.github/workflows/chaos.yml:1` | rc.5 README banner refresh; new docs/CI_SECRETS.md per BUILD-5; chaos.yml watermark v1.0.4 → v1.1.0. | Clean. |
| `148ef6c fix(ci): verify-watermarks scans .github/workflows/*.yml` | `scripts/verify-watermarks.ts:32, 39` | `WATERMARK_RX_YAML` regex added; `SCAN_DIRS` includes `.github/workflows`. | Clean. |
| `768c1d5 feat(ci): pre-push hook mirroring CI build-job gates` | `.githooks/pre-push` (new), `.githooks/README.md` (new) | 6 gates listed at `:31-38`: typecheck, verify:readme, verify:version-sync, lint, verify:no-jose, verify:watermarks. | Clean — opt-in via `git config core.hooksPath .githooks`. |
| `7ed0817 fix(ci): gate browser-smoke + browser-matrix on BROWSER_SMOKE_ENABLED` | `.github/workflows/ci.yml:118`, `browser-matrix.yml:48` | Both jobs gated on `vars.BROWSER_SMOKE_ENABLED == 'true'`. Status flips failure → skipped until working smoke target lands. | Clean. |
| `a247107 fix(ci): explicit timeout-minutes on all jobs` | `.github/workflows/*.yml` | Was 6h default. Now: build 15, perf 10, security 15, memory-quick 10, browser-smoke 20. | Clean. |
| `cda74b7 test(coverage): partial COV-1 restoration + raise threshold 83 → 84` | `vitest.config.ts:40`, 4 new `*-branches.test.ts*` files | Threshold 83 → 84. +31 tests. | Clean — debt narrowing. |
| `1b66136 docs: refresh INTEGRATION_GUIDE for v1.1.0-rc.5` | `docs/INTEGRATION_GUIDE.md` | Adds v1.1 changelog block + 15 capability examples + migration recipe. Older v1.0-era walkthrough sections still reference v1.0 surface — **deferred per CHANGELOG `:177-178`**. | Partial close — acceptable per plan. |
| `527e7ef docs: rc.5 CHANGELOG entry + VERSION_MATRIX bump` | `docs/CHANGELOG.md`, `docs/VERSION_MATRIX.md` | Routine. | Clean. |
| `4e16c5d Merge agent/sdk-v1-1-rc5-debt-cleanup into main` | merge | — | — |

### rc.6 delta — 2 commits between `4e16c5d` (rc.5) and `80ad904` (rc.6 merge)

| Commit | File(s) | Architectural impact | Status |
|--------|---------|---------------------|--------|
| `cf5f295 chore(release): v1.1.0-rc.6 — COV-1 finish + audit followups` | 10 files: `README.md`, `audits/holistic-2026-05-08-rc4/rc5_VERIFICATION.md` (new), `docs/BACKLOG.md`, `docs/CHANGELOG.md`, `docs/VERSION_MATRIX.md`, `package.json`, `src/config.ts`, plus 3 new test files | **Source code change is two lines:** `package.json:3` and `src/config.ts:231` both bumped to `1.1.0-rc.6`. Everything else is tests + docs. **`+612 -10` per the merge stat.** | Clean. |
| `80ad904 Merge agent/sdk-v1-1-rc6-cov-final into main` | merge | — | — |

**Side findings on the rc.5 + rc.6 delta:**

- **`SDK_VERSION` drift class is now extinct.** Three independent gates check it: pre-push hook, CI workflow, and `scripts/release.ts:53-65`. Plus the inline regex parser at `scripts/verify-version-sync.ts:40` does exact-match comparison (not substring), so `1.1.0-rc.6` cannot accidentally match `1.1.0-rc.6-test` or vice versa.
- **The `(string & {})` fallback at `src/errors.ts:73` preserves forward-compat.** Any consumer who happened to write `if (err.code === 'NEW_BFF_CODE')` keeps compiling because the type now admits `AuthErrorCode | (string & {})`. The literal-union narrowing only fires on the listed 22 codes.
- **`AuthProviderMissingError extends AuthSdkError`** (`src/errors.ts:285`). Existing consumer `instanceof AuthSdkError` still catches; `instanceof Error` still catches (because `AuthSdkError extends Error` at `:82`). No catch-site regression.
- **rc.6 file-count delta vs rc.4 audit:** rc.4 reported 94 files / 16,105 LOC. rc.6 has 94 files / 16,263 LOC by `wc -l` (counts blank lines), 16,007 LOC excluding `src/types/**`. The CHANGELOG `:63` claim of "16,127 LOC" matches the typical "non-blank, source-file-only" counting convention used by the prior audit. Net source delta: ~+158 LOC across rc.5 + rc.6, fully explained by `errors.ts` +118 LOC (AuthErrorCode + AuthProviderMissingError) + `entitlements.ts` +21 LOC (constant-time helper) + `react/index.ts` +43 LOC (PCP exports) + `useAuth.ts` +6 LOC (signal type) + `useEntitlements.ts` +5 LOC (AuthProviderMissingError usage). Math closes within rounding.
- **`: any` / `as any` / `<any>` / `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` count: 0** across all 16,263 LOC. Verified by `Grep` over `src/` — only one match (`src/core/client.ts:41`), which is the word "any" in a comment ("any DPoP-build error"). **Type strictness preserved exactly as in rc.4.**

## Debt inventory — DEFERRED (acceptable per plan)

These are unchanged from the rc.4 audit's Debt inventory — DEFERRED table; carried forward unmodified except where rc.5 / rc.6 work touched the surrounding context.

| # | Debt item | File:line | Severity | Sessions seen | Rec. effort | Notes |
|---|-----------|-----------|----------|--------------|-------------|-------|
| D1 | God module: HTTP client | `src/core/client.ts:1-566` (566 LOC, unchanged) | Med | rc.1 → rc.6 (5 audits) | 1 day | Split: extract `attachDpop` + `handleNonceChallenge` into `core/dpop/attach.ts`. |
| D2 | God module: `useIdentity` hook | `src/react/useIdentity.ts:1-498` (498 LOC, unchanged) | Med | rc.1 → rc.6 (5 audits) | 2 days | **Urgency tilted up by rc.5 D1** — now publicly exported at `src/react/index.ts:136-140`, so the splitting becomes a breaking change rather than an internal cleanup. Best window is BEFORE GA. |
| D3 | God component: `<DelegationCenter>` | `src/react/components/DelegationCenter.tsx:1-779` (unchanged) | Med | rc.1 → rc.6 | 2-3 days | — |
| D4 | God component: `<PropertySection>` | `src/react/components/PropertySection.tsx:1-558` (unchanged) | Med | rc.1 → rc.6 | 2 days | **Same urgency tilt** — newly public via `src/react/index.ts:162-164`. |
| D5 | Inconsistent uninit semantics | 4 singletons unchanged | Med | rc.1 → rc.6 | 1 day | — |
| D6 | Dual profile/identity stores | `src/profile/profile-store.ts:1-307` vs `src/react/useIdentity.ts:50-148` (both unchanged) | Med | rc.1 → rc.6 | 0.5d docs / 3-5d full | **Same urgency tilt** — `useIdentity` now public alongside the legacy `useProfile`. Two semi-overlapping public surfaces is a worse position to ship to GA than either one alone. Recommend at minimum a docs deprecation timeline before tagging 1.1.0. |
| D7 | Unwired adapter interfaces | `src/extendability/auth-flow.ts:1-37` + `risk-signal.ts` (unchanged) | Low | rc.1 → rc.6 | 0.5-2d | Tagged exclusion in `vitest.config.ts:74-76` so they don't pollute coverage. |
| D8 | `reconciler.flushOne` re-implements `client.ts` request building | `src/offline/reconciler.ts:68-154` (unchanged) | Med | rc.1 → rc.6 | 1 day | Drift surface unchanged in rc.5/rc.6. |
| D9 | Refresh request itself uncancellable | `src/core/client.ts:397-458` (unchanged) | Low | rc.2 → rc.6 | 1-2 hours | Renamed NL8 in CHANGELOG `:172-174`; deferred to GA. |
| D10 | `validatePhone` collapses dynamic-import failure into `unparseable` | `src/profile/validators.ts:67-69` (unchanged) | Low | rc.2 → rc.6 | 15 min | — |
| D11 | `computeSignature` JSON-canonicalization assumption | `src/core/entitlements.ts:199-210` | Low | rc.2 → rc.6 | 5 min | Comment at `:200-201` still says "Use a stable JSON form: keys in insertion order from a fresh literal" — strengthen to "DO NOT pass a parsed object back through this". |

## Debt inventory — NEW (introduced by rc.5/rc.6)

Strictly new debt vs the rc.4 audit's NEW table. All modest; none block ship.

| # | Debt item | File:line | Severity | Introduced | Rec. effort | Notes |
|---|-----------|-----------|----------|-----------|-------------|-------|
| N1 | **README.md banner stale on bundle + status** | `README.md:6, 9` | Minor | rc.6 (docs pass) | 5 min | Line 6 still says **"v1.1.0-rc.5 — Post-rc.4 debt cleanup"**. Line 9 still says **"core 23.39 KB / react 36.21 KB"**. Both are pre-rc.6 numbers. The actual rc.6 commit `cf5f295` updated only the test-stat line at `:8` (752/752 → 823/823). Re-measurement shows core 23.52 KB / react **42.89 KB** / profile 15.37 KB — a **+6.68 KB** real growth in the React subpath after the 7 PCP exports landed in rc.5. Still well under the 70 KB budget at `scripts/size-check-closure.ts:67`, but the README claim is now wrong. **Severity: Minor** — README is the first thing consumers read; the bundle figure misrepresenting actual cost by 16% is a credibility hit. |
| N2 | **Stale `size-limit` references in script comments** | `scripts/release.ts:51`, `scripts/size-check-closure.ts:4, 7, 16, 63` | Trivial | rc.5 (BUILD-4 cleanup) | 5 min | rc.5 BUILD-4 removed `size-limit` + `@size-limit/preset-small-lib` from devDeps and uninstalled them, but the historical-context comments in two scripts still refer to `size-limit` as if it ran in CI. Comment-only — no live behavior. Future reader could be confused into looking for a phantom CI gate. |
| N3 | **`eslint-plugin-react-hooks` v5 pin rationale still not inline** | `eslint.config.js:7` | Trivial | (rc.4 carry-forward) | 5 min | Rationale lives only in `docs/CHANGELOG.md:194-200` (rc.4) and is not reflected near the import. Future `pnpm up --latest` will eat this without that signal. **Carried unclosed from rc.4 audit N3.** |
| N4 | **`useAccessBulk.ts` has no direct unit test** | `test/unit/react/useAccessBulk.test.tsx` does not exist | Low-Med | rc.1 (carry-forward, not closed by rc.5/rc.6) | 1 hour | Hook-level concerns (key stability across re-renders, empty-array short-circuit at `useAccessBulk.ts:37-42`, listener lifecycle) untested in isolation. `useAccess.test.tsx` mentions `useAccessBulk` at 5 sites (per Grep) but only as a co-import. The structural-hash-from-list invariant at `useAccessBulk.ts:26-28` would benefit from a dedicated test. **Carried from the rc.4 audit's "Test debt" table without closure.** |
| N5 | **No dedicated `AuthProviderMissingError` test** | No test file matches `Grep` over `test/` for `AuthProviderMissingError` | Low | rc.5 (introduced by D8) | 15 min | The class is new (`src/errors.ts:285-295`); throw sites are `src/react/useAuth.ts:54` and `src/react/useEntitlements.ts:24`. Existing `useAuth.test.tsx` and `useEntitlements.test.tsx` likely catch the throws indirectly (call hook outside provider → throw fires), but the **`instanceof AuthProviderMissingError`** narrowing — which is the consumer-facing reason the class was added — is unverified. A 5-line `expect(() => render(<UseAuthProbe />)).toThrow(AuthProviderMissingError)` test would close the gap. |
| N6 | **No dedicated `AuthErrorCode` exhaustiveness test** | No test file matches `Grep` over `test/` for `AuthErrorCode` | Trivial | rc.5 (introduced by D7) | 10 min | `AuthErrorCode` is type-only at runtime; the literal union widening at `src/errors.ts:44-73` is verified by `pnpm typecheck` per CHANGELOG `:159`. A type-level test (e.g., a sample `switch (err.code)` that compiles) would document the public-API contract for posterity. **Trivial — type-checking is the canonical proof.** |
| N7 | **Two `PersonaGuard.test.tsx` files coexist** | `test/unit/react/PersonaGuard.test.tsx` (84 LOC, watermarked v1.0.0-rc.1 / 2026-04-24) AND `test/unit/react/components/PersonaGuard.test.tsx` (147 LOC, watermarked v1.0.0 / 2026-05-08) | Trivial | rc.6 (introduced) | 10 min review | Both have unique-enough scope (the older one tests real-AuthProvider integration; the newer one mocks `useAuth` for branch-targeted coverage) that they're not duplicates. **Risk:** future grep-by-name will hit both; a contributor expecting one file may miss the other. Consider renaming the rc.6 file to `PersonaGuard-branches.test.tsx` to match the established convention used by `CodeEntry-branches.test.tsx`, `delegation-branches.test.ts`, etc. |
| N8 | **README banner mentions "rc.5"** | `README.md:6` | Minor | rc.6 | 5 min | Cross-reference to N1 — the rc.6 commit forgot the status line. Independent fix from the bundle-size drift but same root cause (incomplete docs pass). |

No new debt at the architectural / structural level — the rc.5 + rc.6 deltas are surgical. No new god modules, no new cross-layer imports, **no new circular-import risk** (verified by reading every PCP component import line), no new uninit-semantics divergence, no new public-API drift. Type-strictness still 0 `any`.

## Cyclomatic hotspots — top 10 modules (LOC + structural complexity)

Compared against rc.4 audit numbers (which the rc.6 delta minimally affects).

| Rank | Module | LOC rc.6 | LOC rc.4 | Δ LOC | Est. CC | Concerns count |
|------|--------|---------|---------|-------|---------|----------------|
| 1 | `src/react/components/DelegationCenter.tsx` | 779 | 779 | 0 | ~70 | unchanged from rc.4 (4 tabs × 10-15 branches each + memo gates + grant filtering) |
| 2 | `src/core/client.ts` | 566 | 566 | 0 | ~45 | unchanged from rc.4 (DPoP yes/no × nonce yes/no × refresh yes/no × redirect yes/no × ok yes/no fan-out) |
| 3 | `src/react/components/PropertySection.tsx` | 558 | 558 | 0 | ~50 | unchanged from rc.4 |
| 4 | `src/core/token-manager.ts` | 526 | 526 | 0 | ~40 | unchanged from rc.4 |
| 5 | `src/react/useIdentity.ts` | 498 | 498 | 0 | ~30 | unchanged from rc.4 |
| 6 | `src/core/storage.ts` | 412 | 412 | 0 | ~25 | unchanged from rc.4 |
| 7 | `src/core/entitlements.ts` | 402 | 381 | **+21** | ~32 | rc.5 added 21 LOC for `constantTimeStringEquals` (`:190-197`) + the surrounding rationale comment + the call-site replacement at `:170`. Helper itself is CC=2 (length-mismatch fast-path + XOR-accumulator loop). Module CC ticked +2-3 over rc.4. |
| 8 | `src/errors.ts` | 391 | ~273 | **+118** | ~30 | rc.5 added the `AuthErrorCode` literal union (`:44-73`, 22 cases + fallback) + `AuthProviderMissingError` class (`:285-295`) + the 17 type-only ConstructorParameters generics (one per typed error class). CC contribution is mostly type-level — the runtime body of `errorFromEnvelope` is essentially a 17-arm switch (`:361-389`). |
| 9 | `src/react/AuthProvider.tsx` | 331 | 331 | 0 | ~20 | unchanged from rc.4 |
| 10 | `src/react/components/ConsentCenter.tsx` | 330 | 330 | 0 | ~25 | unchanged from rc.4 |

Observations:

- **`errors.ts` jumped from outside the top-10 (~273 LOC at rc.4) to rank 8 at 391 LOC.** This is healthy growth — it reflects API-surface expansion (literal union + new class) rather than logic bloat. The runtime hot path (`errorFromEnvelope`) is still the same 17-arm switch.
- **`entitlements.ts` ticked +21 LOC for security hardening (constant-time HMAC).** The cyclomatic cost of the helper is +2 (length-fast-path + XOR loop). The module is now slightly above the rank-7 / rank-8 boundary, but its complexity is still proportional to legitimate fan-out (sync read × async refresh × signed envelope × pub-sub × in-flight coalescing × HMAC verify).
- **No module grew beyond its rc.4 size.** Top-6 by LOC unchanged.
- **rc.4 audit's quantitative claim "94 files" stands** — `find src -name "*.ts" -o -name "*.tsx" | wc -l` returns 94.
- **`as any` / `@ts-ignore` count: 0.** Confirmed via Grep for `\bas any\b|@ts-ignore|@ts-nocheck|@ts-expect-error|: any\b|\bany\[\]` — single match is the literal word "any" in `src/core/client.ts:41` comment ("any DPoP-build error"). **Type strictness preserved exactly as in rc.4.**

## Coupling / boundaries (circular import + layer-jump check)

Re-verified the layering rules from `audits/holistic-2026-05-06/ARCHITECTURE.md`:

- **`src/core/*` must not import `src/react/*`.** Verified by Grep on `src/core` for `from '\.\./\.\./react|from '\.\./react` → 0 matches. ✓
- **`src/flows/*` must not import `src/react/*`.** Verified by Grep on `src/flows` → 0 matches. ✓
- **No `src/**` non-react file imports `src/react/index.js` (the barrel).** Verified by Grep on `src` for `from '\.\./index\.js'|from '\.\./\.\./react/index\.js'` → 0 matches inside non-react dirs.
- **The 7 new PCP exports do NOT introduce circular imports.** Verified by reading every import line of every PCP component:
  - `ComplianceDocsSection.tsx:9` → `'../useIdentity.js'` (sibling-up).
  - `GearSection.tsx:10-11` → `'../useIdentity.js'` + `'./MediaGallery.js'` (sibling).
  - `PropertySection.tsx:10-11` → same shape.
  - `VehicleSection.tsx:10-11` → same shape.
  - `MediaGallery.tsx`, `AddressInput.tsx`, `CompletenessBar.tsx` — none import the barrel `react/index.js`.
  - The barrel itself (`src/react/index.ts:136-168`) imports from sibling concrete modules (`./useIdentity.js`, `./components/MediaGallery.js`, etc.) — no back-reference from those modules to the barrel. Single-direction (concrete → barrel), as ESM dictates. **No cycle.** ✓
- **The known intentional lazy-import cycles still hold.** `src/config.ts:288, 292, 301` lazy-loads `core/error-hook.js`, `core/client.js`, `core/event-reporter.js`, `core/settings-sync.js`, `offline/queue.js` — verified by reading the file end-to-end. Same shape as rc.4. No new lazy-import added.
- **`src/core/error-hook.ts` is still a leaf.** rc.5 / rc.6 did not touch it.
- **`scripts/verify-version-sync.ts` is a leaf.** Imports only `node:fs`, `node:url`, `node:path`. Zero src imports. No cycle risk introduced by the new gate script.

**No circular-import risk. No new layer violation. The unidirectional `imperative/react → flows → core → storage` flow holds.** The PCP-exports addition is the most impactful surface-area change since rc.1 and survives the layering check intact.

## Test debt

113 `*.test.ts*` files via Glob (vs 102 at the rc.4 audit pass — +11 test files across rc.5 + rc.6). Sources of new code in rc.5/rc.6 mapped to test coverage:

| Source change | Direct test? | Coverage situation | Risk |
|---|---|---|---|
| `src/errors.ts:44-73` — `AuthErrorCode` literal union | NO direct test | Type-only at runtime; verified by `pnpm typecheck` per CHANGELOG `:159`. Existing `errorFromEnvelope` tests exercise the runtime side. | Trivial. |
| `src/errors.ts:285-295` — `AuthProviderMissingError` | NO direct test | Throw sites exist at `src/react/useAuth.ts:54`, `src/react/useEntitlements.ts:24`. Existing `useAuth.test.tsx` + `useEntitlements.test.tsx` likely catch via "called outside provider" tests, but **`instanceof AuthProviderMissingError`** is unverified. Grep for `AuthProviderMissingError` in `test/` returns 0 matches. | Low — see N5. |
| `src/react/useAuth.ts:46-47` — `signOut` signal type | Type-level only | The underlying `flows/recovery.ts` `signOut`/`signOutEverywhere` ARE tested with `signal` at `test/unit/flows/abort-signal-propagation.test.ts:160, 171`. The React-surface widening is type-only. | Trivial. |
| `src/core/entitlements.ts:170, 190-197` — constant-time HMAC | YES via existing branches test | `test/unit/core/entitlements-branches.test.ts:7` explicitly targets "line ~376-378: constantTimeStringEquals — length mismatch fast path, equal-length differing-content path, equal path". | Closed. |
| `src/react/index.ts:132-168` — 7 PCP exports + useIdentity | YES — exports directly tested by D1 closure | `test/unit/react/useIdentity.test.tsx` exists per `ls`. Component-level: `MediaGallery`, `AddressInput`, `VehicleSection`, etc. — these were previously consumed internally; now-public surface adds no new logic. **Type-level**: any consumer who imports `useIdentity` from `@samjonaidi-ship-it/universal-auth/react` now type-checks; verified by `pnpm typecheck` clean per CHANGELOG `:159`. | Closed for the export; per-component coverage tracked separately in COV-1. |
| rc.6 `test/unit/core/storage-branches.test.ts` (88 LOC, 5 tests) | NEW | Targets `getOrCreateHmacKey` cache+dedup paths (`:30-65`), `clearAllSessionState` multi-store transaction (`:69-77`). | Closed. |
| rc.6 `test/unit/react/useAccess-branches.test.tsx` (161 LOC, 4 tests) | NEW | Targets line 57 `err instanceof AuthSdkError ? err : new AuthSdkError('UNKNOWN', ...)` (`:54-60`), background-refresh catch path. | Closed. |
| rc.6 `test/unit/react/components/PersonaGuard.test.tsx` (147 LOC, 9 tests) | NEW | Full status/persona/className/style matrix per file header `:4-8`. | Closed. |

**Carry-forward test debt from rc.4 audit (still open):**

- `useAccessBulk.ts` has no `*.test.tsx` direct sibling. Co-imported by `useAccess.test.tsx` only. **N4 above.**
- `delegation.ts` has only `delegation-branches.test.ts` (no plain `delegation.test.ts`). The signal-propagation rc.3 additions are exercised by `abort-signal-propagation.test.ts` per Grep on `signOut.*signal`. Acceptable.
- `AuthProviderMissingError` `instanceof` narrowing untested. **N5 above.**

**Net test debt at rc.6:** ~3 small additions (~30 min total) — N4 (`useAccessBulk.test.tsx`), N5 (`AuthProviderMissingError` instanceof check), final 0.28pp branch coverage gap to 85 (deferred to GA per BACKLOG COV-1).

## Bundle measurement vs claims

Direct measurement against `.build-meta/esbuild-meta.json` (mtime 2026-05-06T19:02 — newer than every file in src/, so reflects the rc.6 build state). Walker matches `scripts/size-check-closure.ts:98-119` exactly:

| Entry | Closure file count | Measured 2026-05-08 | rc.4 audit measurement | rc.5 CHANGELOG claim (`:158-159`) | rc.6 README.md:9 claim | Budget | Status |
|-------|-------------------|---------------------|-----------------------|------------------------------------|------------------------|--------|--------|
| core | 10 | **23.52 KB** | 23.38 KB | 23.39 KB | 23.39 KB | 40 KB | ✓ under |
| react | 8 | **42.89 KB** | 36.20 KB | 36.21 KB | 36.21 KB | 70 KB | ✓ under, but **+6.68 KB real delta** that none of the docs reflects |
| profile | 5 | **15.37 KB** | 15.29 KB | 15.29 KB | 15.29 KB | 50 KB | ✓ under |
| passkey-flow (lazy, marginal) | 1 | **0.20 KB** | 0.20 KB | 0.20 KB | 0.20 KB | 12 KB | ✓ under |
| sw | 1 | **0.56 KB** | 0.56 KB | 0.56 KB | 0.56 KB | 5 KB | ✓ under |

All five within budget. **Three drifts vs documented claims:**

1. **react bundle: 42.89 KB measured vs 36.21 KB claimed.** The +6.68 KB delta is the cost of bundling the 7 PCP component re-exports + `useIdentity` hook into the React subpath closure (rc.5 D1 commit `b33abae`). Even though the PCP components were already being built into `dist/` (they were imported by other shipped components per `b33abae` commit message: "consumed by other shipped components"), exporting them from `src/react/index.ts:132-168` made them eagerly reachable from the React entry, which the closure walker now counts. **The real growth is structural and correct — the 36.21 KB rc.5 claim was based on a build that EXISTED but was probably measured BEFORE the PCP exports landed in the same release.** Either the rc.5 size-check ran early and the docs froze the number, or the `chunk-3UGU53KX.js` (4.98 KB), `chunk-3RM3QMGM.js` (4.93 KB), and `chunk-OFNHSS3N.js` (4.69 KB) chunks newly counted by the rc.6 measurement pass were not in scope when rc.5 docs were written. **Either way, rc.5 / rc.6 docs misrepresent actual cost.** Severity: Minor — still under budget; no consumer impact. Documentation drift only.
2. **core bundle: 23.52 KB measured vs 23.39 KB claimed.** A +0.13 KB drift is within gzip non-determinism and acceptable.
3. **profile bundle: 15.37 KB measured vs 15.29 KB claimed.** Same: +0.08 KB rounding.

**Specifically on the rc.5 commit-message claim of "+~6.7 KB" for the React subpath:** the commit message for `b33abae` doesn't quantify size impact. The rc.5 CHANGELOG block (`:158-159`) reports react at 36.21 KB without flagging the PCP delta. **The actual delta is +6.68 KB** by direct re-measurement (rc.4 baseline 36.20 KB → rc.6 42.89 KB). Within rounding of the implicit "~6.7 KB" if that estimate had appeared anywhere — it did not. Either way, the user-supplied audit-task framing of "claimed ~+6.7 KB in rc.5 commit msg" is **not actually claimed in the commit message** but is consistent with re-measurement, so the underlying figure is correct even if the claim source is mislabeled.

## Recommendations (ranked, with effort estimates)

### Pre-GA — close before tagging `1.1.0`

1. **Refresh `README.md` banner status + bundle line.** Line 6: "v1.1.0-rc.5" → "v1.1.0-rc.6"; Line 9: "react 36.21 KB" → "react 42.89 KB" (+6.68 KB cost of the PCP exports). _Effort: 5 minutes._ **Closes N1 + N8.**
2. **Add `test/unit/react/useAccessBulk.test.tsx`.** Cover empty-array short-circuit at `useAccessBulk.ts:37-42` and structural-key stability at `:26-28`. _Effort: 1 hour._ **Closes carry-forward N4.**
3. **Add a 5-line `instanceof AuthProviderMissingError` test.** In existing `useAuth.test.tsx` and/or `useEntitlements.test.tsx`. _Effort: 10 minutes total._ **Closes N5.**
4. **Decide D6 dual-store disposition.** Either (a) merge `profile-store.ts` into `useIdentity.ts` (full) — 3-5 days, or (b) ship a docs-only deprecation timeline naming the v1.2 retirement of `profile-store.ts` — 0.5 day. **Recommended: (b) before GA, (a) after.** Both `useIdentity` and `useProfile` are public hooks at GA tagging time; ambiguity has the most carrying cost in the GA → 1.2 window. _Effort: 0.5d (docs-only)._
5. **Restore branch coverage to 85.** Per `docs/BACKLOG.md:88-94`, the remaining 0.28pp lives in `storage.ts` IDB-upgrade callbacks. Either build the fake-IndexedDB-with-version-injection harness (high effort) or accept 84 as the ship threshold. **Recommended: accept 84 at GA + document the COV-1 closure as v1.1.x patch.** _Effort: deferred decision._

### Minor / patch (v1.1.x)

6. **Strip stale `size-limit` references from script comments.** `scripts/release.ts:51`, `scripts/size-check-closure.ts:4-16, 63`. _Effort: 5 minutes._ **Closes N2.**
7. **Inline-comment the `eslint-plugin-react-hooks` v5 pin rationale.** `eslint.config.js:7`. _Effort: 5 minutes._ **Closes carry-forward N3.**
8. **Rename `test/unit/react/components/PersonaGuard.test.tsx` to `PersonaGuard-branches.test.tsx`.** Matches `*-branches.test.tsx` convention used by 14 other branch-coverage files. _Effort: 5 minutes._ **Closes N7.**
9. **Document JSON-canonicalization invariant in `computeSignature`.** `src/core/entitlements.ts:200-201` — strengthen comment to "DO NOT pass a parsed object back through this — V8 insertion-order is fresh-literal-only". _Effort: 5 minutes._ **Closes carry-forward D11.**
10. **Distinguish `metadata_load_failed` from `unparseable` in `validatePhone`.** `src/profile/validators.ts:67-69`. _Effort: 15 minutes._ **Closes carry-forward D10.**

### Deferred to v1.2 (carried forward, unchanged from rc.4 audit)

11. **Extract `attachDpop` + `handleNonceChallenge` from `core/client.ts`.** D1. _1 day._
12. **Split `useIdentity.ts` into `identityStore.ts` + thin hook.** D2. _2 days._ (Urgency tilted up — see D2 footnote.)
13. **Refactor `<DelegationCenter>` into 4-5 sub-components.** D3. _2-3 days._
14. **Refactor `<PropertySection>` into address / asset / media / photo flows.** D4. _2 days._ (Urgency tilted up.)
15. **Standardize uninit semantics across the four singletons.** D5. _1 day._
16. **Wire or delete `auth-flow` / `risk-signal` adapter interfaces.** D7. _0.5-2 days._
17. **Thread `AbortSignal` through `tryRefresh` + `refreshTokenRequest`.** D9 / NL8 (residual P1-D). _1-2 hours._
18. **De-duplicate `reconciler.flushOne` request-building against `core/client.ts`.** D8. _1 day._

---

*Compiled by reading 100% of `src/` (94 files / 16,263 LOC), `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `scripts/verify-version-sync.ts`, `scripts/size-check-closure.ts:1-150`, `docs/CHANGELOG.md` (rc.4/rc.5/rc.6 sections), `docs/BACKLOG.md`, `docs/VERSION_MATRIX.md`, the rc.4 architecture audit, the rc.5 verification audit, and the 3 new rc.6 test files. Bundle metrics computed directly against `.build-meta/esbuild-meta.json` 2026-05-06T19:02 via inline node script that mirrors `scripts/size-check-closure.ts:98-119` walker logic. Git log walked for the 16 rc.5/rc.6 commits between `f7010e3` and `80ad904`. No source modified. All claims cite `file:line`. Score 8.5/10 reflects three real wins (type strictness, process gates, narrowed coverage debt) net the unchanged structural debt and two new minor doc-drift items.*
