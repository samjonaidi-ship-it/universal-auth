# Holistic SDK Assessment | 2026-05-06
**Subject:** `@samjonaidi-ship-it/universal-auth@1.1.0-rc.1`
**Composite score: 7.0 / 10** (Architecture 7.0 + Security 7.6 + API/DX 6.5)

Three parallel agents performed 100%-read audits in their domains. Every claim cites `file:line`. This document synthesizes their findings into a single ranked action list and surfaces cross-cutting themes.

---

## TL;DR

- **What it does better than the four peer SDKs (Auth0 SPA, Firebase Auth, Okta auth-js, Supabase auth-js):** DPoP w/ nonce retry (uniquely deployed), refresh-token AES-GCM under non-extractable master key (above all peers), `navigator.locks` cross-tab refresh coalescing (above all peers), 17 typed discriminated error classes (above all peers), strict TS with **zero** `any` and **zero** `@ts-ignore` across 10.2 KLOC.
- **What it does worse:** README quick-start is **broken** at line 22 — consumers' first interaction throws a TS/runtime error. Component theming is absent (1 of 21 components accepts `className`). `forwardRef` not used anywhere. Bundle size budgets measure entry stub only — 3 of 5 actually overshoot when measured properly. The React subpath silently pulls 34 KB gzip of libphonenumber.
- **What it gets right but should harden before GA:** DPoP missing `ath` claim per RFC 9449 §4.2 (1-hr fix, not exploitable today, future-proofing); `useDpop:'auto'` silent downgrade window (config-only fix); two parallel profile/identity stores that need a documented deprecation timeline.
- **No Critical security findings.** Three High, six Medium, five Low. ~18 hours covers all server-independent security remediation.

---

## Three things to fix this week

| # | Finding | Source | Effort | Why now |
|---|---|---|---|---|
| 1 | **README.md:22 imports `AuthProvider`/`useAuth` from main barrel — those exports live at `/react`.** First copy-paste from the README throws. | API_DX C1 | **5 min** | Every new consumer hits this. Single-line fix. |
| 2 | **Add DPoP `ath` claim** per RFC 9449 §4.2 — currently the proof binds to the client key but not to the access token. Captured proof can be paired with a different token from the same key. | SECURITY H1 | **1 hr** | Closes the only meaningful RFC-9449 conformance gap before broader DPoP rollout. |
| 3 | **Fix size-limit budgets** to measure transitive closure, not entry stub. Three of five budgets currently over-spend silently (React 64.5 KB > 60 KB; profile 44.2 KB > 40 KB; passkey 13 KB > 12 KB gzip). | ARCHITECTURE C1, C2 | **0.5 day** | Currently CI is signing off on bundle budgets that don't reflect reality. |

---

## Cross-cutting themes (mentioned by ≥2 agents)

These are higher-value than any single finding because they touch multiple domains.

### CT-1 · `AbortSignal` plumbing absent across public surface
- API_DX #10: zero public async functions accept `signal?: AbortSignal`
- ARCHITECTURE #9: silent-refresh and DPoP-nonce retry paths in `client.ts` ignore the signal that *was* passed
- **Impact:** Consumers using TanStack Query / SWR / React 18 Strict Mode cannot cancel in-flight requests. This is mainstream React behavior.
- **Effort:** 4-8 hours to thread end-to-end.

### CT-2 · `console.warn`/`console.error` should route through the configured `onError` hook
- ARCHITECTURE #12: `onError` is declared in `UniversalAuthConfig` (`config.ts:125`) but **never wired** anywhere in the codebase.
- SECURITY L1: token-manager warnings (`token-manager.ts:331-333, 392-396`) hit raw `console.warn`
- API_DX #13: client.ts + token-manager have 4 unrouted console statements
- **Impact:** Consumers using Sentry / LogRocket / Datadog cannot intercept SDK warnings. The hook's existence implies they can.
- **Effort:** 1-2 hours to wire.

