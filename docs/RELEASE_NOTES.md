# Release Notes — `@bainbridgebuilders/universal-auth`

## v1.0.0-rc.2 — 2026-04-28

**Critical fix-up release.** Recommended upgrade from rc.1 for any consumer that bundles the SDK with Vite or Rollup (CalExp5, future ControlTower SPA, the demo).

### Why upgrade

- **rc.1 broke Vite-based consumer builds** — `dist/esm/core/crypto-worker.js` path mismatch caused "Could not resolve entry module" errors in the Vite worker-import-meta-url plugin. Surfaced when expanding the demo to actually use the SDK. rc.2 emits the worker at `dist/esm/crypto-worker.js` (flat) where the bundled chunk's Worker URL expects it.
- **InvalidStateError** in event-reporter is now caught natively (look-back L12) — multi-tab DB upgrades, page-unload races, SW termination no longer crash fire-and-forget `void emit(...)` chains.
- **`dist/meta.json`** (esbuild metafile with build-machine paths + internal source filenames) no longer ships in the npm tarball (look-back L10).

### What changed from rc.1

| File | Change | Why |
|---|---|---|
| `scripts/build.ts` | crypto-worker entry name flattened (`core/crypto-worker` → `crypto-worker`) | Vite/Rollup couldn't resolve worker URL |
| `scripts/build.ts` | esbuild metafile → `.build-meta/esbuild-meta.json` (outside `dist/`) | Removed info disclosure in tarball |
| `src/core/event-reporter.ts` | New `isTransientIdbError()` + try/catch in `emit()` | Hardens against transient IDB connection-closed errors |
| `src/config.ts` | `SDK_VERSION` bumped to `1.0.0-rc.2` | Stamped on every event + outbound HTTP request |
| `demo/src/App.tsx` | Block 5 placeholder → full SDK kitchen-sink | Validates the package end-to-end at `auth-sdk-demo.bainbridgebuilders.com` |
| `test/unit/setup.ts` | Removed InvalidStateError swallow patterns | SDK now catches natively; filter would hide real regressions |
| `test/unit/core/event-reporter-resilience.test.ts` | NEW — 7 tests for `isTransientIdbError` | Locks in the L12 fix |

### Quality gates met

- 62 test files / 383 tests pass
- Coverage: 90.98% lines / 85.15% branches / 90.26% functions / 90.98% statements
- Bundle: core 11.78/40 KB, passkey 7.88/10 KB, sw 488 B/5 KB
- typecheck / lint / build / size-check / verify:bundle / verify:watermarks / verify:no-jose / npm audit — all green

### Migration from rc.1

No code changes required for consumers — drop-in upgrade. Bump the version pin in your `package.json`:

```diff
- "@bainbridgebuilders/universal-auth": "1.0.0-rc.1"
+ "@bainbridgebuilders/universal-auth": "1.0.0-rc.2"
```

If you were on rc.1 with a Vite-based consumer, you may have been seeing build failures on `crypto-worker.js`. rc.2 resolves these.

---

## v1.0.0-rc.1 — 2026-04-28

**First release candidate.** Targets `1.0.0` GA after CalExp5 integration (Block 7) signs off + 24h production soak (A6 audit).

### What's in it

- **Full §3 endpoint surface** — code flow, enrollment (`/auth/v1/enroll/*` per v1.4.0), session refresh + revoke, passkey ceremony (`@simplewebauthn/browser`), persona-registry client, permission grants, consent collection, settings sync, event ingestion.
- **3-context React provider** (`identity` / `entitlements` / `status`) with Suspense-ready hydrate. 17 components: `<SignInForm>`, `<CodeEntry>`, `<PasskeyPrompt>`, `<ConsentScreen>` (9-checkbox crew hard-gate per §3.4 v1.4.0), `<ProfileSetupScreen>` (3 modes per §5.5.1), `<AvatarPicker>`, `<ContactInfoForm>`, `<PersonaFieldsForm>`, `<AppChooser>`, `<PersonaChooser>`, `<PersonaGuard>`, `<AgentStatusBanner>`, `<ImpersonationBanner>`, `<OfflineIndicator>`, `<ProfileCompletenessBar>`.
- **Imperative API** (`getAuth()`) for non-React consumers.
- **Profile module** (`src/profile/*`) — JPEG compression at 82% / ≤1024px, 20-preset SVG library deterministically picked by identity hash, initials fallback with 6-color palette, libphonenumber-validated contact info, persona-fields server registry with 1h client cache.
- **Offline queue** with FIFO mutation replay, idempotency-key preservation, status-code matrix per §9.4 (2xx/4xx/5xx/401/409/429), dead-letter after MAX_RETRIES.
- **Service worker bridge** (background-sync + foreground-flush fallback). Cache purge on logout.
- **Encrypted refresh tokens** (AES-256-GCM, PBKDF2-SHA256 device-bound key, runs in Web Worker per §8.2).
- **Event reporter** with batched 10s/50-event ingestion, auto-stamped `sdk_version` / `protocol_version` / `client_ts`.
- **Session watcher** polling `/auth/v1/me` every 60s while `document.visibilityState === 'visible'`, with ETag 304 handling.
- **Multi-tab session sync** via Shared Worker (BroadcastChannel fallback).
- **17 typed error classes** covering every spec §3.7 + v1.4.0 §3.4 + §5.4.5 code (15 + 2 = 17 client-facing).
- **Mode safety** (`production` / `development` / `test` / `e2e`) with hostname-gated assertion.

