# Threat Model | `@bainbridgebuilders/universal-auth` | v1.0.1 | 2026-05-01 | BB

This document maps every threat in spec §15.3 to (a) the SDK code path that defends against it, (b) the test that regresses the defense. Cross-walked with spec **`BB_UNIVERSAL_AUTH_SDK_SPEC.md v1.6.0`** §15.

**v1.0.1 changes from v1.0.0-rc.4 (2026-05-01):**
- **T3 token theft from IDB:** at-rest key derivation moved from PBKDF2(SHA-256(navigator.userAgent) + constant-salt) to `crypto.subtle.generateKey({extractable:false})` random AES-256-GCM with the CryptoKey *handle* persisted in IDB. Closes the audit finding that UA is publicly observable + commonly logged in server access logs.
- **D5 mode-safety assertion:** un-hardcoded — now reads `config.cookieDomain` instead of literal `.bainbridgebuilders.com`. Domain cutover (D20, 2026-05-03) is data-only with no SDK rebuild.
- **D6 mutex-coalesced refresh:** SharedWorker plan retired in favor of `navigator.locks.request('bb-auth-refresh', {mode:'exclusive'}, ...)`. Universal browser support including Safari.
- **D10–D14 NEW (added below):** fetch hardening, idempotency-key collision for refresh, BroadcastChannel payload validation, magic-link fragment strip, settings/profile 409 patch surfacing.
- **3 unmapped threats from audit (brute-force on code, phishing, Safe Links pre-fetch)** now have explicit test citations or deferral note.

**Audience:** auditors, security-review reviewers, future maintainers debugging "did this defense survive a refactor?"

**Convention:** `src/<path>` = SDK source; `test/<kind>/<file>` = test that verifies the defense.

---

## 1. STRIDE matrix — spec §15.3

