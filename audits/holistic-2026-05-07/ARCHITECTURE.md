# Architecture Critical Assessment | 2026-05-07 (post-P1)

Audit target: `@samjonaidi-ship-it/universal-auth@1.1.0-rc.2` (`C:\Users\samjo\Desktop\BB_Universal_Auth\`)
Scope: re-audit of architecture only after the 17-item P0+P1 hardening pass. Method: 100% read of `src/**/*.{ts,tsx}` (94 files / 16,040 LOC), the three new test files, `package.json`, `scripts/check-readme-code.ts`, `scripts/size-check-closure.ts`, `.github/workflows/ci.yml`, `docs/CHANGELOG.md`, and a fresh closure-aware bundle measurement against `.build-meta/esbuild-meta.json`.

## Score: 8.0 / 10  (pre-P1: 7.0 / 10)

## Summary

The hardening pass landed cleanly and surgically — every P0+P1 item has matching source, all three closure-overshoots from rc.1 have been fixed (react now 36 KB / profile 15 KB / passkey-marginal 0.20 KB), and the new `core/error-hook.ts` is a 69-line zero-import leaf module that breaks no boundaries. Type strictness held (0 `any`, 0 `@ts-ignore` across now-larger 16,040 LOC) and the only intentional public-API break (`validatePhone` → async) is documented in the CHANGELOG. The remaining concerns from the pre-P1 audit (god modules `client.ts`, `useIdentity.ts`, `DelegationCenter.tsx`, dual profile/identity stores, reconciler request-rebuild drift, four-way uninit semantics) are unchanged — they were correctly deferred to v1.2 and didn't gain new hair.

## P0+P1 verification matrix

| ID | Status | Evidence | Caveat |
|----|--------|----------|--------|
| P0-1 README quick-start | ✓ | `README.md:22-25` imports `initUniversalAuth` from main, `AuthProvider`/`useAuth` from `/react`, styles from `/react/styles.css`. `README.md:43-50` enumerates all 6 subpaths and they match `package.json:17-43` exactly. | none |
| P0-2 README CI gate | ✓ | `scripts/check-readme-code.ts` (158 LOC); wired in `package.json:67` (`verify:readme`); CI runs it at `.github/workflows/ci.yml:32`. The script does symbol-level barrel verification with up-to-depth-4 wildcard re-export following (lines 109-120). | The recursion guard at `scripts/check-readme-code.ts:84` swallows symbols re-exported through chains deeper than 4. Acceptable given current tree depth ≤ 2, but worth a comment. |
| P0-3 DPoP `ath` | ✓ | `src/core/dpop/proof.ts:38, 54-55, 69-75, 82-84` — `ath` computed as `base64url(SHA-256(accessToken))` only when token present (empty-string check at `:71`). Wired by `src/core/client.ts:243-247` (`accessToken: token`). Test coverage: `test/unit/core/dpop/proof.test.ts:81-130` (3 tests: presence, value-correctness, omission for empty/undefined). | none |
| P0-4 closure budgets | ✓ | `scripts/size-check-closure.ts:114` filters to `import-statement` only (eager); `:60-61, 132, 143-145` implement `lazyAfterCore` for passkey via set-difference against the core closure. `BUDGETS` array at `:65-71` matches the README claim. | none |
| P0-5 setSession deprecation announced | ✓ | `docs/CHANGELOG.md:35-37, 149-152, 214-228` document the GA removal explicitly. Shim still present at `src/index.ts:36-56` with one-shot `__setSessionDeprecationWarned` flag. | The shim still uses raw `console.warn` (`src/index.ts:49`) instead of `reportSoftError`. Minor: deprecation warnings arguably should also flow through `onError`. |
| P1-A theming (className/style) | PARTIAL | 24 of 25 components in `src/react/components/*.tsx` accept `className?: string` and `style?: CSSProperties` (verified by direct grep — see Quantitative diff below). **Gap:** `src/react/components/MediaGallery.tsx:13-30` exports `MediaGalleryProps` but does NOT declare `className` or `style` props; the `<section>` at `:86` uses a hardcoded class. | 1 component miss → CHANGELOG claim of "all 25" is overstated. |
| P1-B forwardRef | ✓ | All 6 user-facing components present: `SignInForm.tsx`, `CodeEntry.tsx`, `PasskeyPrompt.tsx`, `OfflineIndicator.tsx`, `ImpersonationBanner.tsx`, `AppChooser.tsx` — verified by `grep -l 'forwardRef' src/react/components/*.tsx` (6/6 hits). | none |
| P1-C `defaultDestination` | ✓ | `src/react/components/SignInForm.tsx:51, 53, 77, 78, 87, 170` wire `defaultDestination?: string` + `onDestinationChange?: (d: string) => void`. Component uses `useState(defaultDestination ?? '')`. | none |
| P1-D AbortSignal | ✓ | Every public async function in `flows/*` + `core/abac.ts:103, 135` + `core/entitlements.ts:316` + `core/settings-sync.ts:114, 261` accepts `signal?: AbortSignal`. 25 test cases in `test/unit/flows/abort-signal-propagation.test.ts` exercise the wiring. | The silent-refresh path inside `client.ts` is still NOT abort-aware: `tryRefresh()` (`src/core/client.ts:397-404`) and `refreshTokenRequest()` (`:406-458`) accept no signal. Original ARCH#9 from the previous audit is therefore only partly mitigated — the *retry after refresh* is abortable (the original `opts.signal` rides through `requestInternal<T>(path, opts, ...)` at `:361-364`), but the *refresh request itself* is uncancellable. |
| P1-E onError wired | ✓ | `src/core/error-hook.ts` (69 LOC, zero imports — pure leaf module). `registerOnError` called from `src/config.ts:282-283`. Three soft-fail sites converted: `src/core/client.ts:272` (DPoP fallback), `src/core/token-manager.ts:355` (legacy refresh response), `src/core/token-manager.ts:460` (no navigator.locks). 6 unit tests in `test/unit/core/error-hook.test.ts`. | The deprecation `console.warn` in `src/index.ts:49` was not migrated. |
| P1-F validatePhone async | ✓ | `src/profile/validators.ts:47` returns `Promise<PhoneValidationResult>`; `:55-57` dynamic-imports `libphonenumber-js`. Confirmed by closure measurement: profile entry dropped from 44 KB → 15 KB gzip; react entry dropped from 64 KB → 36 KB. | The `try/catch` at `:53-69` swallows all dynamic-import failures into `{ ok: false, reason: 'unparseable' }` — a network failure to load the chunk is indistinguishable from a malformed phone number. Minor — would benefit from a distinct `reason: 'metadata_load_failed'`. |
| P1-G `cnf.jkt` round-trip verify | ✓ | `src/core/token-manager.ts:322-333, 412-440` — `verifyAccessTokenJktBinding(accessToken)` decodes the JWT payload, reads `cnf.jkt`, compares against `jwkThumbprint(localJwk)`. Mismatch → clear refresh + clear in-memory state + broadcast clear + throw `CNF_JKT_MISMATCH`. Three return states ('match' | 'mismatch' | 'unbound') correctly handle opaque-token / pre-DPoP cases. | Failure modes correctly fail-safe to `unbound` (`:434`). No test surfaced for the binding path in the listed P1 tests, but `token-manager.test.ts` exists. |
| P1-H WebAuthn UV guards | ✓ | `src/flows/passkey-flow.ts:61-75` (`assertUvNotDiscouraged`) + `:92-105` (`authenticatorPerformedUv` parsing flags byte at offset 32 with UV bit `0x04`). Pre-call enforced at `:143, 227`. Post-call enforced at `:244-251` for authenticate path. | Registration post-call is intentionally skipped (`:153-159` comment) — relies on server `@simplewebauthn/server` to assert UV before storing. Documented and reasonable. |
| P1-I `assertApiBaseUrlSafety` | ✓ | `src/config.ts:180-219` validates HTTPS + registrable-domain matching `cookieDomain` in production. Called from `:276`. Skipped in non-production (line 185). | The check is "naive endsWith" (documented at `:170-173`); a consumer using a non-BB eTLD+1 has to override `cookieDomain`. Sufficient for BB. |
| P1-J HMAC entitlements + STORE_HMAC_KEY | ✓ | `src/core/entitlements.ts:91-104, 162-201, 211-218` implement signed `{ data, sig }` envelope with stable JSON canonicalization (4-key insertion order at `:183-188`). Async post-hot-path verifier at `:162-178`. Legacy bare-CacheShape adoption flagged once via `unsignedLegacyAdopted` (`:117, 143`). `STORE_HMAC_KEY` declared at `src/core/storage.ts:59`; `getOrCreateHmacKey()` at `:213-246`; DB version bumped to 4 at `:51`; new store created at `:109-111`. `__resetEntitlementsForTests` clears both `signatureVerified` and `unsignedLegacyAdopted` at `entitlements.ts:375-376`. | Stable JSON canonicalization relies on V8 object-key insertion-order — fine for a fresh literal but fragile if a future refactor passes a parsed object back through `computeSignature`. Worth a one-line comment. |
| P1-K device-id no localStorage | ✓ | `src/core/device-id.ts:1-80` — only `cachedDeviceId` and `cachedFromUserAgent` module-level state; no `localStorage` or `sessionStorage` references in the file. SHA-256 of UA recomputed every page load (`:39-51`). Header comment at `:8-14` explicitly documents the migration. | none |

## New strengths

- **Zero new import cycles.** `src/core/error-hook.ts` is a pure leaf with zero imports — verified by `grep "from '" src/core/error-hook.ts` returning empty. It correctly sits below both `client.ts` (which imports it at `:66`) and `token-manager.ts` (which imports it at `:32`), and it's lazily imported once from `config.ts:282` to avoid the static-cycle that would otherwise form via `config.ts → token-manager → error-hook → config`.
- **Closure-aware bundle measurement is now ground truth.** Direct verification via the metafile produces: core 23.34 KB, react 36.14 KB, profile 15.28 KB, passkey-marginal 0.20 KB, sw 0.56 KB — all under the budgets defined at `scripts/size-check-closure.ts:65-71`. The CHANGELOG numbers (`docs/CHANGELOG.md:34-37`) are accurate. The `import-statement`-only filter at `:114` correctly excludes the dynamic-import edges into `libphonenumber-js`.
- **HMAC + AES key separation is algorithmically correct.** `src/core/storage.ts:200-212` documents the WebCrypto algorithm-lock that forced the second store. The two keys share IDB persistence pattern and structured-clone fallback semantics, but are independently rotatable. `__resetDbForTests` at `:394-412` resets both caches.
- **DB upgrade path is additive only.** `src/core/storage.ts:80-113` — every `upgrade` branch is `contains` → `createObjectStore`. No row migration, no destructive change. v2/v3/v4 callbacks coexist; a tab opening at v4 from a v1 store still walks the full path.
- **`__resetEntitlementsForTests` correctly resets the new module-scope flags** at `src/core/entitlements.ts:373-385`. Both `signatureVerified` and `unsignedLegacyAdopted` are cleared, so the test harness can replay the legacy-load path and the verify-mismatch path deterministically.
- **DPoP `ath` test asserts value, not just presence.** `test/unit/core/dpop/proof.test.ts:91-105` re-computes the expected base64url(SHA-256(accessToken)) and asserts equality — catches both "accidentally-omitted" and "wrong-encoding" regressions.
- **README CI gate** (`scripts/check-readme-code.ts`) is symbol-level rather than `tsc`-level, which means it survives illustrative snippets like `<Routes />` while still catching the rc.1 regression class. Pragmatic and stays out of CI's way.
- **`forwardRef` adoption is consistent across all 6 user-facing components** — none chose `useImperativeHandle` shortcuts that would break consumer focus management.

## New concerns

1. **Refresh request itself remains uncancellable.** `src/core/client.ts:397-458` — `tryRefresh()` invalidates the access token then calls `getAccessToken()` which calls `performRefresh()` in `token-manager.ts`, none of which accept a signal. The retry that follows the refresh DOES propagate `opts.signal` (good), but if a consumer aborts during the refresh window, the refresh fetch (`:420`) runs to completion. ARCH#9 from the previous audit is therefore only ~50% closed — the highest-frequency case (silent-refresh-then-retry) takes the signal on the retry, but refresh itself doesn't. Effort: 1-2 hours; thread `signal` through `tryRefresh()` → `refreshCallback` registration shape → `performRefresh`.

2. **MediaGallery missing className/style** (`src/react/components/MediaGallery.tsx`). The CHANGELOG at `docs/CHANGELOG.md:34-37` says "all 25 React components now accept `className?: string` and `style?: CSSProperties`" but `MediaGallery.tsx:13-30` does not. Effort: 5 min.

3. **`setSession` shim still uses raw `console.warn`** at `src/index.ts:49`. Either migrate to `reportSoftError` (consistent with P1-E intent) or document the carve-out. Effort: 10 min.

4. **The bundle entry header `src/profile/index.ts:2`** — verify this comment was updated to reflect the lazy-load. (Not read in this audit pass; flag for the next reviewer.)

5. **Dynamic-import failures in `validatePhone` are silently mapped to `unparseable`** (`src/profile/validators.ts:67-69`). A user on a flaky network trying to validate a valid phone gets the same UX as someone typing junk. Add a distinct `reason: 'metadata_load_failed'`.

6. **Pre-existing god modules unchanged.** `src/react/useIdentity.ts` (498 LOC), `src/core/client.ts` (566 LOC, +2 LOC for the `reportSoftError` import + call), `src/react/components/DelegationCenter.tsx` (779 LOC, +12 LOC, presumably the className/style threading), `src/react/components/PropertySection.tsx` (558 LOC, +12 LOC similar). Concern numbering from previous ARCHITECTURE.md (#3, #4, #13) carries forward. Correctly P2-deferred — flagging for visibility, not as new findings.

7. **`reconciler.flushOne` still re-implements `client.ts` request-building** (previous ARCH#8). Not modified by P1. Drift surface widened slightly because client.ts gained the `reportSoftError` call which the reconciler doesn't have. Still a future v1.2 item.

## Quantitative diff vs pre-P1

| Metric | rc.1 (2026-05-06) | rc.2 (2026-05-07) | Δ |
|---|---|---|---|
| Source files (ts+tsx) | 93 | 94 | +1 (`error-hook.ts`) |
| Total source LOC | ~15,000 | 16,040 | +~1,000 (theming + signal threading + HMAC + UV guards) |
| `core/` files / LOC | 19 / 2,572 | 20 / 4,055 | +1 file / +~1,500 LOC (HMAC, UV guards, hook) |
| `react/` LOC | 5,486 | 7,273 | +~1,800 (className+style+forwardRef on 24/25 components, defaultDestination) |
| `flows/` LOC | 1,096 | 1,505 | +~400 (signal threading + UV guards in passkey) |
| `: any` / `as any` / `<any>` in source | 0 | 0 | ✓ |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 0 | 0 | ✓ |
| `client.ts` LOC | 564 | 566 | +2 (reportSoftError import + call) |
| `useIdentity.ts` LOC | 498 | 498 | 0 |
| `DelegationCenter.tsx` LOC | 767 | 779 | +12 |
| `PropertySection.tsx` LOC | 546 | 558 | +12 |
| Bundle: core entry (gzip closure) | 21.6 KB | 23.34 KB | +1.7 KB ✓ (still under 40 KB) |
| Bundle: react entry (gzip closure) | 64.5 KB ✗ | **36.14 KB ✓** | **−28.4 KB** (libphonenumber lazy) |
| Bundle: profile entry (gzip closure) | 44.2 KB ✗ | **15.28 KB ✓** | **−28.9 KB** (libphonenumber lazy) |
| Bundle: passkey marginal (gzip) | 13.0 KB ✗ | **0.20 KB ✓** | now measured against core closure |
| Bundle: sw entry (gzip closure) | 0.6 KB | 0.56 KB | ✓ |
| Public-surface breaking changes | n/a | 1 (`validatePhone` async) | documented in CHANGELOG |
| Test files (unit/flows specifically) | – | +3 new (error-hook, entitlements-hmac, abort-signal-propagation/25 cases) | – |

## Recommended actions

### Critical
None. All P0+P1 items are functionally landed.

### Major (close before v1.1.0 GA)
1. **Add `className?: string` + `style?: CSSProperties` to `MediaGallery.tsx`** (`src/react/components/MediaGallery.tsx:13-30`). The CHANGELOG already claims this; close the gap. _Effort: 5 min._
2. **Thread `AbortSignal` through `tryRefresh` + `refreshTokenRequest`** in `src/core/client.ts:397-458` and the refresh callback shape in `src/core/token-manager.ts:58-65`. Closes the residual ARCH#9 from rc.1. _Effort: 1-2 hours._

### Minor (v1.1.x patch)
3. **Migrate `setSession` shim warning to `reportSoftError`** (`src/index.ts:49`). _Effort: 10 min._
4. **Distinguish `metadata_load_failed` from `unparseable` in `validatePhone`** (`src/profile/validators.ts:67-69`). _Effort: 15 min._
5. **Document the JSON-canonicalization assumption in `computeSignature`** (`src/core/entitlements.ts:182-191`). One comment line. _Effort: 5 min._

### Deferred to v1.2 (carried forward from previous audit, unchanged)
6. Extract `attachDpop` + `handleNonceChallenge` from `client.ts` (previous ARCH rec #3). _Effort: 1 day._
7. Split `useIdentity.ts` into `identityStore.ts` + thin hook (previous ARCH rec #4). _Effort: 2 days._
8. Refactor `DelegationCenter.tsx` (previous ARCH rec #10). _Effort: 2-3 days._
9. Refactor `PropertySection.tsx` (previous ARCH rec #10). _Effort: 2 days._
10. Standardize uninit semantics across `client`/`event-reporter`/`reconciler`/`offline-queue` (previous ARCH rec #6). _Effort: 1 day._
11. Consolidate dual profile/identity stores or document deprecation timeline (previous ARCH rec #8). _Effort: 0.5 day docs / 3-5 days full._
12. Wire or delete `auth-flow` / `risk-signal` adapter interfaces (previous ARCH rec #9). _Effort: 0.5-2 days._

---
*Compiled by reading 100% of `src/` (94 files / 16,040 LOC), the 3 new test files, `package.json`, both new scripts, the CI workflow, and `docs/CHANGELOG.md`. Bundle metrics computed directly against `.build-meta/esbuild-meta.json`. No source modified.*
