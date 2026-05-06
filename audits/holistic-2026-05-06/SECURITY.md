# Security Critical Assessment | 2026-05-06
**Subject:** `@samjonaidi-ship-it/universal-auth@1.1.0-rc.1`
**Auditor:** Security agent (read-only)
**Scope:** SDK source under `src/`, build/verify scripts, threat docs, package manifest. Server-side enforcement out of scope.

## Score: 7.6 / 10

The SDK demonstrates an uncommonly high standard of defensive engineering: hand-rolled DPoP with non-extractable WebCrypto keys, AES-256-GCM at rest with `extractable=false` master keys, an in-memory-only access token, multi-tab refresh coalescing via `navigator.locks` + Web Locks, hardened `fetch` defaults (`redirect: 'manual'`, `referrerPolicy: 'strict-origin-when-cross-origin'`), and CI gates banning `eval`/`Function`/forbidden deps. The DPoP implementation is largely RFC-9449 conformant. The principal weaknesses are (1) several **PARTIAL** RFC 9449 clauses (no `ath` claim, no `iat`-window enforcement, no `jti` cache against replay of *own* proofs, jkt thumbprint not surfaced for refresh/cnf binding), (2) a documented but real same-origin XSS oracle (T3a in THREAT_MODEL.md), (3) entitlements written to `localStorage` unencrypted, (4) device-id cached unencrypted in localStorage including a UA-derived value an attacker can pin, and (5) `useDpop:'auto'` soft-fallback opens a downgrade attack surface during the rollout window.

## Risk summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 3 |
| Medium | 6 |
| Low | 5 |

## Standards compliance matrix

