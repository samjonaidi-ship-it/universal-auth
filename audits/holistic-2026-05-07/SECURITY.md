# Security Critical Assessment | 2026-05-07 (post-P1)

**Subject:** `@samjonaidi-ship-it/universal-auth@1.1.0-rc.2`
**Auditor:** Security agent (read-only)
**Scope:** SDK source under `src/`, focused on P0/P1 deltas vs. `audits/holistic-2026-05-06/SECURITY.md`.

## Score: 8.7 / 10  (pre-P1: 7.6 / 10)

The rc.2 build closes 5 of 9 H/M findings outright (H1 ath, M1 cnf.jkt, M2 entitlements MAC, M3 device-id pinning, M5 WebAuthn UV) and meaningfully tightens a sixth (M4 → bumped to "fixed in production mode"). The remaining standing risks are exactly the ones the previous audit identified as *deferred* (H2 DPoP soft-fallback, H3 same-origin XSS oracle, M6 Idempotency-Key truncation). The new code introduces no new Critical/High findings; one new Low (NL1) is documented around the entitlements verify-after-adopt window. Overall the SDK now sits comfortably in the top-quartile of browser auth libraries by defensive engineering.

## Risk summary

| Severity | Pre-P1 | Post-P1 | Δ |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High     | 3 | 2 | -1 (H1 closed) |
| Medium   | 6 | 2 | -4 (M1, M2, M3, M5 closed; M4 closed in prod mode) |
| Low      | 5 | 6 | +1 (NL1 verify-window) |

---

## Pre-P1 findings status

| ID | Title | Status | Evidence |
|---|---|---|---|
| H1 | DPoP `ath` claim missing | **CLOSED** | `src/core/dpop/proof.ts:69-75, 83`; ath = base64url(SHA-256(accessToken)); test coverage `test/unit/core/dpop/proof.test.ts:81-129` (presence, value, omission on undefined, omission on empty string) |
| H2 | `useDpop:'auto'` silent downgrade | **OPEN (deferred)** | `src/core/client.ts:234-273`; soft-fallback path emits `dpop.fallback_used` + routes through `reportSoftError`. Pre-P1 audit staged this as P1-L (server-side enforcement). No client-side change in rc.2. |
| H3 | Same-origin XSS oracle | **OPEN (deferred long-term)** | `src/core/storage.ts:313-351` — refresh token decryptable via SDK closure; `src/core/dpop/keypair.ts:73-77` — signing key reachable. P1 added Trusted-Types-grade defenses (HMAC, UV, etc.) but in-page XSS still gets full session compromise. Iframe-sandbox remains the long-term remediation. |
| M1 | `cnf.jkt` verify after refresh | **CLOSED** | `src/core/token-manager.ts:312-333, 412-440` — `verifyAccessTokenJktBinding()` decodes JWT payload, compares `cnf.jkt` to local `jwkThumbprint(localJwk)`, returns `'mismatch'` → clearSession + throw `CNF_JKT_MISMATCH`. Fail-safe to `'unbound'` on parse error. |
| M2 | Entitlements unencrypted in localStorage | **CLOSED** | `src/core/entitlements.ts:91-104, 119-178, 202-232` — HMAC-SHA-256 envelope `{ data, sig }`; non-extractable key in IDB store `STORE_HMAC_KEY` (`storage.ts:213-246`); async verify clears cache on mismatch. Legacy unsigned blobs accepted ONCE then re-signed. |
| M3 | Device-id localStorage cache | **CLOSED (Path A)** | `src/core/device-id.ts:39-72` — localStorage cache removed; SHA-256(UA) recomputed each page load with in-memory tab cache. No on-disk surface for XSS to pin. |
| M4 | `apiBaseUrl` not validated | **CLOSED in production mode** | `src/config.ts:180-219` — `assertApiBaseUrlSafety()` requires `https:` + same-eTLD+1 (naive endsWith) when `mode === 'production'`. Wired into `initUniversalAuth` at `config.ts:276`. Skipped in dev/test/e2e (intentional). |
| M5 | WebAuthn UV not enforced client | **CLOSED** | `src/flows/passkey-flow.ts:61-105, 142-143, 226-251` — pre-call: `assertUvNotDiscouraged()` rejects `userVerification:'discouraged'` for both register + authenticate; post-call (authenticate only): `authenticatorPerformedUv()` parses `authenticatorData[32]` UV bit (`& 0x04`), refuses to submit when policy demanded UV but bit unset. Registration post-call skipped (CBOR-attestationObject parsing too heavy for the lazy chunk; server still validates). |
| M6 | 64-bit Idempotency-Key truncation | **OPEN (deferred low-priority)** | `src/core/client.ts:419, 467-474` — still `hex.slice(0,16)`. Audit-rec was 5 minutes; not picked up in P1. |
| L1 | console.warn in token-manager | **CLOSED** | `src/core/token-manager.ts:32, 354-355, 459-462` — both `LEGACY_REFRESH_RESPONSE` and `NO_NAVIGATOR_LOCKS` route through `reportSoftError(err)`. Same in `client.ts:268-272` for `DPOP_FALLBACK`. |
| L2 | Enrollment fragment in Referer | OPEN | No P1 work on `enroll-flow.ts`; documentation update was the rec. |
| L3 | SSE no auth header | OPEN | WebPlatform constraint; unchanged. |
| L4 | `inferDecryptFailureReason` dead branch | OPEN | `src/core/storage.ts:353-361` still both-paths-return `aes_gcm_auth_tag_failed`. |
| L5 | SW SRI/provenance pinning | OPEN | Optional. |