### CT-3 · Bundle hygiene mismatch between marketing and reality
- ARCHITECTURE C1: React subpath transitively pulls `libphonenumber-js` (135 KB raw / 34 KB gzip) despite `src/profile/index.ts:2` claiming the dependency is "kept out of the core 40 KB budget" — true for `/`, false for `/react`.
- API_DX #5: README "Package layout" lists 3 subpaths; package.json exports 6.
- **Impact:** Consumers shipping the React subpath think they're getting 60 KB; they're shipping 64.5 KB. Drift will widen.
- **Effort:** 1 day for lazy-import; 0.5 day for accurate budgets.

### CT-4 · `setSession` deprecation past its self-declared sunset
- ARCHITECTURE #7: shim claims removal "in v1.1" — package is `1.1.0-rc.1`, shim still present
- API_DX inventory: confirms `setSession` is the only deprecated public symbol
- **Impact:** Mostly cosmetic; tree-shakers drop it. But the documentation lies about the version.
- **Effort:** 0.5 day to either delete or update the comment.

### CT-5 · Verb taxonomy drift on the sign-in flow
- API_DX #4 + #7: `requestCode`/`verifyCode` (flows), `signIn`/`verify` (imperative), `requestCode`/`signIn`-aliased-to-verifyCode (`useAuth`)
- ARCHITECTURE #11: same observation; `useAuth.signIn` looks like full flow, is actually verification only
- **Impact:** A consumer migrating from React to imperative gets a silent contract change.
- **Effort:** 2 hours for deprecation aliases.

---

## Domain summaries

### Architecture — 7.0 / 10
**Strongest:** clean unidirectional layering (core never imports react — verified by grep), strict TS with zero `any`, refresh concurrency correct via Web Locks + BroadcastChannel + shape-validated payloads, no top-level await, no hand-rolled crypto outside `crypto.subtle`, `sideEffects: false` enforced by custom barrel verifier, multi-tab coordination beats every peer SDK.

**Weakest:** three god modules (`DelegationCenter.tsx` 767 LOC, `client.ts` 564 LOC mixing 6 concerns, `useIdentity.ts` 498 LOC mixing store + 12 mutations + selectors). Two parallel profile/identity stores. `reconciler.flushOne` re-implements `client.ts` request-building (will drift). Module-level singletons have inconsistent uninit semantics across 4 modules.

**Bundle reality vs claim:** core 21.6 KB ✓; **react 64.5 KB ✗ (budget 60 KB)**; **profile 44.2 KB ✗ (budget 40 KB)**; **passkey 13 KB ✗ (budget 12 KB)**; sw 0.6 KB ✓. The 60 KB react budget passes CI today only because size-limit measures the entry stub byte size, not the transitive closure.

### Security — 7.6 / 10
**Strongest:** Access tokens RAM-only. Refresh AES-256-GCM under non-extractable CryptoKey. DPoP keypair non-extractable in IDB. RFC 9449 §8 nonce challenge handling correct. RFC 7638 thumbprint correct. Hardened fetch (`redirect: 'manual'` + `referrerPolicy: 'strict-origin-when-cross-origin'`). CI gates ban `eval`, `Function`, inline scripts, and 6 forbidden deps including `jose`.

**Weakest:** RFC 9449 §4.2 `ath` claim missing — proof binds to client key but not to access token (1-hr fix). `useDpop:'auto'` silently falls back to plain Bearer on any DPoP build error — opens a downgrade attack window during rollout. No client-side `cnf.jkt` round-trip verification after refresh. Entitlements written to localStorage unencrypted (UI-spoofable, no server bypass). Device-ID stored in localStorage and trusted on read (XSS-pinnable). WebAuthn UV/UP not enforced client-side (relies on BFF). Refresh `Idempotency-Key` truncates SHA-256 to 64 bits (negligible at scale).

**Standards conformance:** RFC 9449 mostly ✓ with 4 PARTIAL (cnf.jkt verify, jti uniqueness, iat freshness, sender binding observability). RFC 7638/7515/7517/7518 ✓. OAuth 2.1 ✓ with refresh-binding partial. WebAuthn ✗ on UV enforcement client-side. OWASP ASVS ✓ except V3.4.3 (CSRF Origin check) and V8.2.1 (entitlements at rest).