| Standard | Section | Compliance | Evidence |
|---|---|---|---|
| RFC 9449 | §4.2 proof header (`typ=dpop+jwt`, `alg`, `jwk`) | ✓ | `src/core/dpop/proof.ts:60` |
| RFC 9449 | §4.2 payload (`jti`, `htm`, `htu`, `iat`) | ✓ | `src/core/dpop/proof.ts:61–67` |
| RFC 9449 | §4.2 `ath` claim (access-token hash binding) | ✗ | `src/core/dpop/proof.ts:25–31` (`accessToken` accepted but explicitly NOT placed in payload) |
| RFC 9449 | §4.3 ES256 signature over `b64url(hdr).b64url(pl)` | ✓ | `src/core/dpop/proof.ts:71–80` |
| RFC 9449 | §6.1 sender-binding on refresh (`cnf.jkt`) | PARTIAL | DPoP attached to `/session/refresh` (`src/core/client.ts:91–98`); no client-side validation that server bound `cnf.jkt` to the issued access token. SDK has `jwkThumbprint` (`src/core/dpop/thumbprint.ts:32`) but never compares it. |
| RFC 9449 | §7.1 Authorization scheme `DPoP` | ✓ | `src/core/client.ts:251` |
| RFC 9449 | §8 nonce challenge handling | ✓ | `src/core/client.ts:325–344`, `src/core/dpop/nonce-cache.ts:19–32` (single-use, last-write-wins) |
| RFC 9449 | §11.1 nonce single-use semantics | ✓ | `src/core/dpop/nonce-cache.ts:27–32` (read+delete) |
| RFC 9449 | §11.2 `jti` uniqueness window (client-side dedupe) | PARTIAL | `nanoid()` (`proof.ts:62`) makes collision astronomically unlikely, but no replay cache exists if proof is captured & re-posted before the server-side `iat` window closes. Client-side defense unnecessary if server enforces; not stated. |
| RFC 9449 | §11.2 `iat` freshness | ✗ | No `iat` skew enforcement client-side; trusts `Date.now()` (`proof.ts:65`). Server-side dependency. |
| RFC 9449 | §11 `htu`/`htm` exact match | ✓ | `proof.ts:63–64` uses request URL/method directly; no normalization that could drift. |
| RFC 7638 | §3.2 thumbprint canonical JSON `{crv,kty,x,y}` lex order | ✓ | `src/core/dpop/thumbprint.ts:46` |
| RFC 7638 | §3 SHA-256 + base64url | ✓ | `thumbprint.ts:48–49` |
| RFC 7515 | §3.1 JWS Compact Serialization | ✓ | `proof.ts:82` |
| RFC 7515 | §3.4 ECDSA signature is raw r‖s (not DER) | ✓ | `proof.ts:73–80` (correctly uses WebCrypto raw output) |
| RFC 7517 | JWK shape | ✓ | `proof.ts:58` exports via WebCrypto |
| RFC 7518 | §3.4 ES256 = P-256 + SHA-256 | ✓ | `src/core/dpop/keypair.ts:31` |
| OAuth 2.1 | refresh-token rotation | ✓ (passive) | `src/core/token-manager.ts:338–348` accepts rotated `refresh_token`; server controls rotation. |
| OAuth 2.1 | refresh-binding to client | PARTIAL | DPoP attached, but no `cnf.jkt` round-trip verification client-side. |
| OAuth 2.1 | redirect_uri/state/PKCE | N/A | Code-flow uses OTP not authorization-code; passkey flow uses WebAuthn (no redirect). |
| W3C WebAuthn L3 | UV (User Verification) required | ✗ NOT VERIFIED CLIENT | `src/flows/passkey-flow.ts:62–69, 122–134` — relies on server-supplied `optionsJSON.userVerification`; SDK does not enforce `userVerification: 'required'`. Defers to BFF. |
| W3C WebAuthn L3 | §5.1.7 Conditional UI | ✓ | `passkey-flow.ts:33–36, 132–134` (`useBrowserAutofill`) |
| W3C WebAuthn L3 | RP ID binding to origin | ✓ | `passkey-flow.ts` does not pass custom `rpId`; browser uses page origin (THREAT_MODEL T4). |
| NIST SP 800-63B | AAL2 multi-factor (passkey UV) | PARTIAL | Server-controlled UV requirement; SDK does not validate `flags.uv` on returned assertion. |
| OWASP ASVS V2.1 | password storage | N/A | No password flow exists. |
| OWASP ASVS V2.10 | OAuth/OIDC | ✓ | DPoP + bearer + rotation. |
| OWASP ASVS V3.4.1 | tokens never in localStorage | ✓ | `token-manager.ts:75–80` (RAM only); `storage.ts:5` comment + IDB-only refresh path; no `localStorage`/`sessionStorage` matches for tokens (Grep result on src). |
| OWASP ASVS V3.4.3 | CSRF via SameSite + state | PARTIAL | `credentials: 'include'` (`client.ts:278`); relies on server SameSite; no Origin check client-side. `Idempotency-Key` per mutation (`client.ts:209–211`). |
| OWASP ASVS V6.2.5 | strong crypto for sensitive at-rest | ✓ | AES-256-GCM via WebCrypto (`storage-crypto.ts:32–47`) |
| OWASP ASVS V6.2.6 | non-extractable keys | ✓ | `storage.ts:156` and `dpop/keypair.ts:41` (both `extractable=false`) |
| OWASP ASVS V8.2.1 | data classification + protection | PARTIAL | Refresh token encrypted; entitlements unencrypted in localStorage (`entitlements.ts:101`). Acceptable per code comment, but extends attack surface. |
| OWASP Top 10 2021 A02 Cryptographic Failures | random IV per encryption | ✓ | `storage-crypto.ts:42` (12-byte random IV per call) |
| OWASP Top 10 2021 A03 Injection | input validation | ✓ | `validators.ts` + fuzz tests cited in THREAT_MODEL D8 |
| W3C Trusted Types | no `innerHTML`/`document.write`/`eval`/`Function()` | ✓ | Grep `eval\(|new Function|innerHTML|outerHTML|document\.write` returned **No matches**. CI gate: `scripts/verify-bundle.ts:35–60`. |
| W3C SubtleCrypto | use `crypto.subtle` only | ✓ | All crypto via `crypto.subtle.*` (Grep result above) |

---

## Findings — Critical
*(none)*

---

## Findings — High