---

## New findings (P1-introduced)

### NL1. Entitlements signature verified AFTER sync hot-path adopts the data — bounded one-tab-session exposure window

**File/line:** `src/core/entitlements.ts:119-154, 162-178, 255-271`
**Vector:** `loadFromDisk()` (sync) returns the cached `parsed.data` immediately when the on-disk envelope shape is structurally valid, then kicks off `verifyDiskSignatureAsync()` via `void`. Between the moment `loadFromDisk()` returns and the moment the async verifier's `clearDisk()` runs, every call to `hasFeature()` / `hasAppAccess()` / `getEntitlementsSnapshot()` (entitlements.ts:255-290) reads tampered data. In typical flow (HMAC compute = ~1 ms), this window is sub-frame; under main-thread starvation (long task, paused tab) it can extend. In-page reads during this window are by definition same-origin, so the practical exposure is: a tampered blob is *displayed* in UI affordances for one tab session before being cleared on the next page load (or sooner, when `verifyDiskSignatureAsync` resolves).
**Impact:** UI-level affordance spoofing (e.g., admin-menu shown for one session). Server-side enforcement is still the gate for *actions* — this only affects UI render decisions. Same blast radius as the original M2 finding, just with an upper bound.
**Remediation:** Two options, both low-impact:
  (a) **Block-then-adopt:** make `loadFromDisk()` return null until verify completes; consumers see a brief "loading" state. ~5 LOC change but flips the SWR contract.
  (b) **Document the window:** add a comment + a `entitlements.tamper_detected` event (not just `clearDisk`) so consumers can take corrective action. ~10 LOC.
The current design intentionally chose (a)-equivalent latency over (a)-equivalent strictness; this is a reasonable tradeoff and the residual risk is genuinely Low. Flag for INTEGRATION_GUIDE.

### NL2. `assertApiBaseUrlSafety` registrable-domain check is correctly look-alike-resistant — no finding

**Re-derivation per the brief:**
- Input: `apiBaseUrl='https://notbuildwithbainbridge.com'`, `cookieDomain='.buildwithbainbridge.com'`.
- `cookieHost = 'buildwithbainbridge.com'` (leading dot stripped at `config.ts:205`).
- Branch 1: `apiHost === cookieHost` → `'notbuildwithbainbridge.com' === 'buildwithbainbridge.com'` → **false**.
- Branch 2: `apiHost.endsWith(`.${cookieHost}`)` → `'notbuildwithbainbridge.com'.endsWith('.buildwithbainbridge.com')` → **false** (the literal `.` prefix is the safety: a look-alike host has no preceding dot).
- Branch 3: `cookieHost.endsWith(`.${apiHost}`)` → `'buildwithbainbridge.com'.endsWith('.notbuildwithbainbridge.com')` → **false**.
- All three false → throws. **CORRECT.**
The same look-alike-resistance is preserved in `assertModeSafety()` (`config.ts:147-148`). Both checks pass the security-relevant edge case.

