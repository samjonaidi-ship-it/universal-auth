# BB Universal Auth SDK — Industry Benchmark (2025–2026)

**Scope:** Compare BB SDK (`C:\Users\samjo\Desktop\BB_Universal_Auth\src\core\` + `src\flows\` + `src\sw\`) against current authoritative guidance.
**Method:** Every "industry standard" claim cites a URL; every "BB SDK does" claim cites file:line. Items I could not authoritatively source are marked **NO SOURCE FOUND**.
**Date:** 2026-04-30. **Spec read:** `BB_UNIVERSAL_AUTH_SDK_SPEC.md` §15, §16, App. B.

---

## 1. OAuth 2.0 / OIDC Client SDK Patterns

### 1.1 Token storage

| Claim | Detail |
|---|---|
| **Industry standard** | Access token in memory only; refresh token in HttpOnly cookie via BFF, OR (when SPA must hold it) in IDB encrypted with a non-extractable key. Auth0 SPA SDK default is in-memory + Web Worker. Local/sessionStorage explicitly rejected by OWASP WSTG. ([Auth0 Token Storage](https://auth0.com/docs/secure/security-guidance/data-security/token-storage), [OWASP WSTG OAuth Client](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/05.2-Testing_for_OAuth_Client_Weaknesses)) |
| **BB SDK does** | Access token in memory only (`token-manager.ts:56-61` — `state` object, never persisted). Refresh token in IndexedDB, AES-256-GCM, key derived per-device via PBKDF2 (`storage.ts:99-111`, `storage-crypto.ts:50-58`). |
| **Classification** | **Aligned** with the "SPA holds RT" branch of OWASP/Auth0 guidance. **Drift** vs. the emerging BFF-preferred posture (IETF browser-based-apps draft-13). |
| **Risk** | XSS still has a signing/decryption oracle inside the same origin. RT exfiltration via decrypt() call is feasible if attacker controls JS. The encryption only thwarts a *device-copy* attack (IDB exfil to another machine), not in-page XSS. Spec acknowledges this in §15.2. |

### 1.2 Refresh token rotation + reuse detection

| Claim | Detail |
|---|---|
| **Industry standard** | OAuth 2.1 / IETF browser-based-apps draft-13: refresh token rotation **MUST** be used or sender-constraining (DPoP/mTLS). Reuse → revoke entire family. Grace window (10–60s) recommended to avoid network-race false positives. ([IETF browser-based-apps](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/13/), [Auth0 RT rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation), [Okta refresh tokens](https://developer.okta.com/docs/guides/refresh-tokens/main/)) |
| **BB SDK does** | Client *accepts* a rotated RT if server returns one (`token-manager.ts:235-239`, optional `refresh_token` field). Reuse-detection logic is server-side (CT BFF) — client just clears state on refresh failure (`token-manager.ts:250-262`). No grace window, no family awareness, but client wouldn't need that — that's a server property. |
| **Classification** | **Aligned** (rotation supported when server rotates). Family revocation/grace are server concerns, not in scope for SDK. |
| **Risk** | Low — design is correct. If CT BFF doesn't actually implement reuse detection, that's a server gap not visible from client code. |

### 1.3 PKCE / Authorization Code / ROPC

| Claim | Detail |
|---|---|
| **Industry standard** | Authorization Code + PKCE for SPAs. ROPC deprecated. ([oauth.net browser-based-apps](https://oauth.net/2/browser-based-apps/)) |
| **BB SDK does** | Custom `/auth/v1/code` flow (BFF-issued opaque session tokens), not standard OAuth code+PKCE. Not an OAuth 2.0 client per se — talks to a private BFF (`client.ts:30-44`). |
| **Classification** | **Drift** in name (not OAuth-PKCE-shaped). **Aligned** in spirit (BFF holds upstream secrets, SPA gets opaque tokens). |
| **Risk** | Low — BFF pattern is itself the IETF-recommended "Token Mediating Backend" architecture (draft-13 §6). Document this clearly so reviewers don't expect PKCE artifacts. |

### 1.4 DPoP vs Bearer for refresh

| Claim | Detail |
|---|---|
| **Industry standard** | RFC 9449 DPoP recommended for public clients; sender-constraining refresh tokens removes them as bearer credentials. FAPI 2.0 names DPoP as one of two acceptable mechanisms. Browser implementation requires non-extractable ES256 key in IDB + nonce challenge handler. ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449.html), [WorkOS DPoP](https://workos.com/blog/dpop-rfc-9449-explained), [Auth0 DPoP](https://auth0.com/blog/protect-your-access-tokens-with-dpop/)) |
| **BB SDK does** | Bearer-only refresh today (`client.ts:230-241` POSTs `{refresh_token}` body with no DPoP proof). Spec §16.2 lists DPoP as Phase 2 deferred. Device ID is SHA-256(UA), explicitly *not* cryptographic binding (`device-id.ts:1-10`). |
| **Classification** | **Drift** vs. current BCP for public clients. Conscious deferral per spec. |
| **Risk** | If the BFF is compromised or RT is exfiltrated, attacker can mint access tokens. DPoP would block that. The "Oracle Attack" still defeats DPoP under XSS, but DPoP raises the bar significantly for stolen-token replay. ([InfoQ DPoP storage paradox](https://www.infoq.com/articles/dpop-key-storage-unsolved-problem/)) |

### 1.5 Multi-tab session sync

| Claim | Detail |
|---|---|
| **Industry standard** | Web Locks API (`navigator.locks`) is the 2025 preferred coalescing primitive — universal browser support, crash-safe auto-release, simple double-checked-lock pattern. SharedWorker has no Safari support. BroadcastChannel for *propagating* the new token after the leader refreshes. ([MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [SitePen Web Locks](https://www.sitepen.com/blog/cross-tab-synchronization-with-the-web-locks-api), [Loke.dev Web Locks](https://loke.dev/blog/solving-browser-concurrency-web-locks-api)) |
| **BB SDK does** | In-tab Promise mutex via `state.inFlightRefresh` (`token-manager.ts:200-213`) — coalesces only same-tab callers. BroadcastChannel `bb-universal-auth-session` broadcasts new tokens to other tabs (`token-manager.ts:70-119`). **No cross-tab leader election** — two tabs whose access tokens expire simultaneously will both POST `/session/refresh`. Spec §16.2 lists Shared Worker primary as Block 4 Day 9-10 future work. |
| **Classification** | **Gap** — cross-tab coalescing is missing today. |
| **Risk** | N tabs × concurrent expiry → N refresh calls → if server is strict on rotation reuse without grace, N−1 fail and tabs log out. The recommended fix is `navigator.locks.request('bb-auth-refresh', ...)` with a double-checked re-read, NOT SharedWorker (Safari blocker per spec §8.2). Recommend updating the Phase-2 plan to Web Locks rather than Shared Worker. |

### 1.6 Session revocation push

| Claim | Detail |
|---|---|
| **Industry standard** | SSE for one-way revocation push — built-in reconnect via `Last-Event-ID`, traverses corporate firewalls, no WebSocket overhead. WebSockets only justified when bidirectionality is independently needed. Polling acceptable as fallback. Single connection shared across tabs via leader election to dodge the 6-conn-per-origin cap. ([SoftwareMill SSE vs WS](https://softwaremill.com/sse-vs-websockets-comparing-real-time-communication-protocols/), [RxDB realtime](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)) |
| **BB SDK does** | 60s poll of `/auth/v1/me` while `document.visibilityState === 'visible'`, ETag-aware (`session-watcher.ts:21-138`). SSE listed as Phase 2 (spec §16.2). |
| **Classification** | **Aligned** with documented Phase-1 scope. **Drift** vs. industry "real-time" baseline. |
| **Risk** | Up-to-60s window where revoked sessions still serve UI. Fine for B2B internal apps; not OK for high-stakes contexts. ETag handling is a nice egress optimization. |

---

## 2. WebAuthn / Passkey SDK Patterns

| Topic | Industry standard (URL) | BB SDK does (file:line) | Class |
|---|---|---|---|
| Conditional UI detection | `browserSupportsWebAuthnAutofill()` from `@simplewebauthn/browser` v13 + `<input autocomplete="username webauthn">`. ([SimpleWebAuthn docs](https://simplewebauthn.dev/docs/packages/browser), [web.dev passkey autofill](https://web.dev/articles/passkey-form-autofill)) | `passkey-flow.ts:33-36` calls `browserSupportsWebAuthnAutofill()`. `passkey-flow.ts:131-134` passes `useBrowserAutofill: options.conditionalUI === true`. | **Aligned** |
| Cross-device auth (hybrid CTAP) | Server returns transport hints; SimpleWebAuthn handles via `optionsJSON`. ([SimpleWebAuthn passkeys](https://simplewebauthn.dev/docs/advanced/passkeys)) | `passkey-flow.ts:122-127` POSTs `/passkey/authenticate/options` and forwards `optionsJSON` to `startAuthentication` — server controls transport hints. | **Aligned** |
| Resident credentials / discoverable | When `useBrowserAutofill: true`, server should return `allowCredentials: []` (or library handles it). ([SimpleWebAuthn docs](https://simplewebauthn.dev/docs/packages/browser)) | Server-controlled; SDK forwards options as-is. | **Aligned** (assuming BFF returns empty `allowCredentials` for conditional flow). |
| Fallback for unsupported browsers | Feature-detect via `browserSupportsWebAuthn()` and fall through to non-passkey flows. ([SimpleWebAuthn docs](https://simplewebauthn.dev/docs/packages/browser)) | `passkey-flow.ts:29-31` exposes `isPasskeySupported()`. `passkey-flow.ts:58-60` throws on missing support — caller must check first. | **Aligned** |
| Cancel/abort handling | Use `WebAuthnAbortService.cancelCeremony()` and catch `WebAuthnError` with `code === 'ERROR_CEREMONY_ABORTED'`. ([SimpleWebAuthn docs](https://simplewebauthn.dev/docs/packages/browser)) | `passkey-flow.ts:67-73, 130-138` catches and emits `passkey.cancelled` but does not distinguish abort from other errors via the error code. | **Minor gap** — works, but could differentiate user-cancel telemetry from real failures. |
| Conditional Create / auto-upgrade | `startRegistration({ optionsJSON, useAutoRegister: true })` for opportunistic post-password upgrade. ([SimpleWebAuthn docs](https://simplewebauthn.dev/docs/packages/browser)) | Not implemented — `passkey-flow.ts:69` always uses standard `startRegistration`. | **Gap** (low priority — opportunistic feature). |

---

## 3. Encrypted Client Storage

### 3.1 Storage primitive

| Claim | Detail |
|---|---|
| **Industry standard** | IDB (via `idb` or `idb-keyval`) with non-extractable CryptoKey is the IETF-recommended pattern for SPAs that must hold tokens. localStorage rejected by OWASP. Pattern is endorsed by `draft-ietf-oauth-browser-based-apps-26 §6.3.4.2.2`. ([InfoQ DPoP storage paradox](https://www.infoq.com/articles/dpop-key-storage-unsolved-problem/), [OWASP WSTG](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/05.2-Testing_for_OAuth_Client_Weaknesses)) |
| **BB SDK does** | `idb` v8 + non-extractable derived AES key (`storage-crypto.ts:27-47`, `extractable: false`). RT stored as `{iv, ciphertext}` rows in IDB (`storage.ts:99-111`). Crypto runs in a DedicatedWorker (`crypto-client.ts:36-50`). | 
| **Classification** | **Aligned** (best-available SPA pattern). |
| **Risk** | Residual: same-origin XSS still has a decryption oracle. Mitigated by non-extractable key + worker isolation, not eliminated. Spec acknowledges. |

### 3.2 KDF: PBKDF2 vs Argon2id

| Claim | Detail |
|---|---|
| **Industry standard** | OWASP Password Storage Cheat Sheet (current): Argon2id preferred (19 MiB, t=2, p=1). PBKDF2-HMAC-SHA256 acceptable when FIPS-140 needed at **600,000 iterations** minimum. ([OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP ASVS #1567](https://github.com/OWASP/ASVS/issues/1567)) |
| **BB SDK does** | PBKDF2-HMAC-SHA256, **100,000 iterations** (`storage-crypto.ts:9` `PBKDF2_ITERATIONS = 100_000`). Comment claims "OWASP 2023" — that's outdated; OWASP 2023 figure is 600k. |
| **Classification** | **Drift** — iteration count is 6× below current OWASP minimum. |
| **Risk** | The KDF input here is `deviceId` (`SHA-256(UA)` truncated to 32 hex), which is not a low-entropy password — it's a public observable. The threat model is *device-binding* not *password cracking*, so iteration count carries less weight than for user-password hashing. **However**, the comment and self-justification are wrong; either bump to 600k to match OWASP nominally, or document explicitly that this PBKDF2 is binding-only and a 100k count was chosen for cold-start budget. NO SOURCE FOUND for a "device-binding KDF iteration" benchmark — this is a unique use case OWASP doesn't directly address. |

### 3.3 AEAD: AES-GCM vs ChaCha20-Poly1305

| Claim | Detail |
|---|---|
| **Industry standard** | AES-256-GCM is the Web Crypto baseline; ChaCha20-Poly1305 is not in Web Crypto level 1 — only AES-CBC, AES-CTR, AES-GCM, AES-KW are exposed. ([MDN SubtleCrypto.encrypt](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt)) **NO SOURCE FOUND** for a 2025 industry consensus on ChaCha20 in browser auth SDKs — it's largely unavailable. |
| **BB SDK does** | AES-256-GCM, 12-byte random IV per call (`storage-crypto.ts:50-58`). | 
| **Classification** | **Aligned** (only practical choice in Web Crypto today). |

### 3.4 Key origin

| Claim | Detail |
|---|---|
| **Industry standard** | Generate random non-extractable CryptoKey via `crypto.subtle.generateKey({extractable:false})`, store handle in IDB (structured-clone-safe). Don't *derive* from a public observable like UA string. ([InfoQ DPoP storage paradox](https://www.infoq.com/articles/dpop-key-storage-unsolved-problem/), [Pomcor keys-in-browser](https://pomcor.com/2017/06/02/keys-in-browser/)) |
| **BB SDK does** | Derives AES key from `SHA-256(navigator.userAgent).slice(0, 32)` (`device-id.ts:71-77`) via PBKDF2 (`storage-crypto.ts:27-47`). UA is publicly observable — this is essentially a fixed key per UA-string. |
| **Classification** | **Drift** — key derivation from a non-secret. |
| **Risk** | If an attacker copies the IDB ciphertext **and** can recover/guess the original UA string, decryption is trivial. UA strings are often logged in server access logs. The salt is also a fixed string `bb-universal-auth-v1-salt` (`storage-crypto.ts:10`). Effectively this is *device-pinning* (cross-device IDB copy fails) but not key secrecy. Recommend: generate a random AES CryptoKey on first use, store the **handle** in IDB (not the bytes), let the browser keychain encrypt at rest. Spec §15.2 acknowledges "not cryptographic binding". |

---

## 4. Service Worker for Auth

| Topic | Industry standard | BB SDK | Class |
|---|---|---|---|
| Auth header injection in SW | Pattern is well-documented but token acquisition stays on main thread; SW intercepts fetch, clones headers, appends Bearer, retries on 401 via `MessageChannel`/`BroadcastChannel` to page. ([ForgeRock appAuthHelper SW](https://github.com/ForgeRock/appAuthHelper/blob/master/service_workers.md), [Firebase SW sessions](https://firebase.google.com/docs/auth/web/service-worker-sessions)) | BB SW does NOT inject auth headers — fetches on the page attach Bearer themselves (`client.ts:138-143`). SW's role is offline-queue flush + cache purge (`sw/index.ts:33-86`). | **Drift** vs. SW-as-auth-relay pattern, but **deliberate** — see spec §13. Bearer attachment in app code is simpler and avoids the SW message-channel dance. |
| Cache invalidation on logout | Purge caches matching URL patterns on logout signal. ([web.dev passkey](https://web.dev/articles/passkey-form-autofill)) | `sw/index.ts:88-97` `purgeCaches()` matches names against configurable RegExp patterns; ping/pong to clients. | **Aligned**. |
| Background-sync for offline mutations | Standard pattern: SW listens for `sync` event, posts message back to page to flush queue. ([MDN SW sync](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker)) | `sw/index.ts:47-62` listens on tag `bb-universal-auth-flush`, posts `run_flush` to all clients. | **Aligned**. |

---

## 5. Bundle Size + Supply Chain

| Topic | Industry standard | BB SDK | Class |
|---|---|---|---|
| `npm publish --provenance` | npm SLSA provenance available **only for public source repos**. Private GitHub repos cannot generate npm-registry provenance — even via Trusted Publishing. ([GitHub blog provenance](https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/), [GitHub changelog 2023-07-26](https://github.blog/changelog/2023-07-26-publishing-with-npm-provenance-from-private-source-repositories-is-no-longer-supported/)) | `package.json:113-115` registry is `https://npm.pkg.github.com` (GitHub Packages) with `access: restricted`. Spec §15.1 explicitly notes incompatibility — uses `actions/attest-build-provenance@v1` instead, verifiable with `gh attestation verify`. | **Aligned** — correctly identified the constraint and chose Artifact Attestations. |
| SBOM (CycloneDX) | `@cyclonedx/cyclonedx-npm` generates SBOM, current spec is CycloneDX 1.7. ([CycloneDX npm](https://github.com/CycloneDX/cyclonedx-node-npm), [CycloneDX site](https://cyclonedx.org/)) | **NO SOURCE FOUND** in repo for SBOM generation. `scripts/release.ts` and `scripts/verify-bundle.ts` exist; no CycloneDX dep in `package.json`. | **Gap** — adding a release-step SBOM (CycloneDX 1.7 JSON) would round out supply-chain posture. |
| Signed releases (Sigstore cosign) | GitHub Artifact Attestations use Sigstore under the hood; verifiable with `cosign` or `gh attestation verify`. ([Sigstore blog cosign verify](https://blog.sigstore.dev/cosign-verify-bundles/)) | Spec §15.1 calls for `gh attestation verify`. Implementation in `scripts/release.ts` not audited here. | **Aligned (planned)** — verify the script actually runs the attestation step. |
| Dependency review | Public norm: GitHub `actions/dependency-review-action` on PRs. **NO SOURCE FOUND** confirming BB CI uses it (didn't read .github/). | Not verified. | **Unknown**. |
| Forbidden-deps verification | BB has `scripts/verify-no-jose.ts` (per `package.json:32`), and spec App. B excludes lodash/axios/jose/zustand/moment. Industry has no formal "deny-list" standard; this is a BB invention. | Codified + CI-checked. | **Aligned** with internal spec; ahead of industry baseline. |

---

## 6. Multi-tab Refresh Coalescing — Web Locks vs SharedWorker

Already covered in §1.5. **Recommendation:** Replace the planned "SharedWorker primary" (spec §8.2 "Block 4 Day 9-10") with `navigator.locks` because:

1. Universal support (Safari has `navigator.locks`; Safari has **no** SharedWorker). ([MDN navigator.locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), [MDN SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker))
2. ~10 lines of code vs SharedWorker file + bundling entry.
3. Crash-safe (lock auto-released on tab death). ([Loke.dev](https://loke.dev/blog/solving-browser-concurrency-web-locks-api))
4. Pattern: `navigator.locks.request('bb-auth-refresh', async () => { /* re-check token, refresh if still stale, broadcast */ })`.

Keep BroadcastChannel for the *propagation* leg (already implemented at `token-manager.ts:110-119`).

---

## 7. CSP + Browser Hardening (Guidance for SDK Consumers)

Per Web Almanac 2025 ([HTTP Archive Almanac 2025 Security](https://almanac.httparchive.org/en/2025/security)) and web.dev ([Security headers](https://web.dev/articles/security-headers)):

| Header | Recommendation for sites embedding BB SDK | BB SDK status |
|---|---|---|
| Strict CSP nonces + `'strict-dynamic'` | Required for sites handling sensitive data. | SDK is library code; consumer apps own CSP. **NO SOURCE FOUND** in BB docs giving consumer CSP guidance — recommend adding to INTEGRATION_GUIDE. |
| Trusted Types `require-trusted-types-for 'script'` | Recommended; consumer creates policies; SDK must not call dangerous DOM sinks (innerHTML, eval, new Function). | Not audited — recommend running Trusted Types in report-only on demo app to surface any SDK violations. |
| COOP `same-origin` (or `same-origin-allow-popups`) | Required for SharedArrayBuffer / cross-origin isolation. WARNING: breaks OAuth popup flows. ([web.dev COOP/COEP](https://web.dev/articles/coop-coep)) | BB uses redirect flows + BFF — popup-free, so consumer can use `same-origin` safely. **Document this as a selling point.** |
| COEP `require-corp` or `credentialless` | Required if you want `SharedArrayBuffer`. Forces all subresources to emit CORP. | SDK ships only JS bundles served from consumer's origin — emits no third-party network requests at SW init. Compatible. **Document.** |
| HSTS, X-Content-Type-Options: nosniff, X-Frame-Options | Baseline for all sites. | Consumer responsibility. |

---

## Summary Table — Gaps Worth Acting On

| # | Topic | Severity | Action |
|---|---|---|---|
| 1 | Cross-tab refresh coalescing missing (only intra-tab mutex) | **Medium** | Add `navigator.locks.request('bb-auth-refresh', ...)` wrapping `performRefresh` in `token-manager.ts:215`. |
| 2 | PBKDF2 iterations 100k vs OWASP 600k | **Low** | Update comment in `storage-crypto.ts:9` to reflect that this is a binding KDF (not password hashing) and revisit count vs cold-start budget; OR bump to 600k for parity. |
| 3 | Key derived from public observable (UA) + fixed salt | **Medium** | Migrate to `crypto.subtle.generateKey({extractable:false})` random AES key, store CryptoKey *handle* in IDB. Eliminates the "UA log + IDB copy" attack chain. |
| 4 | DPoP not implemented | **Low (acknowledged)** | Already deferred to Phase 2 per spec §16.2. Track. |
| 5 | SSE for revocation push | **Low (acknowledged)** | Already deferred to Phase 2 per spec §16.2. |
| 6 | SBOM (CycloneDX) generation | **Low** | Add `@cyclonedx/cyclonedx-npm` to release pipeline, attach JSON SBOM to GitHub release. |
| 7 | Trusted Types compatibility audit | **Low** | Run demo app under `Content-Security-Policy-Report-Only: require-trusted-types-for 'script'` and fix any violations. |
| 8 | Conditional Create / auto-upgrade passkey | **Low** | Add `useAutoRegister: true` path for opportunistic upgrade after password login. |
| 9 | CSP/COOP/COEP guidance for consumers | **Low** | Add a "Hardening Checklist" page to INTEGRATION_GUIDE.md. |

**Aligned and ahead** of typical SDK practice: forbidden-deps CI script, encrypted IDB + Worker isolation, ETag-aware polling, idempotency keys on every mutation, GitHub Artifact Attestations (correct choice for private package).

---

## Sources

- [Auth0 — Token Storage](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)
- [Auth0 — Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [Auth0 — Securing SPAs with RT Rotation](https://auth0.com/blog/securing-single-page-applications-with-refresh-token-rotation/)
- [Auth0 — DPoP](https://auth0.com/blog/protect-your-access-tokens-with-dpop/)
- [Okta — Refresh Tokens guide](https://developer.okta.com/docs/guides/refresh-tokens/main/)
- [IETF — OAuth 2.0 for Browser-Based Apps draft-13](https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/13/)
- [oauth.net — Browser-Based Apps](https://oauth.net/2/browser-based-apps/)
- [RFC 9449 — DPoP](https://www.rfc-editor.org/rfc/rfc9449.html)
- [WorkOS — DPoP explained](https://workos.com/blog/dpop-rfc-9449-explained)
- [InfoQ — DPoP storage paradox](https://www.infoq.com/articles/dpop-key-storage-unsolved-problem/)
- [OWASP WSTG — Testing OAuth Client Weaknesses](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/05.2-Testing_for_OAuth_Client_Weaknesses)
- [OWASP WSTG — Testing Browser Storage](https://owasp.org/www-project-web-security-testing-guide/v41/4-Web_Application_Security_Testing/11-Client_Side_Testing/12-Testing_Browser_Storage)
- [OWASP — Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP ASVS Issue #1567 — PBKDF2 600k](https://github.com/OWASP/ASVS/issues/1567)
- [SimpleWebAuthn — Browser package](https://simplewebauthn.dev/docs/packages/browser)
- [SimpleWebAuthn — Passkeys advanced](https://simplewebauthn.dev/docs/advanced/passkeys)
- [web.dev — Passkey form autofill](https://web.dev/articles/passkey-form-autofill)
- [Chrome Developers — WebAuthn Conditional UI](https://developer.chrome.com/docs/identity/webauthn-conditional-ui)
- [MDN — Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- [W3C — Web Locks](https://www.w3.org/TR/web-locks/)
- [Loke.dev — Web Locks for browser concurrency](https://loke.dev/blog/solving-browser-concurrency-web-locks-api)
- [SitePen — Cross-tab sync with Web Locks](https://www.sitepen.com/blog/cross-tab-synchronization-with-the-web-locks-api)
- [ACV Engineering — Refresh tokens with Shared Web Worker](https://acv.engineering/posts/managing-refresh-tokens-with-a-shared-web-worker/)
- [GitHub Blog — npm package provenance](https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/)
- [npm Docs — Generating provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Changelog — provenance from private repos unsupported](https://github.blog/changelog/2023-07-26-publishing-with-npm-provenance-from-private-source-repositories-is-no-longer-supported/)
- [Sigstore Blog — cosign verify bundles](https://blog.sigstore.dev/cosign-verify-bundles/)
- [CycloneDX npm tool](https://github.com/CycloneDX/cyclonedx-node-npm)
- [CycloneDX site](https://cyclonedx.org/)
- [HTTP Archive — Web Almanac 2025 Security](https://almanac.httparchive.org/en/2025/security)
- [web.dev — Security headers reference](https://web.dev/articles/security-headers)
- [web.dev — COOP/COEP cross-origin isolation](https://web.dev/articles/coop-coep)
- [MDN — COEP header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy)
- [Firebase — SW sessions](https://firebase.google.com/docs/auth/web/service-worker-sessions)
- [ForgeRock appAuthHelper — SW pattern](https://github.com/ForgeRock/appAuthHelper/blob/master/service_workers.md)
- [SoftwareMill — SSE vs WebSockets](https://softwaremill.com/sse-vs-websockets-comparing-real-time-communication-protocols/)
- [RxDB — Realtime protocol comparison](https://rxdb.info/articles/websockets-sse-polling-webrtc-webtransport.html)
- [MSAL.js — Browser caching](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching)
- [Pomcor — Storing crypto keys in browser storage](https://pomcor.com/2017/06/02/keys-in-browser/)
- [Curity — Best practices for storing access tokens (2024)](https://curity.medium.com/best-practices-for-storing-access-tokens-in-the-browser-6b3d515d9814)