### H1. DPoP `ath` claim missing — RFC 9449 §4.2 sender-binding gap
**File/line:** `src/core/dpop/proof.ts:25–34, 60–67`
**Vector:** Per RFC 9449 §4.2, when a DPoP proof accompanies an access token, the proof SHOULD include an `ath` claim = `base64url(SHA-256(access_token))`. The proof here accepts `accessToken` as input and explicitly comments "not yet placed in the payload." Without `ath`, a passive observer (cross-site referrer leak, server log breach, in-memory dump) who captures a DPoP proof JWS can pair it with a *different* access token from the same client key — only `htu`/`htm`/`jti`/`iat` are bound, not the token itself. Server-side defense exists per the spec but cannot recover from a leaked unbound proof.
**Impact:** Reduces sender-constrained credential property to "client-key-bound" but not "token-bound." Token+proof reuse window equals server's `iat` skew window.
**Remediation:** Add `ath` claim. ~10 LOC. Compute via `crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))` then base64url-encode. Effort: 1 hour incl. tests.

### H2. DPoP soft-fallback enables silent downgrade — `useDpop:'auto'`
**File/line:** `src/core/client.ts:233–272`, `src/config.ts:88–90, 99–101`
**Vector:** With `useDpop:'auto'` (the default), any thrown error in DPoP proof construction (incl. WebCrypto / IDB transient errors) silently downgrades to plain `Authorization: Bearer <token>` and emits `dpop.fallback_used`. An attacker who can induce errors (IDB pressure, partial site-data clear, throttling WebCrypto via long-running tasks, or in-page XSS that throws inside `getOrCreateKeypair`) can force every authenticated request to drop sender-binding. The server is presumably configured to accept Bearer during the rollout window (no enforcement gate cited), so the attacker degrades all subsequent traffic to a stealable bearer token.
**Impact:** Defeats the entire point of DPoP for the duration of the rollout window. Telemetry catches it after-the-fact.
**Remediation:** Once the server-side DPoP enforcement window opens, flip default to `'always'`. Until then, alert-on-rate `dpop.fallback_used`. Add a kill-switch that flips the SDK to `'always'` if the per-tab fallback rate exceeds N/min. Effort: 2 hours config + alerting.

### H3. Same-origin XSS decryption oracle (acknowledged residual risk)
**File/line:** `src/core/storage.ts:267–280`, `src/core/token-manager.ts:265–283`, `docs/THREAT_MODEL.md:25` (T3a explicitly acknowledged)
**Vector:** Non-extractable AES key + DPoP non-extractable signing key prevent raw-key exfil, but an XSS payload in the consuming app's origin can call `getRefreshToken()` (via the SDK's own closure) to obtain a *decrypted plaintext refresh token*, or call `getAccessToken()` to obtain a live bearer. The DPoP signing key is non-extractable, so the attacker cannot move the credential off-device — but they can call `crypto.subtle.sign` against it for any DPoP proof they want as long as they control the page. Effectively: same-origin XSS = full session compromise for the lifetime the page is open, plus the ability to forge DPoP proofs on the existing keypair.
**Impact:** Bog-standard browser-SDK residual risk; documented. The DPoP non-extractable property does **not** protect against in-page attackers.
**Remediation:** Push consumer apps to enforce `Trusted Types` + strict CSP via INTEGRATION_GUIDE. Consider adding a Trusted-Types policy assertion in `initUniversalAuth` (warn-only) when `document.featurePolicy` shows TT not enforced. Long-term: move signing into a dedicated cross-origin iframe so XSS in the host page can postMessage but not directly invoke `crypto.subtle.sign`. Effort: warning = 2 hours; iframe sandbox = 2-3 days.

---

## Findings — Medium