### API / Developer Experience — 6.5 / 10
**Strongest:** 6 subpath exports (above peers), zero default exports, 17 typed discriminated error classes (above peers), 3-context React split with `displayName`s set (above peers — Auth0/Firebase routinely miss DevTools labels), imperative + React parity (above peers — Auth0 is React-only). Every error has structured `code`, `hint`, `retryAfterSeconds`, `traceId`, `cause`. JSDoc coverage ~95% on public surface. Mode-safety guard at `initUniversalAuth` time, not at first network call.

**Weakest:** **README.md quick-start is broken** at the import statement. Of 21 React components, **1** accepts `className`. **Zero** components use `forwardRef`. `<SignInForm>` cannot be pre-filled — INTEGRATION_GUIDE openly tells consumers to fork it. `useAuth` mixes 12 fields (consumer reading `identity` re-renders on `status` flips, defeating the 3-context split for that hook). Hooks throw plain `Error` (not `AuthSdkError`) on misuse. `AuthSdkError.code` is `string`, not literal union — kills exhaustive switch.

**Happy-path LOC vs peers:** 9 LOC for sign-in via INTEGRATION_GUIDE — competitive with Auth0 (~7) and Firebase (~12). Only the README is broken; the working path is fine.

---

## Unified ranked action list

P0 = ship-blocker for v1.1.0 GA. P1 = needed for production hardening. P2 = polish for v1.2.

### P0 — ship-blockers (3.5 hours total)

| # | Action | Source | Effort |
|---|---|---|---|
| 1 | Fix `README.md:22` import — split `AuthProvider`/`useAuth` to `/react` subpath; sync §"Package layout" to all 6 subpaths | API_DX C1, #5 | 5 min |
| 2 | Add CI check that `tsc --noEmit`s the README quick-start | API_DX rec #2 | 30 min |
| 3 | Add DPoP `ath` claim per RFC 9449 §4.2 | SECURITY H1 | 1 hr |
| 4 | Switch size-limit to closure-aware budgets (glob entry + chunks) | ARCHITECTURE rec #2 | 0.5 day |
| 5 | Decide setSession shim: delete or update sunset comment | ARCHITECTURE rec #5 | 0.5 day |

### P1 — production hardening (~3 days)