### NL3. HMAC entitlements wire-format canonicalization — minor caveat

**File/line:** `src/core/entitlements.ts:180-191`
**Vector:** `computeSignature()` builds the stable JSON via a fresh literal `{ features, app_access, fetched_at, identity_id }` — V8/SpiderMonkey preserve insertion order for non-numeric keys, so this *is* deterministic across modern browsers. However, `JSON.stringify` of `readonly string[]` arrays preserves element order, which matches the server's response order. **No finding** — verified correct, but flag if the server ever sorts arrays differently between calls (would cause spurious tamper-clears on legitimate refreshes).

### NL4. `error-hook.ts` PII-leak audit — clean

**File/line:** `src/core/error-hook.ts:40-57` and the three call sites.
**Reviewed:**
- `client.ts:268-272` `DPOP_FALLBACK`: error message includes path + method + cause; no token material.
- `token-manager.ts:354` `LEGACY_REFRESH_RESPONSE`: literal text only.
- `token-manager.ts:460-462` `NO_NAVIGATOR_LOCKS`: literal text only.
None of the three soft-error payloads carry access tokens, refresh tokens, or PII. Consumer hook is wrapped in try/catch (`error-hook.ts:42-53`); a buggy `onError` cannot break SDK control flow — the inner-throw fallback path emits a meta-warning + falls through to `console.warn`. **CLEAN.**

### NL5. DPoP `ath` base64url encoding — RFC 4648 §5 conformant

**File/line:** `src/core/dpop/thumbprint.ts:53-61` (re-exported helper used by `proof.ts:74`).
**Verified:** `+/=` → `-_` + strip padding. ✓.

### NL6. `authenticatorPerformedUv()` short-input handling — fail-closed

**File/line:** `src/flows/passkey-flow.ts:92-105`
**Edge cases verified:**
- `bin.length < 33` → returns `false` (fail-closed → reject submission). ✓
- Missing UV bit (UV=0, UP could be 0 or 1): returns `false` → reject. ✓
- UV=1 + UP=0 (spec violation by authenticator but flag-pattern technically possible): UV bit alone (`& 0x04`) returns `true` → would proceed. Per W3C WebAuthn L3 §5.2.1, an authenticator setting UV without UP is non-conformant; the SDK's check is liberal here but the server-side library (`@simplewebauthn/server`) re-validates both. Acceptable.
- Malformed base64url: `atob` throws → bubbles up via the call site at `passkey-flow.ts:245` which is inside the post-call guard but NOT wrapped in try/catch. A malformed `authenticatorData` from a buggy authenticator would propagate as a generic exception rather than a structured `passkey.uv_required_but_missing` event. Minor — flag for L-tier remediation.

---

## Standards compliance matrix (P0+P1-affected sections only)