### M1. No `jkt` thumbprint verification client-side after refresh
**File/line:** `src/core/dpop/thumbprint.ts:32` (defined), `src/core/token-manager.ts:309–358` (refresh path uses but doesn't call thumbprint)
**Vector:** RFC 9449 §6.1: the access token returned from refresh carries `cnf.jkt` = SHA-256 thumbprint of the public JWK. The SDK never decodes the access token to verify `jkt` matches the local keypair's thumbprint. If the server (mis)issues an access token bound to a different key, the SDK won't notice until proof verification fails server-side on the next call.
**Impact:** Defense-in-depth gap. Catches BFF mis-configuration (e.g., key rotation drift) one round-trip earlier. Not exploitable.
**Remediation:** Decode the JWT (no signature verify needed — informational), compare `cnf.jkt` to `jwkThumbprint(localPublicJwk)`. Mismatch → emit + clearSession. Effort: 1 hour.

### M2. Entitlements persisted to localStorage unencrypted
**File/line:** `src/core/entitlements.ts:79–101, 243`
**Vector:** Entitlements (`features[]`, `app_access[]`, plan slug) live in plaintext under `bb-universal-auth:entitlements`. While not a token, this list reveals:
- Which features the user has paid for / been provisioned with (commercial intelligence)
- Which app modules are unlocked (attack-surface enumeration)
An XSS attacker can also *write* arbitrary entitlements to localStorage to client-side spoof admin features in the UI — server enforcement still applies, but the UI affordances open.
**Impact:** UI-level spoofing of feature flags pre-server-call; minor info disclosure. No bypass of server enforcement.
**Remediation:** (a) HMAC the cached blob with the master CryptoKey so tamper is detectable; or (b) encrypt as with refresh token. (a) is cheaper; effort: 2 hours.

### M3. Device-ID localStorage cache enables stable tracking + XSS-pinnable identity
**File/line:** `src/core/device-id.ts:21, 42–69`
**Vector:** Device ID is `SHA-256(navigator.userAgent).slice(0,32)` cached in localStorage as `bb-ua-device-id`. An XSS attacker can overwrite the value, causing future events / `X-Device-Id` headers to carry an attacker-chosen identifier — useful for pivoting log analysis or evading server-side anomaly detection that pivots on device ID. The SDK then trusts the cached value if `parsed.ua === ua` and shape matches (`device-id.ts:47`).
**Impact:** Telemetry poisoning + log evasion. THREAT_MODEL L1 already flags device-id as not cryptographic; SDK uses it for telemetry and as `X-Device-Id` header (`client.ts:227`).
**Remediation:** Either (a) move device-id to IDB under master-key MAC, or (b) compute from UA every boot (cheap — single SHA-256 of <1KB string). Effort: 1 hour for option (b).

### M4. SSE `EventSource` carries cookies cross-origin without Origin check
**File/line:** `src/core/session-events.ts:114`
**Vector:** `new EventSource(url, { withCredentials: true })`. The `apiBaseUrl` is consumer-supplied (`config.ts:94`) and the SDK never validates it (no allow-list, no `https:` enforcement). If a misconfigured consumer passes an attacker-controlled `apiBaseUrl`, the SDK will send the BFF cookies cross-origin via SSE. Combined with `cookieDomain` mode-safety (`config.ts:137–155`), production safety is partly enforced — but only when `mode !== 'production'`. In production mode there is **no `assertModeSafety`** check (`config.ts:142` early-returns).
**Impact:** Misconfiguration / supply-chain risk. A compromised consumer-app config can exfiltrate session cookies via SSE channel.
**Remediation:** Validate `apiBaseUrl` against an allow-list pattern at init or require `https:` + same-eTLD+1 as `cookieDomain`. Effort: 2 hours.

### M5. WebAuthn UV/UP not enforced client-side
**File/line:** `src/flows/passkey-flow.ts:62–69, 116–145`
**Vector:** SDK trusts server-issued `PublicKeyCredentialCreationOptionsJSON`/`PublicKeyCredentialRequestOptionsJSON` blob and forwards the assertion verbatim to `/verify`. It does not (a) require `userVerification: 'required'` on registration, (b) inspect `flags.uv === 1` on the returned assertion before submitting, or (c) reject downgrade attacks where the server suddenly sends `userVerification: 'discouraged'`. Per NIST SP 800-63B AAL2 + W3C WebAuthn L3, UV is the second factor in single-factor passkey AAL2 setups.
**Impact:** Reliance on BFF correctness for AAL2. A BFF bug or downgrade attack drops the SDK below AAL2 silently.
**Remediation:** Pass-through validation: refuse to call `startAuthentication`/`startRegistration` if `optionsJSON.userVerification === 'discouraged'` and abort post-assertion if `flags.uv` not set when policy demands. Effort: 2 hours + tests.

### M6. Refresh-token Idempotency-Key truncates SHA-256 to 64 bits
**File/line:** `src/core/client.ts:417, 465–472`
**Vector:** `Idempotency-Key` for `/session/refresh` = first 16 hex chars (64 bits) of `SHA-256(refresh_token)`. 64-bit collision is birthday-bounded (~2^32 entries before non-trivial collision risk). For the cross-tab dedupe use case the choice is fine, but the comment "preimage-resistant under SHA-256" is misleading — truncation to 64 bits weakens preimage resistance to 2^64. Server-side dedupe + 5-minute window makes practical exploitation impossible at current scale, but it's worth noting.
**Impact:** Negligible at current scale. If an attacker observes the dedupe key on a network they leak ~64 bits of refresh-token entropy.
**Remediation:** Use full SHA-256 hex (`hex` not `hex.slice(0,16)`). Server already accepts arbitrary-length keys. Effort: 5 minutes.

---

## Findings — Low

### L1. `console.warn` paths emit token-manager state on cold-path errors
**File/line:** `src/core/token-manager.ts:331–333, 392–396`
**Vector:** Warnings are bounded, no token material logged, but consumer apps with broken `console` overrides (Sentry, LogRocket) might capture surrounding context. Audited — no token strings present.
**Impact:** None observed; review pattern for future drift.
**Remediation:** Consider routing through `config.onError` instead of `console.warn`. Effort: 30 min.

### L2. Enrollment token fragment may briefly appear in `Referer` before strip
**File/line:** `src/flows/enroll-flow.ts:168–193`
**Vector:** `parseEnrollmentTokenFromUrl` calls `history.replaceState` after extracting the fragment, but any synchronous resource load (image, script, stylesheet) initiated by the page *before* the call still ships `Referer` with the fragment. URL fragments are typically not in `Referer`, but some old user agents leak.
**Impact:** Minor; mostly mitigated by `referrerPolicy: 'strict-origin-when-cross-origin'` (`client.ts:284`) and the fact that fragments are excluded from Referer per RFC 7231.
**Remediation:** Document caller ordering in INTEGRATION_GUIDE: parse before any `<img>` etc. mounts. Effort: 15 min docs.

### L3. SSE no auth header check — relies entirely on cookie
**File/line:** `src/core/session-events.ts:114`
**Vector:** `EventSource` API doesn't allow custom headers, so DPoP can't be applied to the SSE channel. The SDK has no choice; this is a WHATWG limitation. Server is therefore protected only by the session cookie + Origin check + same-site policy.
**Impact:** None — known WebPlatform constraint.
**Remediation:** Document. If higher assurance is needed, switch to fetch+ReadableStream chunked SSE (allows custom headers but needs polyfill).

### L4. `inferDecryptFailureReason` always returns `aes_gcm_auth_tag_failed` after the IV-shape fast path
**File/line:** `src/core/storage.ts:283–291`
**Vector:** The function is supposed to distinguish failure modes for the audit trail but the regex branch and the fallback both return `aes_gcm_auth_tag_failed` — `key_handle_missing` is never reachable from this function (it's checked earlier inline at `storage.ts:260–265`). Dead branch in the union type.
**Impact:** Audit-event taxonomy slightly less informative than designed.
**Remediation:** Clean up the union type or restore the branch. Effort: 15 min.

### L5. No Subresource Integrity/provenance check on the SW URL
**File/line:** `src/offline/sw-bridge.ts:32`
**Vector:** `navigator.serviceWorker.register('/bb-universal-auth-sw.js', { scope: '/' })`. SW registration is same-origin so MITM requires compromise of consumer origin already — but if consumer hosts the SW via CDN with TLS misconfiguration, an SW served with malicious purge patterns could clear caches arbitrarily. Mitigated by `isTrustedClient` on inbound messages (`sw/index.ts:82`).
**Impact:** Minimal; consumer-origin TLS is the trust anchor.
**Remediation:** Add a mandatory `expectedSwHash` config field for high-assurance consumers. Effort: 4 hours.

---

## Strengths

1. **Refresh + access token storage architecture is exemplary.** Access in RAM only (`token-manager.ts:75–80`); refresh AES-256-GCM encrypted under a non-extractable CryptoKey persisted as a structured-clone handle (`storage.ts:144–176`).
2. **DPoP keypair is non-extractable, persisted as IDB CryptoKey handle, deleted on signout.** `dpop/keypair.ts:41, 84–91`.
3. **Multi-tab refresh coalescing is correct.** Inner ring `state.inFlightRefresh` Promise mutex + outer ring `navigator.locks.request('bb-auth-refresh', {mode:'exclusive'})` with double-check inside the lock: `token-manager.ts:286–399`.
4. **Hardened fetch defaults.** `redirect: 'manual'` rejects all 3xx as `UNEXPECTED_REDIRECT`; `referrerPolicy: 'strict-origin-when-cross-origin'`: `client.ts:275–309`. Also applied on the offline reconciler replay path: `offline/reconciler.ts:100–115`.
5. **BroadcastChannel payload validation.** Length-bounded, type-checked before adopting peer-tab session state: `token-manager.ts:128–162`.
6. **Service-Worker `isTrustedClient` gate.** Rejects messages from cross-scope sources before purging caches: `sw/index.ts:82`, `sw/purge-helpers.ts:66–76`.
7. **CI supply-chain gates.** `scripts/verify-no-jose.ts:7` enforces a forbidden-prod-deps list (`jose`, `lodash`, `axios`, `zustand`, `moment`, `date-fns`); `scripts/verify-bundle.ts:35–60` rejects `eval()`, `new Function()`, inline `<script>` in built output. `package.json:68` ships `--provenance` on publish.
8. **No `eval`, no inline scripts, no `Function()` in source.** Grep confirmed zero matches across `src/`.
9. **Access tokens never reach `localStorage`/`sessionStorage`.** Grep confirmed only `device-id` and `entitlements` use localStorage; tokens are IDB-only.
10. **DPoP-Nonce challenge handling is correct per RFC 9449 §8.** Single-retry guard prevents infinite loop; nonce is consumed (read+delete) on use; body-shape check ensures stray `DPoP-Nonce` headers on unrelated 401s don't mis-trigger retry: `client.ts:325–344`, `nonce-cache.ts:27–32`.

---

## Recommended actions

| # | Action | Severity | Effort |
|---|---|---|---|
| 1 | Add `ath` claim to DPoP proof per RFC 9449 §4.2 | H1 | 1 hr |
| 2 | Once server enforcement opens, default `useDpop` to `'always'` + alert on `dpop.fallback_used` rate | H2 | 2 hr |
| 3 | Document XSS oracle in INTEGRATION_GUIDE; emit warn at init when Trusted Types not enforced | H3 | 2 hr |
| 4 | After refresh, verify `cnf.jkt` matches local thumbprint; emit + clearSession on mismatch | M1 | 1 hr |
| 5 | HMAC-tag (or encrypt) entitlements localStorage blob | M2 | 2 hr |
| 6 | Move device-id off localStorage to IDB+MAC, or recompute every boot | M3 | 1 hr |
| 7 | Validate `apiBaseUrl` (https + same-eTLD+1 vs `cookieDomain`) in production mode | M4 | 2 hr |
| 8 | Pre-flight reject `userVerification:'discouraged'` and assert `flags.uv` post-assertion | M5 | 2 hr |
| 9 | Use full SHA-256 hex for refresh `Idempotency-Key` | M6 | 5 min |
| 10 | Route token-manager warnings through `config.onError` | L1 | 30 min |
| 11 | Document caller ordering re: enrollment token strip | L2 | 15 min |
| 12 | Restore distinct `key_handle_missing` reason in `inferDecryptFailureReason` (or simplify type) | L4 | 15 min |
| 13 | Optional: SW-hash pinning config field for high-assurance consumers | L5 | 4 hr |

**Total recommended remediation:** ~18 engineering hours (excluding L5 optional and H3 long-term iframe sandbox).

---

*Audit performed read-only against `src/` v1.1.0-rc.1 (2026-05-06). No source modified. All findings cite `file:line`.*