### Bundle budget (per §12.1)

| Chunk | Budget | Actual |
|---|---|---|
| core | 40 KB gzip | **11.78 KB** (29% of budget) |
| passkey lazy | 10 KB gzip | **7.88 KB** (79%) |
| sw lazy | 5 KB gzip | **0.43 KB** (9%) |

### Quality gates met

- **Unit:** 359 tests across 60 files. Coverage **91.06% lines / 85.14% branches / 90.50% functions / 91.06% statements** — all four spec §11 thresholds enforced via `vitest.config.ts`.
- **Cold-start:** 18.84 ms median (3× Moto G Power throttle) vs 50 ms budget per §7.1.
- **Memory soak:** 220+ sign-in/out cycles in 5s smoke; 24h soak gate in nightly `chaos.yml`.
- **Security:** 18 tests across 6 files — fast-check fuzzing, timing-attack resistance, token storage hygiene, IDB tamper, CSRF headers, token replay. `pnpm audit --prod --audit-level=high`: 0 vulnerabilities.
- **Verifiers:** `verify-bundle` (sideEffects:false, no eval), `verify-watermarks` (BB watermark on every file), `verify-no-jose` (no forbidden transitive deps per Appendix B) — all green.
- **Browser matrix:** 12 Playwright projects (chrome/firefox/webkit/edge × desktop/mobile/tablet) ready to run against deployed demo.
- **Chaos:** 7 Toxiproxy scenarios per §11.6 (connection drop, 5xx burst, ±1h skew, IDB unavailable, multi-tab race, tab crash, SW blocked).

### What's NOT in this RC (deferred to GA / Phase 2)

- **DPoP cryptographic device binding** (replaces SHA-256(UA)) — §15.2 + §16.2 Phase 2
- **SSE push for session revocation** (replaces 60s polling) — §8.1 Phase 2
- **App-signed events HMAC** — §16.2 Phase 2 (origin + app_id check sufficient at current scale)
- **Device attestation** (App Attest / Play Integrity) — out of scope at current company size
- **Account recovery IDV** (Stripe Identity / Persona) — out of scope
- **Per-tenant white-label SDK config bundle** — out of scope
- **OAuth 2.0 provider for smart home** — D12 RESERVED Phase 3+
- **Sibling packages** `@bainbridgebuilders/universal-comms` (Appendix E) + `@bainbridgebuilders/universal-inspect` (Appendix F) — separate repos when built

### Breaking changes from RC vs prior alphas/betas

This is the first published version. There are no prior releases.

### Known issues / carry-forwards

- **Pact contract surface:** 2 interactions today (`POST /auth/v1/code/request` + `POST /auth/v1/code/verify`); plan calls for full §3.1-3.5 coverage before GA. Tracked in A5 finding F5.
- **Demo deploy + browser-matrix live run:** demo deploys at start of Block 7; the browser matrix gates A5 #3 once demo is live.
- **CT BFF Pact verifier CI job:** lands in `BainbridgeBuilders/control-tower` repo; coordination per Risk R13.
- **Security + Legal sign-off** for `1.0.0` GA: deferred to A6 audit.
- **CalExp5 cutover:** Block 7 Days 24-27. Expected line delta `−1,800 / +200`.

### Upgrade path

Greenfield consumer apps: install + follow `docs/INTEGRATION_GUIDE.md`. There is no v1.0.0-rc.0 to upgrade from.

CalExp5 cutover: see `docs/INTEGRATION_GUIDE.md` "CalExp5-specific cutover notes".

### Provenance

Published with `npm publish --provenance` per spec §15.1. SLSA Level 3 attestation links the published tarball to the GitHub Actions workflow that built it, providing supply-chain integrity verification.

### Acknowledgments

Built by Sam Jonaidi + Claude. Plan reference: `purring-sleeping-hanrahan.md` (38-day timeline, 6 audit gates). Spec reference: `BB_UNIVERSAL_AUTH_SDK_SPEC.md v1.4.2` (2,239 lines).

---

## Future versions

`1.0.0-rc.2` — bug fixes from CalExp5 integration, if any.
`1.0.0` — GA after A6 audit signs off (Block 7 Day 27 + 24h soak).
`1.1.0` — DPoP, SSE push, expanded Pact surface.