| # | Action | Source | Effort |
|---|---|---|---|
| 6 | Lazy-load `libphonenumber-js` inside `validatePhone()` so React subpath sheds 34 KB gzip | ARCHITECTURE rec #1 | 1 day |
| 7 | Default `useDpop` to `'always'` once server enforcement opens; alert on `dpop.fallback_used` rate | SECURITY H2 | 2 hr |
| 8 | After refresh, verify `cnf.jkt` matches local thumbprint; clearSession on mismatch | SECURITY M1 | 1 hr |
| 9 | Add `className?: string` + `style?: CSSProperties` to all 21 React component prop interfaces | API_DX rec #3 | 4-8 hr |
| 10 | Wrap user-facing components (`SignInForm`, `CodeEntry`, `PasskeyPrompt`, `OfflineIndicator`, `ImpersonationBanner`, `AppChooser`) in `forwardRef` | API_DX rec #4 | 3 hr |
| 11 | Add `defaultDestination?: string` + `onDestinationChange?` to `<SignInForm>` (resolves the "fork it" workaround) | API_DX rec #5 | 1 hr |
| 12 | Thread `AbortSignal` through every async public function + retry/refresh paths in client.ts | CT-1 (API_DX #10, ARCH #9) | 4-8 hr |
| 13 | Wire `config.onError` hook into client.ts + token-manager warnings (4 sites) | CT-2 (ARCH #12, SEC L1, API_DX #13) | 1-2 hr |
| 14 | Validate `apiBaseUrl` (https + same-eTLD+1 vs `cookieDomain`) at init in production mode | SECURITY M4 | 2 hr |
| 15 | WebAuthn UV: refuse `userVerification:'discouraged'` + assert `flags.uv` post-assertion | SECURITY M5 | 2 hr |
| 16 | HMAC-tag entitlements localStorage blob (cheaper than full encrypt) | SECURITY M2 | 2 hr |
| 17 | Move device-id to IDB+MAC OR recompute every boot (cheap SHA-256 of UA) | SECURITY M3 | 1 hr |

### P2 — polish (~10 days if all done)

| # | Action | Source | Effort |
|---|---|---|---|
| 18 | Extract `attachDpop` and `handleNonceChallenge` from `client.ts` into `core/dpop/attach.ts` (drops client.ts under 400 LOC) | ARCHITECTURE rec #3 | 1 day |
| 19 | Split `useIdentity.ts` into `identityStore.ts` + thin hook (mirror `profile-store.ts` / `useProfile.ts` split) | ARCHITECTURE rec #4 | 2 days |
| 20 | Refactor `DelegationCenter.tsx` into 4-5 sub-components keyed by tab | ARCHITECTURE rec #10 | 2-3 days |
| 21 | Refactor `PropertySection.tsx` (546 LOC) into address + asset + media + photo flows | ARCHITECTURE rec #10 | 2 days |
| 22 | Standardize uninit semantics across `client`, `event-reporter`, `reconciler`, `offline/queue` (one rule, documented) | ARCHITECTURE rec #6 | 1 day |
| 23 | Consolidate two profile/identity stores OR document deprecation timeline for `profile-store.ts` | ARCHITECTURE rec #8 | 0.5 day docs / 3-5 days full |
| 24 | Wire or delete unused `auth-flow` / `risk-signal` adapter interfaces (currently 1/3 wired) | ARCHITECTURE rec #9 | 0.5-2 days |
| 25 | Unify verb taxonomy (deprecate `useAuth.signIn` alias; standardize on `requestCode`/`verifyCode`) | CT-5 (API_DX #4, ARCH #11) | 2 hr |
| 26 | Add `getAuth().getUser(): Promise<Identity \| null>` for non-React consumers | API_DX rec #9 | 2-4 hr |
| 27 | Add `useAuthStatus()` hook subscribing only to `StatusContext` | API_DX rec #10 | 30 min |
| 28 | Convert provider-misuse errors to `AuthProviderMissingError extends AuthSdkError` | API_DX rec #11 | 30 min |
| 29 | Export `type AuthErrorCode` literal union; re-type `AuthSdkError.code` | API_DX rec #6 | 30 min |
| 30 | Auto-stamp `SDK_VERSION` from `package.json` at build-time | API_DX rec #12 | 1 hr |
| 31 | Add JSDoc `@example` blocks to top-10 most-used exports | API_DX rec #14 | 4 hr |
| 32 | Publish `/test-utils` subpath with MSW handler set | API_DX rec #15 | 2 hr |
| 33 | Use full SHA-256 hex for refresh `Idempotency-Key` (drop 64-bit truncation) | SECURITY M6 | 5 min |
| 34 | Document XSS oracle in INTEGRATION_GUIDE; warn at init when Trusted Types not enforced | SECURITY H3 | 2 hr |
| 35 | Document caller ordering re: enrollment token strip | SECURITY L2 | 15 min |
| 36 | Optional: SW-hash pinning config field for high-assurance consumers | SECURITY L5 | 4 hr |
| 37 | Restore distinct `key_handle_missing` reason in `inferDecryptFailureReason` | SECURITY L4 | 15 min |

**Total P0+P1:** ~3.5 working days. **Plus full P2:** ~12-15 working days.

---

## Comparison to peers (consolidated)

| Axis | This SDK | Auth0 SPA | Firebase Auth | Okta auth-js | Supabase | Verdict |
|---|---|---|---|---|---|---|
| Module boundaries | core/flows/react/sw | Class + helpers | core+platform/web | Multi-pkg monorepo | core+web | **On par** with best |
| Token storage hygiene | RAM access + AES-GCM IDB refresh + non-extractable keys | localStorage / cookie / IDB | IDB encrypted | localStorage / cookie | localStorage default | **Leads** |
| Multi-tab sync | Web Locks + BroadcastChannel | localStorage events | IDB observer | localStorage + custom evt | localStorage events | **Leads** |
| DPoP / sender-binding | RFC 9449 w/ nonce retry | No | No | No (planned) | No | **Uniquely deployed** |
| Offline mutation queue | IDB FIFO + dead-letter + Retry-After | None | None | None | None | **Uniquely deployed** |
| SSE session events | Native EventSource + polling fallback | Polling | Polling (id-token refresh) | Polling | Realtime via separate pkg | **On par/leads** |
| Discriminated errors | 17 classes + base | code on `Error` | enum on `FirebaseError` | code on `OktaAuthError` | `AuthError` w/ name/status | **Leads** (typed classes) |
| Subpath imports | 6 | 1 | namespace per service | 1 | 1 + adapters | **Leads** |
| `AbortSignal` plumbed through public surface | **No** | Partial | No | No | Partial (recent) | **Behind peers** |
| Component theming surface (className/slots/forwardRef) | **1 of 21 / 0 of 21** | n/a (logic-only) | n/a | n/a | n/a | **Below MUI/Chakra peers**; matters because this SDK ships components |
| README quick-start runs as-written | **No** | Yes | Yes | Yes | Yes | **Below peers** |
| Bundle size (core gzip, transitive) | ~22 KB | 7-9 KB | 15-20 KB modular | 50+ KB legacy / 20 KB v7 | 12-15 KB | **Behind Auth0**; competitive with Firebase modular |
| Type strictness (`any` count, `@ts-ignore`) | 0 / 0 | strict | strict | strict | strict, some `any` | **On par with Firebase, leads Supabase** |
| Plugin / adapter model | 3 interfaces declared, 1 wired | Hooks via options callbacks | Modular SDK packages | Plugins via interceptors | Custom storage adapter | **Behind** — interfaces declared but not dispatched |
| Imperative + React parity | Both first-class | React only | Imperative-only | Imperative-only | Imperative-only | **Leads** |

**Net:** the SDK is **strictly best-in-class** on token storage, multi-tab sync, DPoP, offline queue, error catalog, type strictness, and subpath layout. **Strictly behind peers** on `AbortSignal`, component theming, README correctness, and Auth0-class bundle size. **On par or leads** everywhere else.

---

## Recommended path forward

**For v1.1.0 GA tag (this week):** P0 actions only (3.5 hours). Tag and release. The SDK is shippable today; P0 closes the README footgun, the size-budget lie, the DPoP §4.2 conformance gap, and decides the setSession shim's fate.

**For v1.1.0 patch series (.x):** P1 actions over the next 2 weeks. Component theming + AbortSignal + onError wiring are the largest consumer-facing wins. The remaining security M-tier items can be staged.

**For v1.2.0 (1-2 months out):** P2 architectural refactors. The three god modules and the dual profile/identity stores will pay compounding dividends if addressed before the codebase grows further. The verb taxonomy unification needs a deprecation cycle, so it must start at the top of v1.2 to land cleanly in v1.3.

**For v2.0 (long-term):** consider iframe-sandbox for DPoP signing key (closes the documented same-origin XSS oracle); evaluate fetch+ReadableStream for SSE to allow DPoP on the event channel.

---

## What this audit did NOT cover

- Server-side enforcement of any of the SDK's claims (BFF audit is separate)
- Performance profiling (LCP, INP, JS execution time on low-end devices)
- Live penetration test against deployed app.buildwithbainbridge.com
- Documentation prose quality beyond inline JSDoc
- Test suite quality (test architecture noted; test correctness not audited)
- Internationalization / accessibility of React components
- License compliance of transitive dependencies

These are reasonable next-audit candidates if the gaps in this report are addressed and you want to keep raising the bar.

---

*Synthesized from three parallel agent audits — `ARCHITECTURE.md` (134 lines), `SECURITY.md` (202 lines), `API_DX.md` (180 lines) — total 516 lines of evidence-based findings, each citing `file:line`. No source modified. All scores subjective on a 1-10 scale where 10 = "I would publish this as a textbook example."*
