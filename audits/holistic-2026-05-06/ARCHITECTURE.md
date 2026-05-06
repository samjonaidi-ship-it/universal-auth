# Architecture Critical Assessment | 2026-05-06

Audit target: `@samjonaidi-ship-it/universal-auth@1.1.0-rc.1` (`C:\Users\samjo\Desktop\BB_Universal_Auth\`)
Scope: architecture only. Security and DX covered in `SECURITY.md` / `API_DX.md`.
Method: read 100% of `src/**/*.{ts,tsx}` (93 files / ~10.2 KLOC TS + ~4.8 KLOC TSX), `package.json`, `tsconfig.json`, `scripts/build.ts`, `scripts/verify-bundle.ts`. Bundle metrics computed from `dist/esm/` against `.build-meta/esbuild-meta.json`.

## Score: 7 / 10

## Summary

The SDK has clear, mostly defensible module boundaries — `core/` never imports from `react/` (verified by grep), `flows/` and `offline/` are unidirectional consumers of `core/`, and the build splits into seven entry points with `sideEffects: false` honored. State is held in module-level singletons that are coherent across tabs via `BroadcastChannel` + `navigator.locks` and validated at the boundary. The principal weaknesses are bundle hygiene — the React subpath transitively pulls in the full 135 KB libphonenumber profile chunk that the SDK explicitly claims to isolate — and three load-bearing god modules (`useIdentity.ts` 498 lines, `client.ts` 564 lines, `DelegationCenter.tsx` 767 lines) that mix orthogonal concerns.

## Strengths

- **`sideEffects: false` is real, not just declared.** `src/index.ts` is a pure named-export barrel (verified by `scripts/verify-bundle.ts:67-95` which strips function bodies and rejects any top-level call); `package.json:7` sets the flag globally. The only init code in the barrel is a single deprecation-shim function `setSession` (`src/index.ts:46-56`), guarded by a one-shot `__setSessionDeprecationWarned` flag. Tree-shaking will work for any consumer that pulls a subset.
- **Subpath exports are clean and rationally scoped.** `package.json:17-43` ships six subpaths: `.`, `./react`, `./sw`, `./profile`, `./extendability`, `./internal`. `internal` carries one symbol (`setSession`, `src/internal/index.ts:13`), explicitly marked unstable. `extendability` is interface-only plus a 29-line registry (`src/extendability/registry.ts`).
- **Strict TypeScript across the board.** `tsconfig.json:9-22` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `useUnknownInCatchVariables`. Grep across `src/` finds **zero** uses of typed `any` (`: any`, `<any>`, `as any`) and **zero** `@ts-ignore` / `@ts-expect-error`. The 33 `\bany\b` matches are all in comments.
- **No top-level `await` in published code.** Grep confirms; `initUniversalAuth()` (`src/config.ts:170`) is the only place dynamic imports run, all gated behind a function call. SSR-safe.
- **No hand-rolled crypto outside `crypto.subtle`.** AES master key generated non-extractable (`src/core/storage.ts:156-160`); DPoP keypair P-256 non-extractable (`src/core/dpop/keypair.ts:41`); SHA-256 idempotency-key derivation via `crypto.subtle.digest` (`src/core/client.ts:467`). DPoP JWS is hand-assembled but signing routes through `crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'})` (`src/core/dpop/proof.ts:75-79`). No `jose` dependency (verified by `package.json:70-75`; `scripts/verify-no-jose.ts` exists for CI).
- **Refresh-token concurrency is correct.** `src/core/token-manager.ts:265-284` coalesces in-tab via an `inFlightRefresh` Promise; `src/core/token-manager.ts:296-372` wraps the network call in `navigator.locks.request('bb-auth-refresh', exclusive)` and double-checks freshness inside the lock so the loser of the race adopts the winner's token. `BroadcastChannel` messages are shape-validated (`src/core/token-manager.ts:128-139`) before adoption — closes the same-origin XSS injection vector explicitly.
- **3-context React provider.** `src/react/AuthProvider.tsx:312-320` splits Identity, Entitlements, and Status into separate contexts so an entitlements update doesn't re-render `useAuth()` consumers (`src/react/useAuth.ts:41-49` reads only Identity + Status).
- **Decoupled HTTP↔token layers via callback-injection.** `src/core/token-manager.ts:200-205` accepts a refresh callback; `src/core/client.ts:124-127` registers it inside `configureClient()`. Token-manager has zero `fetch` calls. Avoids the canonical SDK circular dep.
- **Stale-while-revalidate entitlements with bounded grace.** `src/core/entitlements.ts:131-147` reads from in-memory snapshot; `src/core/entitlements.ts:233-235` enforces a 7-day offline cutoff (`OFFLINE_GRACE_MS`) beyond which `hasFeature` returns false — explicit fail-closed semantics. Refresh path coalesces on `inFlightRefresh` (line 188).
- **SW lifecycle is minimal and standards-correct.** `src/sw/index.ts:37-43` calls `skipWaiting()` on install, `clients.claim()` on activate; message handler validates `event.source` is a same-scope client (`src/sw/index.ts:82`, `src/sw/purge-helpers.ts`). Background-sync delegates flush to the page (`src/sw/index.ts:55-65`) since SDK state lives there — pragmatic and correct.

## Concerns

### Critical

1. **React subpath bundles the full libphonenumber profile chunk.** `package.json:131` budgets `react/index.js` at 60 KB but does not include transitive chunk dependencies. The metafile shows `dist/esm/react/index.js` pulls `chunk-P3ITSMSB.js` (135 KB raw / 34 KB gzip), of which 83 KB is `libphonenumber-js/metadata.min.json.js`. Trace: `src/react/components/ContactInfoForm.tsx:9` imports `validatePhone` from `../../profile/validators.js` → `src/profile/validators.ts:11` imports `libphonenumber-js`. The header comment at `src/profile/index.ts:2` ("keeps libphonenumber-js out of the core 40 KB budget") is honored for the core entry but **silently violated** for the React entry, which is the entry point most consumer apps use. **Recommendation:** lazy-import `libphonenumber-js` inside `validatePhone()` so it only loads on form submit, OR move phone-validating components into a separate `react/forms` subpath. Total tree-shaken React entry today is ~64 KB gzip — over the 60 KB budget if measured fully.

2. **Bundle budgets in `package.json` measure entry stub only, not transitive closure.** `dist/esm/index.js` is 5.9 KB raw / 2.6 KB gzip but its full dependency tree gzips to ~21.6 KB. The 40 KB core budget happens to pass either way today, but the budget reads false on its face — a future addition to a shared chunk would not trip the limit. `package.json:114-116` points size-limit at `dist/esm/index.js` literal. Recommendation: switch to `path: ['dist/esm/index.js', 'dist/esm/chunk-*.js']` aggregating only chunks reachable from the entry, OR replace with a custom budget check that reads the metafile.

3. **`useIdentity` (`src/react/useIdentity.ts`, 498 lines) is a god hook.** Mixes module-level mutable store (lines 66-74), in-flight refresh dedup (lines 118-134), and 12 mutation methods covering addresses, resources, media, and property assets. Mutations write to the module-level `snapshot` variable directly via reassignment (lines 254-260, 271-277, etc.) inside `useCallback` hooks — works because `useSyncExternalStore` reads through the getter, but the pattern conflates store ownership and component logic. Compare to Auth0 SPA SDK's `Auth0Client` which keeps mutations behind imperative methods on a class and exposes pure read hooks. Recommendation: extract `identityStore.ts` with `addAddress`, `updateAddress`, etc., and have `useIdentity()` be a 50-line hook that wires `useSyncExternalStore` to the store and returns its bound methods.

### Major

4. **`core/client.ts` is 564 lines mixing six concerns.** Configuration (`configureClient`, lines 122-128), DPoP attach logic (lines 91-272), redirect/referrer hardening, refresh retry, idempotency-key derivation (lines 465-472), opaque-redirect handling, USE_DPOP_NONCE retry. The DPoP block is 80+ lines inline in `requestInternal`. Extracting `attachDpop(headers, cfg, path, method)` and `handleDpopNonceChallenge(...)` would drop client.ts to ~350 LOC and let DPoP be unit-tested without spinning up the full request path.

5. **Two parallel session-state stores: `profile-store.ts` AND the `useIdentity` snapshot.** `src/profile/profile-store.ts` has its own snapshot, listeners, generation counter, and dirty-patch (lines 45-54). `src/react/useIdentity.ts:66-74` has a different snapshot for the v1.5.0 PCP shape. Comments at `useIdentity.ts:14-17` acknowledge this is intentional ("useProfile remains bound to the legacy UniversalProfile contract"), but two stores observing similar data on the same identity is the sort of duplication that diverges over time. Single-source-of-truth would be one envelope-typed store with a typed selector (`getProfile()` vs `getIdentityEnvelope()`).

6. **Module-level singletons are inconsistent about init guards.** `src/core/client.ts:130-137` throws a clear error if called before `configureClient` (`requireConfig`). `src/core/event-reporter.ts:105-108` silently returns on pre-init `emit()`. `src/offline/reconciler.ts:69-70` returns `'defer'` on null config. Three different "uninitialized" semantics across four modules. Recommendation: pick one — throwing for explicit calls (request, enqueue) and silent-drop for fire-and-forget (emit) — and document in `docs/INTEGRATION_GUIDE.md`. The current mix means a mistake at integration shows up as silent telemetry loss in some paths and a thrown exception in others.

7. **`dist/esm/index.js` re-exports `setSession` despite the `/internal` migration.** `src/index.ts:46-56` is a 11-line deprecation shim that imports `_setSessionInternal` from `core/token-manager.js` directly, defeating the `/internal` boundary it claims to enforce. Tree-shakers can drop the unused export, but every consumer of the main barrel pays the static dep on `token-manager` — which they would have anyway. The shim is fine; the comment claiming removal "in v1.1" (line 7) is overdue: the package.json version is now `1.1.0-rc.1` (line 3) and the shim still exists.

8. **`reconciler.flushOne` re-implements `client.ts` request-building.** `src/offline/reconciler.ts:75-104` rebuilds Authorization, X-App-Id, X-SDK-Version, redirect-manual, referrerPolicy headers in parallel with `client.ts:189-285`. Comment on line 73 acknowledges this ("can't use client.ts's request() because that would re-enqueue on network failure"). A `requestRaw()` primitive in `client.ts` (no enqueue, no refresh retry) shared by both paths would eliminate the drift risk. Today, when client.ts gains a header (e.g., DPoP, X-Device-Id at line 227), reconciler must be edited too — and reconciler does NOT attach `X-Device-Id` or DPoP, which is a real inconsistency.

9. **Aborted requests not propagated through retry/refresh paths.** `src/core/client.ts:151-153` accepts `signal: AbortSignal` and forwards it to `fetch()` (line 292), but the silent-refresh retry path (`src/core/client.ts:351-364`) re-enters `requestInternal` without re-checking the original signal — if the consumer aborts during the refresh window the retry runs to completion. Same for the DPoP-nonce retry (lines 326-348). Auth0's request layer threads the signal through retries.

10. **`scheduleNextPoll` in `session-watcher.ts` does not run when the page is backgrounded then foregrounded after a long absence.** `src/core/session-watcher.ts:120-132` clears `pollTimer` on `hidden` and re-polls immediately on `visible`. Correct. But if the page is minimized for >60s, the existing timer fires while hidden (line 109-112 → `doPoll` line 134-140 returns early because `!isVisible()` and never reschedules). On return, the visibility handler does the immediate poll, so no data is lost — but if the watcher races with the SSE fallback path (`src/core/session-events.ts:209-220`), the lazy import there does NOT clear the existing pollTimer. Two timers can run.

### Minor

11. **`useAuth()` exposes both `signIn` (= verifyCode) and `requestCode`** (`src/react/useAuth.ts:35-36`). Naming suggests `signIn` performs the full flow; it actually does only verification. Auth0's `loginWithCredentials` and Firebase's `signInWithCredential` use this naming, but the SDK does not document the two-step pairing. Adding a `signInWithCode({destination, code})` wrapper would map to the dominant SDK convention.

12. **`onError` config hook (`src/config.ts:125`) is declared but never wired.** Grep across `src/` for `config.onError` or `cfg.onError` returns no hits. Either remove from the config interface or attach in `client.ts` error paths.

13. **`DelegationCenter.tsx` is 767 lines** for a single component. It contains four tabs, a dialog, and effective-access bulk-checking. Not architectural rot per se, but a candidate for the same component-split treatment as `useIdentity`.

14. **`profile/persona-fields.ts:1` declares a registry that's loaded via fetch but cached at module level (`let cachedRegistry`)**. The TTL/refresh model is undocumented; fields drift if the server updates the registry mid-session.

15. **`extendability` is interface-only for two of three adapters** (`src/extendability/auth-flow.ts`, `risk-signal.ts` — only `notification-channel` is wired in `registry.ts:7-25`). v1.1.0-rc.1 still ships with two reserved-but-empty adapter slots. Either dispatch them or remove until v1.2.

## Comparison to peers

| Axis | This SDK | Auth0 SPA | Firebase Auth Web | Okta auth-js | Supabase | Verdict |
|---|---|---|---|---|---|---|
| Module boundaries | core/flows/react/sw split | Single class + helpers | core+platform/web split | Multi-package monorepo | core+web split | **On par** with Okta/Supabase; cleaner than Auth0 |
| State location | Module singletons + BC | Single `Auth0Client` instance | Single `Auth` instance + IndexedDB | `OktaAuth` instance | `SupabaseAuthClient` instance | **Behind** — class-based instances scope better to multi-tenant pages |
| Token storage | IDB AES-GCM (master key non-extractable) | localStorage / cookie / IDB | IndexedDB encrypted | localStorage / cookie / sessionStorage | localStorage default | **Leads** on storage hygiene |
| Multi-tab sync | BroadcastChannel + Web Locks | localStorage events (legacy) | IndexedDB observer | localStorage + custom event | localStorage events | **Leads** — Web Locks is the modern correct pattern |
| Treeshakability | sideEffects:false + 7 subpaths + barrel verifier | sideEffects:false | sideEffects:false + modular | Mixed; some side effects | sideEffects:false | **On par** with Firebase modular |
| Bundle size (core gzip) | ~22 KB (tree) | 7-9 KB | 15-20 KB modular | 50+ KB legacy / 20 KB v7 | 12-15 KB | **Behind Auth0**; competitive with Firebase |
| DPoP / token binding | RFC 9449 with nonce-retry | No | No | No (planned) | No | **Leads** |
| Offline queue | IDB FIFO + dead-letter + Retry-After | None | None | None | None | **Leads** (uniquely BB) |
| SSE session events | Native EventSource + polling fallback | Polling | Polling (id-token refresh) | Polling | Realtime via separate package | **On par/leads** |
| Type strictness | strict + exactOptional + 0 `any` | strict | strict | strict | strict, some `any` | **On par with Firebase**; leads Supabase |
| Plugin model | Adapter interfaces (1/3 wired) | Hooks via options callbacks | Modular SDK packages | Plugins via interceptors | Custom storage adapter | **Behind** — interfaces declared but not dispatched |

## Quantitative metrics

LOC by module (TS + TSX, excluding tests):
- `react/` (incl. `components/`): 5,486 LOC across 33 files (largest)
- `core/`: 2,572 LOC across 19 files
- `flows/`: 1,096 LOC across 9 files
- `profile/`: 870 LOC across 7 files
- `offline/`: 520 LOC across 3 files
- `extendability/`: 178 LOC across 5 files
- `sw/`: 188 LOC across 2 files
- `imperative/`: 160 LOC across 1 file
- `internal/`: 13 LOC across 1 file
- `types/` + roots (`config.ts`, `errors.ts`, `index.ts`): 943 LOC

Type strictness:
- `: any` / `<any>` / `as any`: **0** in source (only in comments)
- `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck`: **0**
- `noUncheckedIndexedAccess`: enabled (`tsconfig.json:19`)
- `exactOptionalPropertyTypes`: enabled (`tsconfig.json:18`)

Bundle sizes (gzip, full transitive closure via metafile):
- `dist/esm/index.js` (core): 21.6 KB / budget 40 KB ✓
- `dist/esm/react/index.js`: 64.5 KB / budget 60 KB ✗ (over by ~7%)
- `dist/esm/profile/index.js`: 44.2 KB / budget 40 KB ✗ (over by ~10%)
- `dist/esm/flows/passkey-flow.js`: 13.0 KB / budget 12 KB ✗ (over by ~8%)
- `dist/esm/sw/index.js`: 0.6 KB / budget 5 KB ✓
- `dist/esm/extendability/index.js`: 0.3 KB
- `dist/esm/internal/index.js`: 4.4 KB

The shipped `package.json` size-limit configuration measures only the entry stub byte size, not the transitive closure, which is why the budgets currently pass in CI despite the closure overflows above. Largest single chunk: `chunk-P3ITSMSB.js` (135 KB raw / 34 KB gzip), 62% of which is `libphonenumber-js` metadata.

Cyclomatic complexity hotspots (LOC proxy + concern-mixing):
1. `src/react/components/DelegationCenter.tsx` — 767 LOC, 4 tabs + dialog + bulk-access wiring
2. `src/core/client.ts` — 564 LOC, 6+ orthogonal concerns
3. `src/react/components/PropertySection.tsx` — 546 LOC, address + asset + media + photo flows
4. `src/react/useIdentity.ts` — 498 LOC, store + 12 mutations + selectors in one file
5. `src/core/token-manager.ts` — 459 LOC (justified: lifecycle + multi-tab + locks)

Test architecture: 138 test files across `unit/`, `integration/`, `contract/`, `chaos/`, `security/`, `memory/`, `browser/`, `perf/` directories, with `msw` for HTTP fixtures (`package.json:98`) and `fake-indexeddb` for storage (line 94). Six dedicated vitest configs. Browser matrix via Playwright across 12 desktop/mobile/tablet projects (`package.json:53-58`).

## Recommended actions

1. **Lazy-load `libphonenumber-js` inside `validatePhone`** so the React entry sheds 34 KB gzip from its tree closure. _Effort: 1 day._ — `src/profile/validators.ts:11` becomes a dynamic import inside the function body; consumers of `validatePhone()` already await it.
2. **Switch size-limit to closure-aware budgets.** Replace each `path` entry with a glob that includes the entry plus all chunks the metafile reports as imports. _Effort: 0.5 day._ — Without this, three of the five budgets are silently mis-stated.
3. **Extract `attachDpop` and `handleNonceChallenge` from `client.ts`** into `core/dpop/attach.ts`. _Effort: 1 day._ — Drops client.ts under 400 LOC and lets the DPoP path be tested without the full request stack.
4. **Split `useIdentity.ts` into `identityStore.ts` (module-level state) + `useIdentity.ts` (hook)**, mirroring the `profile-store.ts` / `useProfile.ts` split. _Effort: 2 days._
5. **Decide on `setSession` shim removal** before v1.1.0 GA. Either delete the deprecation shim (`src/index.ts:38-56`) or update the comment to specify the actual removal version. _Effort: 0.5 day._
6. **Standardize uninit semantics across `client`, `event-reporter`, `reconciler`, `offline/queue`.** _Effort: 1 day._ — Document one rule (throw vs silent-drop based on call shape) in `docs/INTEGRATION_GUIDE.md` and align the four modules.
7. **Thread `AbortSignal` through silent-refresh and DPoP-nonce retry paths in `client.ts`.** _Effort: 1 day._
8. **Consolidate two profile/identity stores** OR formally document why both exist with a deprecation timeline for `profile-store.ts`. _Effort: 3-5 days for full consolidation; 0.5 day for documentation._
9. **Wire or delete the unused `onError` config hook and `auth-flow` / `risk-signal` adapter interfaces.** _Effort: 0.5-2 days depending on path chosen._
10. **Refactor `DelegationCenter.tsx` and `PropertySection.tsx` into 4-5 sub-components each** keyed by tab/section. _Effort: 2-3 days per component._

---
*Compiled by reading 100% of `src/`. Bundle metrics computed against the existing `dist/` produced from the tip of the audited tree. No source modified.*