| Standard | Section | Pre-P1 | Post-P1 | New evidence |
|---|---|---|---|---|
| RFC 9449 | §4.2 `ath` claim | ✗ | **✓** | `src/core/dpop/proof.ts:69-75, 83`; tests `proof.test.ts:81-129` |
| RFC 9449 | §6.1 `cnf.jkt` round-trip verify | PARTIAL | **✓** | `token-manager.ts:312-333, 412-440` |
| RFC 7638 | §3.2 thumbprint canonicalization | ✓ | ✓ | unchanged |
| RFC 4648 | §5 base64url no-padding | ✓ | ✓ | `thumbprint.ts:53-61` |
| OAuth 2.1 | refresh-binding to client | PARTIAL | **✓** | `cnf.jkt` verify closes the loop |
| W3C WebAuthn L3 | UV required (pre-call + post-call) | ✗ | **✓** (auth) / partial (register) | `passkey-flow.ts:61-75, 92-105, 226-251` — register skips post-call CBOR parse intentionally |
| NIST SP 800-63B | AAL2 UV enforcement client-side | PARTIAL | **✓** | UV downgrade rejected at SDK boundary |
| OWASP ASVS V8.2.1 | data classification at-rest | PARTIAL | **✓** (MAC'd) | entitlements HMAC envelope (`entitlements.ts:91-104, 162-178`) |
| OWASP ASVS V6.2.6 | non-extractable keys | ✓ | ✓ + new HMAC key | `storage.ts:225-229` `extractable=false`, `usages: ['sign','verify']` |
| OWASP ASVS V13.2.4 (Trusted Types) | XSS-tamperable LS | PARTIAL | **+** | M3 + M2 close two LS oracles; H3 underlying still open |
| OWASP Top 10 A02 | crypto failures | ✓ | ✓ | new HMAC pathway uses `crypto.subtle.sign('HMAC', …)` correctly |
| Spec-internal | `apiBaseUrl` config validation | ✗ | **✓ (prod)** | `config.ts:180-219, 276` |

**No regressions** detected.

### CHANGELOG accuracy spot-checks

- "DPoP ath = base64url(SHA-256(accessToken))" → confirmed at `proof.ts:71-75`. ✓
- "HMAC-SHA-256 key in IDB; DB version 3 → 4 with auto-migration" → confirmed at `storage.ts:51, 109-111, 213-246`. ✓
- "Pre-call guard refuses `userVerification:'discouraged'`; post-call parses authenticatorData[32]" → confirmed at `passkey-flow.ts:61-75, 92-105`. ✓
- "P1-G `cnf.jkt` mismatch → clearSession + throw `CNF_JKT_MISMATCH`" → confirmed at `token-manager.ts:323-333`. ✓

All four spot-checks pass.

---

## Strengths added in P1

1. **Sender-binding is now token-bound.** `ath` claim closes the gap between "client-key bound" and "token+key bound" per RFC 9449 §4.2.
2. **Refresh integrity check.** `cnf.jkt` round-trip verify catches BFF mis-config one round-trip earlier than waiting for a server-side proof failure.
3. **Tamper-detection on persisted entitlements.** Non-extractable HMAC-SHA-256 key in IDB; algorithm-locked separately from the AES master key — clean key-hygiene per W3C SubtleCrypto. Async verify-after-adopt is a defensible latency tradeoff.
4. **WebAuthn AAL2 enforced at SDK boundary.** UV downgrade attacks blocked at register + authenticate; post-call bit inspection rejects compliant-but-disrespectful authenticators.
5. **Production cookie-leak guardrail.** `assertApiBaseUrlSafety` refuses to start the SDK if a misconfigured (or supply-chain-tampered) `apiBaseUrl` would ship cookies to a foreign host via SSE `withCredentials` or `credentials:'include'`.
6. **Device-id no longer XSS-pinnable.** Path A (recompute every boot) is the cheaper and stricter of the two audit-recommended options.
7. **Centralized soft-error reporting.** `reportSoftError` wraps consumer hook in try/catch — Sentry/LogRocket/Datadog can finally observe DPoP fallbacks, navigator.locks gaps, legacy server responses without reaching for `console.warn` interception.

---

## Recommended actions

| # | Action | Severity | Effort |
|---|---|---|---|
| 1 | Flip `useDpop` default to `'always'` once server enforcement opens; alert on `dpop.fallback_used` rate | H2 | 2 hr |
| 2 | INTEGRATION_GUIDE: document Trusted Types + strict CSP requirement; emit warn at init when TT not enforced; long-term: cross-origin iframe sandbox for signing | H3 | 2 hr now / 2-3 days long-term |
| 3 | Use full SHA-256 hex for refresh `Idempotency-Key` (`client.ts:473`) | M6 | 5 min |
| 4 | Document the entitlements verify-after-adopt window in INTEGRATION_GUIDE; consider emitting `entitlements.tamper_detected` event | NL1 | 30 min |
| 5 | Wrap `authenticatorPerformedUv()` parse in try/catch, emit `passkey.uv_parse_failed` on malformed input | NL6 | 15 min |
| 6 | Restore distinct `key_handle_missing` reason in `inferDecryptFailureReason` (or simplify the union type) | L4 | 15 min |
| 7 | Document caller ordering re: enrollment token strip | L2 | 15 min |
| 8 | Optional: SW-hash pinning config field for high-assurance consumers | L5 | 4 hr |

**Total recommended remediation:** ~5 engineering hours (excluding L5 optional and H3 long-term iframe sandbox).

---

*Audit performed read-only against `src/` v1.1.0-rc.2 (2026-05-07). No source modified. All findings cite `file:line`.*
