# Threat Model | `@bainbridgebuilders/universal-auth` | v1.0.0-rc.4 | 2026-04-30 | BB

This document maps every threat in spec §15.3 to (a) the SDK code path that defends against it, (b) the test that regresses the defense. Cross-walked with spec **`BB_UNIVERSAL_AUTH_SDK_SPEC.md v1.5.0`** §15.

A5 audit gate #10 closure. v1.0.0-rc.4 review verified every citation below resolves to a real source line + green test.

**Audience:** auditors, security-review reviewers, future maintainers debugging "did this defense survive a refactor?"

**Convention:** `src/<path>` = SDK source; `test/<kind>/<file>` = test that verifies the defense.

---

## 1. STRIDE matrix — spec §15.3

| # | Threat (spec wording) | SDK defense (code) | Test citation | Spec ref |
|---|---|---|---|---|
| T1 | **Credential stuffing** — attacker tries leaked password lists | Code-first flow only; no password field exists in SDK API surface | `test/security/01-fuzz-code-validation` (asserts no password parameter is accepted in any request); `test/integration/01-signup-refresh-revoke` (full flow has no password) | §15.3 + §3.1 |
| T2 | **Brute-force on code** — attacker tries all 1,000,000 6-digit codes | Code TTL 15 min + per-identity throttle + account lock after 5 failed verifies (server-side); SDK surfaces `AUTH_CODE_INVALID` / `AUTH_RATE_LIMITED` errors | `src/errors.ts` (`AuthCodeInvalid`, `AuthCodeExpired`, `AuthRateLimited` classes — typed throws on each code); `test/unit/errors.test.ts` (21 tests verifying each class instantiation + `errorFromEnvelope` mapping). **Lockout-after-5 path is server-side only — covered in CT BFF integration tests, not SDK side.** | §15.3 + §3.7 |
| T3 | **Token theft from IDB** — hostile script reads encrypted refresh token | AES-256-GCM encryption (`src/core/storage-crypto.ts`); device-bound key derived via PBKDF2-SHA256 from SHA-256(User-Agent); auth tag rejects tampered ciphertext | `src/core/crypto-client.ts` (worker-mode + fallback paths); `test/security/04-idb-tamper` (corrupt AES-GCM tag → `getAccessToken()` returns null gracefully); `test/security/03-token-storage` (scans IDB for plaintext) | §15.3 + §15.1 |
| T4 | **Phishing** — attacker spins up `bb-bainbridge-builders.com` and tricks user | `src/flows/passkey-flow.ts` uses WebAuthn — RP-ID is implicitly bound to the registering origin by the browser (the SDK does not pass a custom `rpId`, so the browser uses the page's effective domain). Code flow has per-email throttle + deliberate click-to-confirm in `<CodeEntry>` | `test/unit/flows/passkey-flow.test.ts` (full register + authenticate ceremony with `@simplewebauthn/browser` mocked); `test/browser/02-passkey-conditional-ui.spec.ts` (Chrome virtual authenticator via CDP). **The RP-ID binding is a browser invariant; we don't override it, so there's nothing SDK-side to test beyond "we don't pass a custom rpId" — verified by source inspection.** | §15.3 + §3.1 |
| T5 | **Magic-link pre-fetch (Safe Links)** — Outlook/Gmail pre-fetch the link, consuming the token | `src/flows/enroll-flow.ts` `verifyEnrollmentToken` POSTs (not GET); link URL itself carries the token in fragment + email pre-fill, but the SDK only validates via POST | `test/unit/flows/enroll-flow.test.ts` ("verifyEnrollmentToken uses POST (D3 — defeats Safe Links)") | §15.3 + §3.1bis |
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
| D5 | **Mode-safety assertion**: refuses to run `mode: 'development' \| 'test' \| 'e2e'` on `*.bainbridgebuilders.com` hostnames | `src/config.ts` `assertModeSafety()` | `test/unit/config.test.ts` (3 negative + 5 positive cases) |
| D6 | **Mutex-coalesced refresh**: 5 concurrent `refresh()` calls in different tabs → 1 network request via Shared Worker (BroadcastChannel fallback) | `src/core/token-manager.ts` Shared Worker primary path | `test/chaos/05-multi-tab-refresh-race` (2s latency injected, 5 concurrent calls complete < 10s) |
| D7 | **No raw `===` on tokens in SDK source** (defense-in-depth; primary timing defense is BFF-side constant-time compare) | Source convention — SDK passes tokens straight to fetch headers; server is the only place secrets are compared | `test/security/02-timing-attack-resistance` — 2 source-grep heuristics: (a) no `(refresh\|access)Token === [identifier]` patterns in `token-manager.ts` or `client.ts`; (b) no `console.<level>(...token...)` in those files or `storage.ts` |
| D8 | **Input fuzzing**: `validateEmail` + `validatePhone` never throw on adversarial inputs (XSS, CRLF, RTL override, length overflow, etc.) | `src/profile/validators.ts` | `test/security/01-fuzz-code-validation` (200 random strings via fast-check + 8 hand-picked attack vectors) |
| D9 | **`npm publish --provenance`** (SLSA Level 3 attestation) | `scripts/release.ts` | (CI-only, runs on tag push via `.github/workflows/release.yml`) |

---

## 3. Known limitations (spec §15.2)

These are **documented gaps** intentionally accepted for v1.0:

| # | Limitation | Mitigation today | Phase 2 plan |
|---|---|---|---|
| L1 | **Device ID is SHA-256(User-Agent)** — not cryptographic binding | Short refresh window (90 day TTL with 30s pre-expire refresh) + family revocation + server-side anomaly detection | DPoP (RFC 9449) Phase 2 — replaces SHA-256(UA) with proof-of-possession key |
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