| # | Threat (spec wording) | SDK defense (code) | Test citation | Spec ref |
|---|---|---|---|---|
| T1 | **Credential stuffing** — attacker tries leaked password lists | Code-first flow only; no password field exists in SDK API surface | `test/security/01-fuzz-code-validation` (asserts no password parameter is accepted in any request); `test/integration/01-signup-refresh-revoke` (full flow has no password) | §15.3 + §3.1 |
| T2 | **Brute-force on code** — attacker tries all 1,000,000 6-digit codes | Code TTL 15 min + per-identity throttle + account lock after 5 failed verifies (server-side); SDK surfaces `AUTH_CODE_INVALID` / `AUTH_RATE_LIMITED` errors. **v1.0.1:** added statistical runtime timing test that catches client-side timing leakage. | `src/errors.ts` (`AuthCodeInvalid`, `AuthCodeExpired`, `AuthRateLimited` classes — typed throws on each code); `test/unit/errors.test.ts` (21 tests verifying each class instantiation + `errorFromEnvelope` mapping); `test/security/02-timing-attack-resistance.test.ts` v1.0.1 (10,000 invocations of `verifyCode` with known-bad vs unknown destinations; asserts `mean(known_bad) - mean(unknown) < 5%` — kills the v1.0.0 source-grep tautology). **Lockout-after-5 path is server-side only — covered in CT BFF integration tests, not SDK side.** | §15.3 + §3.7 |
| T3 | **Token theft from IDB (device copy)** — attacker copies IDB ciphertext to a different device | **v1.0.1:** AES-256-GCM with non-extractable random CryptoKey handle persisted in IDB (`src/core/storage-crypto.ts` + `src/core/storage.ts`). The CryptoKey is `crypto.subtle.generateKey({extractable:false})` — its bytes are never exposed to JavaScript. The IDB blob travelling to another browser cannot be decrypted because the CryptoKey object doesn't structured-clone across origins. `test/security/04-idb-tamper` covers corruption-fails-gracefully; cross-device blob swap remains untested per audit (browser vendor invariant). | `src/core/crypto-client.ts` (worker-mode + fallback paths); `test/security/04-idb-tamper` (corrupt AES-GCM tag → `getAccessToken()` returns null gracefully); `test/security/03-token-storage` (scans IDB for plaintext) | §15.3 + §15.1 |
| T3a | **Token theft from IDB (in-page XSS)** — hostile in-page script calls SDK decrypt | **Residual risk:** non-extractable + Worker isolation raise the bar but do NOT eliminate the same-origin oracle. SDK can decrypt its own data inside the page; an XSS attacker who pivots through the SDK closure has a decryption oracle. **Defense in depth:** consumer apps must apply CSP + Trusted Types per `INTEGRATION_GUIDE.md §9`. SDK closure tightening keeps token strings out of `window.*`. | Source: `getAccessToken()` is async + only callable from SDK code; `test/security/03-token-storage` scans IDB / localStorage / sessionStorage / `window.*` for token strings — none found. | §15.2 (acknowledged) |
| T4 | **Phishing** — attacker spins up `bb-bainbridge-builders.com` and tricks user | `src/flows/passkey-flow.ts` uses WebAuthn — RP-ID is implicitly bound to the registering origin by the browser (the SDK does not pass a custom `rpId`, so the browser uses the page's effective domain). Code flow has per-email throttle + deliberate click-to-confirm in `<CodeEntry>` | `test/unit/flows/passkey-flow.test.ts` (full register + authenticate ceremony with `@simplewebauthn/browser` mocked); `test/browser/02-passkey-conditional-ui.spec.ts` (Chrome virtual authenticator via CDP). **The RP-ID binding is a browser invariant; we don't override it, so there's nothing SDK-side to test beyond "we don't pass a custom rpId" — verified by source inspection.** | §15.3 + §3.1 |
| T5 | **Magic-link pre-fetch (Safe Links)** — Outlook/Gmail pre-fetch the link, consuming the token | `src/flows/enroll-flow.ts` `verifyEnrollmentToken` POSTs (not GET); link URL itself carries the token in fragment + email pre-fill, but the SDK only validates via POST. **v1.0.1:** SDK calls `history.replaceState(null, '', location.pathname + location.search)` immediately after reading the fragment, so the token does NOT persist in browser history or remain readable by third-party in-page scripts. | `test/unit/flows/enroll-flow.test.ts` ("verifyEnrollmentToken uses POST (D3 — defeats Safe Links)" + new test "fragment stripped from URL after read"); browser-test asserting GET on enroll-activate returns 405 is BFF-side. | §15.3 + §3.1bis |
| T6 | **Account enumeration** — attacker probes `/code/request` to learn which emails exist | Server returns generic `{"ok": true}` regardless; SDK never branches on existence (always proceeds to `<CodeEntry>` after request). Source inspection: `src/flows/code-flow.ts requestCode()` returns `void` — no existence-tell to the caller. | `test/contract/auth-endpoints.contract.test.ts` (POST /code/request shape with `{ ok: true }` matcher); source: `git grep "if.*identity_id"` in `src/flows/code-flow.ts` returns no branches on existence. **Server-side enumeration defense (uniform timing + dummy hash compare) is BFF business — not SDK-tested.** | §15.3 + §3.1 |
| T7 | **XSS → token exfil** — `<script>alert(localStorage.access_token)</script>` | SDK closure holds access token in module-private variable in `src/core/token-manager.ts`; never returned from any public function as a string; `getAccessToken()` is `async` and only callable from SDK code | `test/security/03-token-storage` (after sign-in, scans localStorage / sessionStorage / IDB for token strings — none found); `test/security/06-token-replay` (asserts token never lands in window properties) | §15.3 + §15.1 |
| T8 | **Server compromise / insider** — DBA reads tokens from postgres | Refresh tokens stored as bcrypt hashes server-side (NOT SDK side); SDK transmits cleartext over TLS only. Audit log hash-chain + WORM export Phase 2. | (Server-side defense — not SDK-tested.) Spec §15.1 references CT BFF migration `057_audit_chain_hash.sql`. | §15.3 |

---

## 2. Additional defenses beyond spec §15.3

These aren't in the spec's STRIDE table but are real defenses the SDK enforces:

| # | Defense | Code | Test |
|---|---|---|---|
| D1 | **CSRF**: every mutation carries `Idempotency-Key` (nanoid) + `X-Auth-Protocol-Version: v1` + `X-App-Id` | `src/core/client.ts` request builder | `test/security/05-csrf-headers` (5 tests; 50 mutations → 50 unique keys, GETs do NOT carry idempotency) |
| D2 | **Token replay**: refresh token rotation overwrites old IDB blob; refresh token family revoked on reuse (server side) | `src/core/token-manager.ts` `setSession()` | `test/security/06-token-replay` (rotation overwrites blob; refresh token never in non-IDB storage) |
| D3 | **No `eval`, no inline scripts, no `Function()`** in bundled output | esbuild config + `scripts/verify-bundle.ts` | `pnpm verify:bundle` (CI gate, runs on every PR) |
| D4 | **No vulnerable transitive deps** (`jose`, `lodash`, `axios`, `zustand`, `moment`, `date-fns` forbidden per spec Appendix B) | `scripts/verify-no-jose.ts` | `pnpm verify:no-jose` (CI gate) |
| D5 | **Mode-safety assertion (v1.0.1: config-driven)**: refuses to run `mode: 'development' \| 'test' \| 'e2e'` on the production hostname (read from `config.cookieDomain`, defaults to `.buildwithbainbridge.com` post-D20). | `src/config.ts` `assertModeSafety()` | `test/unit/config.test.ts` (3 negative + 5 positive cases) |
| D6 | **Cross-tab refresh coalescing (v1.0.1: Web Locks)**: 5 concurrent `refresh()` calls across tabs → 1 network request via `navigator.locks.request('bb-auth-refresh', {mode:'exclusive'}, ...)`. Double-checked re-read inside the lock. BroadcastChannel propagates the new token. SharedWorker plan retired (Safari has no SharedWorker but ships `navigator.locks`). | `src/core/token-manager.ts` `performRefresh` lock wrapper | `test/chaos/05-multi-tab-refresh-race` (2s latency injected, 5 concurrent tabs complete < 10s with exactly 1 network call) |
| D10 | **Refresh idempotency-key collision (v1.0.1)**: `Idempotency-Key` for `/session/refresh` derived from `SHA-256(refresh_token).slice(0,16)` so concurrent tabs that race past the in-tab mutex collide on the server, allowing dedup. | `src/core/client.ts` refresh path | `test/security/06-token-replay` (extended for v1.0.1: assert two parallel refreshes with same RT produce identical Idempotency-Key headers) |
| D11 | **Fetch hardening (v1.0.1)**: every SDK request sets `redirect: 'manual'` (auth headers don't follow redirects across origins) + `referrerPolicy: 'strict-origin-when-cross-origin'` (Referer doesn't leak full URL) | `src/core/client.ts` all `fetch(...)` calls | source-inspection + `test/unit/core/client-fetch-options.test.ts` (asserts every fetch has hardened init) |
| D12 | **BroadcastChannel payload validation (v1.0.1)**: `bb-universal-auth-session` channel rejects messages where `accessToken` is non-string or > 8192 chars; same for `sessionId` / `refreshToken`. Hardens against same-origin XSS injection. | `src/core/token-manager.ts` `handleBroadcast` | `test/security/07-broadcast-injection.test.ts` (6 malformed payload variants → all rejected silently) |
| D13 | **Settings + Profile 409 patch surface (v1.0.1)**: on optimistic-lock conflict, SDK emits `sync.conflict` event with `{pendingPatch, serverState, version}` instead of silently dropping. Consumer rebases via `applySettingsPatch(patch)` / `applyProfilePatch(patch)` API. | `src/core/settings-sync.ts`, `src/profile/profile-store.ts` | `test/unit/core/settings-sync-conflict.test.ts`, `test/unit/profile/profile-store-conflict.test.ts` |
| D14 | **`device.key_mismatch` audit event (v1.0.1)**: on AES-GCM auth-tag failure (legitimate UA rotation, partial corruption, etc.), SDK emits an event before clearing the row — preserves audit trail of legitimate vs tampering decrypts. | `src/core/storage.ts` `getRefreshToken` decrypt-failure path | `test/security/04-idb-tamper.test.ts` (extended) |
| D7 | **No raw `===` on tokens in SDK source** (defense-in-depth; primary timing defense is BFF-side constant-time compare) | Source convention — SDK passes tokens straight to fetch headers; server is the only place secrets are compared | `test/security/02-timing-attack-resistance` — 2 source-grep heuristics: (a) no `(refresh\|access)Token === [identifier]` patterns in `token-manager.ts` or `client.ts`; (b) no `console.<level>(...token...)` in those files or `storage.ts` |
| D8 | **Input fuzzing**: `validateEmail` + `validatePhone` never throw on adversarial inputs (XSS, CRLF, RTL override, length overflow, etc.) | `src/profile/validators.ts` | `test/security/01-fuzz-code-validation` (200 random strings via fast-check + 8 hand-picked attack vectors) |
| D9 | **`npm publish --provenance`** (SLSA Level 3 attestation) | `scripts/release.ts` | (CI-only, runs on tag push via `.github/workflows/release.yml`) |

---

## 3. Known limitations (spec §15.2)

These are **documented gaps** intentionally accepted for v1.0:

| # | Limitation | Mitigation today | Phase 2 plan |
|---|---|---|---|
| L1 | **Device ID is SHA-256(User-Agent)** — used only for telemetry / event correlation since v1.0.1 (NO LONGER feeds at-rest key derivation). Not cryptographic binding. | Short refresh window (90 day TTL with 30s pre-expire refresh) + family revocation + server-side anomaly detection. v1.0.1 added: random non-extractable AES key for storage encryption (eliminates the UA-log-+-IDB-copy attack chain entirely). | DPoP (RFC 9449) Phase 2 — sender-constrains the refresh token itself (proof-of-possession on every refresh) |
| L2 | **PIN is deprecated** in favor of code-first | SDK does not offer PIN flow. Legacy `pin_hash` column remains for read compatibility during 30-day CalExp5 PIN-transition window. | Drop PIN entirely after CalExp5 cutover (Block 7 Day 27 + 30 days). |
| L3 | **No device attestation** (App Attest / Play Integrity) | Out of scope at current company size (~16 employees, ~30 customers). | Re-evaluate at >100 customers or first agent-mediated transaction class. |
| L4 | **SSE push for revocation deferred** — Phase 1 polls every 60s while tab is visible | `src/core/session-watcher.ts` polls `/auth/v1/me` every 60s while `document.visibilityState === 'visible'`; admin-forced revocation propagates within ~60s | SSE channel Phase 2 (eliminates 60s polling, gives sub-second revocation). |

---

## 3.5 Coverage push tests added in v1.0.0-rc.4 (2026-04-30)

A5 audit gate #1 ("90%+ coverage") closure. New tests added in this push that
exercise threat-model defenses:

| Test file | Threat # | What it verifies |
|---|---|---|
| `test/unit/core/session-watcher-branches.test.ts` | T8 / L4 | Visibility-gated polling, ETag handling, all 3 revocation-error paths (`AuthSessionRevoked`, `AuthSessionExpired`, generic `AuthSdkError` with revocation code) — admin-forced revocation propagates within ~1 poll interval |
| `test/unit/offline/sw-bridge-branches.test.ts` | T8 | Service-worker bridge: SW message dispatch, listener isolation (one throwing listener doesn't break others), idempotent registration. Audit-event durability across SW termination. |
| `test/unit/imperative/getAuth-session-change.test.ts` | T7 | Imperative `onSessionChange` adapter: throwing-listener isolation. Sign-out / sign-in transitions surface a snapshot, not the raw token. |
| `test/unit/core/event-reporter-flush.test.ts` | T8 | Audit-event durability: 5xx + network errors keep rows for retry; UNKNOWN_EVENT_TYPE / APP_NOT_REGISTERED drop permanently (no infinite retry); 401 is NOT permanent. `active_persona` stamping (D8). Concurrent `flushNow()` coalescing. |

Aggregate coverage delta: 90.91% → 92.57% lines, 85.40% → 86.87% branches.
Per-file: `getAuth.ts`, `sw-bridge.ts` 100%; `session-watcher.ts` 98.92%;
`event-reporter.ts` 97.20%.

---

## 4. How this doc stays honest

- **CI gate**: `pnpm test:security` runs the 18-test security suite on every PR. If any defense regresses, the PR fails.
- **Coverage gate**: `vitest.config.ts` thresholds (90/85/90/90) ensure security helpers don't drift to untested.
- **Yearly review**: scheduled re-read against spec §15 every Q1 + after each major version bump.

**If you change a code path cited above** in column 3, **update both the threat-model row AND the test** in the same PR. The PR template includes a checkbox.

---

## 5. Sign-off

- [ ] Security reviewer (Sam Jonaidi or delegate): **pending**
- [ ] Legal / Privacy reviewer (TBD): **pending**

Both signatures required for `1.0.0` GA tag (per A6 audit gate #13). RC publish (`1.0.0-rc.1`) does not strictly require sign-off; this doc serves as the basis for the conversation.
