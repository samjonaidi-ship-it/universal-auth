# Security Audit — rc.4 Lookback | 2026-05-08

**Subject:** `@samjonaidi-ship-it/universal-auth@1.1.0-rc.4`
**Auditor:** Security agent (read-only)
**Scope:** rc.4 source tree under `src/`, build/verify scripts, package manifest, docs, prior audit deltas vs `audits/holistic-2026-05-07/SECURITY.md` (rc.2 baseline) and `audits/holistic-2026-05-06/SECURITY.md` (rc.1 baseline).
**Method:** 100 % file-line citations; quotes ≤ 15 words; no source modification.

---

## Score: **8.6 / 10**  (rc.2: 8.7 / 10 · rc.1: 7.6 / 10)

**Net delta vs rc.2:** −0.1.

The drop is **not** caused by any fix regressing — every closed P1 finding still verifies (matrix below). Two new genuine debt items push the score off-peak:

1. **NEW H4 (real)** — `SDK_VERSION` constant in `src/config.ts:225` is hard-coded `'1.1.0-rc.3'` while `package.json:3` ships `1.1.0-rc.4`. Telemetry version-stamps and the `X-SDK-Version` header now misattribute every rc.4 install as rc.3. Same finding class as the audit-fix called out at `src/config.ts:222-224` ("was '1.0.2' on the v1.0.4 build, causing telemetry to misattribute traffic"). Severity High because it directly defeats fleet observability of the rc.4 hardening it is supposed to ship.
2. **NEW NL7 (Low)** — entitlements HMAC verification at `src/core/entitlements.ts:165` uses `expectedSig === envelope.sig` (variable-time `===`). Even though both inputs are derived from server-trusted sources and a same-origin XSS already has decryption oracle (see standing H3), shipping a non-constant-time compare in a freshly-introduced HMAC verifier is below the bar set by the rest of the cryptographic surface (which avoids the question entirely by relying on WebCrypto internals).

The rest of the rc.4 delta is benign-to-positive (lint cleanup, removal of pure dead state) and the score remains in the top quartile of browser auth SDKs.

---

## Risk summary

| Severity | rc.1 | rc.2 | **rc.4** | Δ vs rc.2 |
|---|---|---|---|---|
| Critical | 0 | 0 | **0** | 0 |
| High     | 3 | 2 | **3** | +1 (new H4 — version drift) |
| Medium   | 6 | 2 | **2** | 0 |
| Low      | 5 | 6 | **7** | +1 (new NL7 — non-constant-time MAC compare) |

---

## 1. Resolved findings — verification matrix

Every previously-closed P0/P1 finding re-verified at rc.4 source.

| ID | Title (origin audit) | rc.4 status | rc.4 evidence (file:line) |
|---|---|---|---|
| H1 | DPoP `ath` claim missing (RFC 9449 §4.2) | **STILL CLOSED** | `src/core/dpop/proof.ts:69-75` computes `ath = base64UrlEncode(SHA-256(accessToken))`; placed in payload at `proof.ts:83` only when present and non-empty. Empty-string handling: `proof.ts:71` guards `accessToken.length > 0` so the empty-string case omits `ath` rather than emitting hash of empty input — RFC 9449 §4.2 conformant. |
| M1 | `cnf.jkt` round-trip verify after refresh | **STILL CLOSED** | `src/core/token-manager.ts:312-333, 412-440`. JWT-malformed handling: `verifyAccessTokenJktBinding()` `try/catch` at `:415,434-439` returns `'unbound'` on parse failure → fail-safe (does NOT crash, does NOT block legitimate refresh). Mismatch path at `:323-333` calls `clearRefreshToken()` then throws `CNF_JKT_MISMATCH`. |
| M2 | Entitlements unencrypted in localStorage | **STILL CLOSED** | `src/core/entitlements.ts:91-104` envelope shape; `:160-176` async verify; `:178-189` HMAC compute via `crypto.subtle.sign('HMAC', …)`; non-extractable HMAC key in IDB at `src/core/storage.ts:213-246` (`extractable=false`, `usages: ['sign','verify']`). Async-verify-after-adopt window remains (NL1 carry-over below). |
| M3 | Device-id in localStorage | **STILL CLOSED (Path A)** | `src/core/device-id.ts:39-72`. No `localStorage.*` calls in the file (re-grepped; only inline-comments mention LS). Recompute every page load via `computeDeviceIdFromUA()` at `:56-62`. |
| M4 | `apiBaseUrl` not validated | **STILL CLOSED in production mode** | `src/config.ts:180-219` `assertApiBaseUrlSafety()`; wired at `:276`. Three look-alike checks (apex, suffix, parent) at `:208-211` all required to fail-open — re-derived earlier audit's `notbuildwithbainbridge.com` test case still throws. |
| M5 | WebAuthn UV/UP enforcement | **STILL CLOSED** | `src/flows/passkey-flow.ts:61-75` `assertUvNotDiscouraged()` covers register + authenticate; post-call UV bit at `:92-116` — see rc.3 fixup row below. |
| rc.3 fixup | `authenticatorPerformedUv` try/catch fail-closed | **VERIFIED** | `src/flows/passkey-flow.ts:99-115` — entire decode block wrapped in `try { ... } catch { return false; }`. Malformed base64url (`atob` `InvalidCharacterError`), short input (`< 33` bytes at `:109`), and any other thrown exception fail-closed to `false` → caller at `:255-262` throws `passkey.uv_required_but_missing`. NL6 from rc.2 audit (parse propagation) is now closed. |

**No regressions detected** in the closed-finding set.

---

## 2. Standing deferrals — status check (no worse than rc.2)

| ID | Title | rc.2 status | rc.4 status | Evidence / commentary |
|---|---|---|---|---|
| H2 | DPoP `useDpop:'auto'` silent downgrade | OPEN (deferred) | **OPEN — unchanged** | `src/core/client.ts:234-273`. Default still `'auto'` at `client.ts:234`; soft-fallback path at `:254-273` emits `dpop.fallback_used` + `reportSoftError`. No client-side change in rc.3/rc.4. The rec is "flip default to `'always'` once server enforcement opens." Server enforcement window status unknown to SDK; this is a coupling decision, not a code defect. |
| H3 | Same-origin XSS oracle | OPEN (long-term) | **OPEN — unchanged** | `src/core/storage.ts:313-351` (refresh decrypt oracle); `src/core/dpop/keypair.ts:73-77` (`getOrCreateKeypair` reachable from any in-page caller). Documented residual risk per `docs/THREAT_MODEL.md:25` (T3a). Iframe-sandbox remediation deferred. |
| M6 | Idempotency-Key truncation (`hex.slice(0,16)`) | OPEN (deferred low-priority, "5 min effort") | **OPEN — unchanged** | `src/core/client.ts:467-474` still slices to 16 hex chars. `__deriveRefreshIdempotencyKeyForTests` exported at `:476` — test surface is in place; the "use full SHA-256" change is a one-line edit (`return hex;` instead of `return hex.slice(0, 16);`). 64 bits is below SHA-256 design margin but: (a) input is a fresh refresh token (≥128 bits of entropy), (b) collision search would still need 2^32 expected refreshes per identity, and (c) server idempotency window is bounded to ~5 min. Real-world exploitable: no. Deferral remains defensible. |
| L1 | console.warn in token-manager | CLOSED | **STILL CLOSED** | `src/core/token-manager.ts:354-355, 459-462` route through `reportSoftError()`; `client.ts:268-272` same. |
| L2 | Enrollment fragment in Referer | OPEN | **OPEN — unchanged** | `src/flows/enroll-flow.ts:178-203` strips fragment via `history.replaceState` (`:194-199`). The L2 documentation rec ("document caller ordering re: enrollment token strip") is not a code item. |
| L3 | SSE no auth header | OPEN | **OPEN — unchanged** | `src/core/session-events.ts:114` — `new EventSource(url, { withCredentials: true })`. WHATWG EventSource API does not allow custom auth headers; cookie-based auth is the only option and is explicitly chosen. M4's `assertApiBaseUrlSafety` is the production-mode containment for this. |
| L4 | `inferDecryptFailureReason` dead branch | OPEN | **OPEN — unchanged** | `src/core/storage.ts:353-361` still both-paths-return `'aes_gcm_auth_tag_failed'`. The `'key_handle_missing'` branch is reached only via the explicit pre-check at `:330-335` (which short-circuits before `inferDecryptFailureReason` runs); the `'unknown_iv'` branch IS reachable but the third `'aes_gcm_auth_tag_failed'` constant identifier remains de-facto unreachable. Cosmetic. |
| L5 | SW SRI/provenance pinning | OPEN | **OPEN — unchanged** | Optional, no code change. |
| NL1 | Entitlements verify-after-adopt window | OPEN (Low) | **OPEN — unchanged** | `src/core/entitlements.ts:118-152, 162-178`. `loadFromDisk()` at `:118-152` returns `parsed.data` synchronously; `verifyDiskSignatureAsync()` clears asynchronously on mismatch. Trade-off remains as documented in rc.2 audit. |
| NL6 | `authenticatorPerformedUv` parse try/catch | OPEN (Low) | **CLOSED in rc.3** | See rc.3 fixup row above. |

**No deferral has gotten worse.** No new code paths introduced in rc.4 widen any of these surfaces.

---

## 3. rc.4 delta security analysis

### 3.1 Removal of `unsignedLegacyAdopted` (entitlements)

**File:** `src/core/entitlements.ts`
**Search verification:** `grep -rn "unsignedLegacyAdopted" src/` returns **no matches** at rc.4. The rc.3 CHANGELOG describes the variable as "set in 3 places but never read — pure dead state."

**Security property check.** The removed variable was set when legacy (unsigned) localStorage entries were adopted on v1.2 first-load (legacy migration path at `entitlements.ts:139-144` — currently still present and behaviorally unchanged):
- `:140-144` — legacy bare `CacheShape` is adopted, `signatureVerified = true`, returned as-is.
- The previous `unsignedLegacyAdopted = true` would have been set here too.

The legacy-adoption *behavior* is preserved (`signatureVerified = true` on `:142` is still the gate that prevents the async verifier from re-validating the unsigned blob). The flag's only documented consumer was telemetry/observability. Removing it does **not** change any cryptographic decision: the `signatureVerified` boolean continues to gate `verifyDiskSignatureAsync()` correctly (`:161` short-circuits on `signatureVerified === true`).

**Verdict:** No security regression. The CHANGELOG correctly characterizes the removal as a no-op for runtime behavior. The lost telemetry hook is documented but not a finding (the `entitlements.tamper_detected` event recommendation from rc.2 NL1 was never wired anyway, so the legacy-adoption observability story is unchanged from rc.2).

### 3.2 `vitest.config.ts` branches threshold 85 → 83

**File:** `vitest.config.ts:32-37`. Threshold dropped to `branches: 83` (from 85); other thresholds unchanged.

**Coverage delta** per CHANGELOG rc.4 entry (line 48): "coverage 90.44 / 83.74 / 92.77 / 90.44". Measured branches: 83.74 % — clears the new threshold by 0.74 pp.

**Security-relevant branch coverage check.** The rc.4 CHANGELOG lists the four newly-uncovered branch families:
1. `entitlements.ts` HMAC paths (78.66 %)
2. `storage.ts` HMAC key store branches (72.88 %)
3. `validators.ts` dynamic-import error path (79.31 %)
4. `passkey-flow.ts` UV try/catch (rc.3 fixup) + `CodeEntry` generic-error

Categories 1-2 and 4 directly touch P1 hardening surfaces. **Re-derived risk:** uncovered branches are predominantly the **error/fallback** branches (catch blocks for crypto unavailable, IDB structured-clone failure, malformed base64url). All of them fail-closed by design:
- `entitlements.ts:171-175` — crypto unavailable → `signatureVerified = true` (intentional graceful degradation; the cache stays in memory, server enforcement remains the gate).
- `storage.ts:235-241` — IDB rejects CryptoKey clone → in-memory cache; next page load regenerates key (silently invalidates stale signature → forced re-fetch). Fail-safe.
- `passkey-flow.ts:112-115` — malformed authenticator data → `false` → `passkey.uv_required_but_missing` thrown.

**Verdict:** Lowered threshold reveals genuine test-debt (tracked as `BACKLOG.md` COV-1) but **does not hide a security-relevant defect**. The uncovered branches are themselves defenses (fail-closed paths) whose exercise requires fault-injection tests; their absence does not mean the paths don't behave correctly, only that we haven't locked the behavior down with a regression test. Recommend treating COV-1 as Medium debt (see Debt inventory).

### 3.3 `eslint-plugin-react-hooks` v5 (vs v7)

**File:** `eslint.config.js:7, 54, 58`. Plugin pinned at `^5.0.0` per `package.json:95`.

**v5 vs v7 rule scope.** v7 introduces the `react-hooks/set-state-in-effect` rule (and a stricter `purity` ruleset) that fires on patterns like `useEffect(() => setState(...), [])` without a guard. None of the security-critical React surfaces use `setState` from `useEffect` for security-sensitive state (verified by grep: `useAuth.ts`, `useEntitlements.ts`, `useAccess.ts`, `useAccessBulk.ts`, `useImpersonation.ts`, `useDelegatedGrants.ts` all rely on `useSyncExternalStore` for read-side, not `useEffect`+`setState`). The v7 rule would catch a future regression class but would not fire on current code.

**Verdict:** Pinning v5 is a defensible compatibility choice (rc.4 CHANGELOG: v7 "introduces stricter rules incompatible with current `useSyncExternalStore` patterns"). It does NOT regress any actually-firing v6/v7 security smell — those would have already been errors in CI. Recommend reviewing the upgrade-to-v7 BACKLOG item once `useSyncExternalStore` patterns are revisited.

### 3.4 Watermark/version drift (NEW H4)

**Discovered during rc.4 delta scan.**

`src/config.ts:225` declares:
```
export const SDK_VERSION = '1.1.0-rc.3';
```

`package.json:3` declares `"version": "1.1.0-rc.4"`.

The constant flows through:
- `src/core/event-reporter.ts:121` → every event envelope's `sdk_version` field.
- `src/core/client.ts:193` → every outbound HTTP request's `X-SDK-Version` header (via `clientConfig.sdkVersion` configured at `config.ts:290`).
- `src/core/sdk-metrics.ts:91` → `getSDKMetrics().version` snapshot.

**Impact:** Same-class regression as the audit-fix already documented in the file itself (`config.ts:222-224`, "was '1.0.2' on the v1.0.4 build, causing telemetry to misattribute traffic"). Telemetry, fleet observability, and any server-side version-gating logic now misattribute every rc.4 install as rc.3. If the BFF gates a feature on `X-SDK-Version` ≥ `1.1.0-rc.4`, every rc.4 client is denied that feature. Conversely, audit-trail forensics conducted against rc.4 clients will misclassify them.

**Severity:** High. Not exploitable in the cryptographic sense, but it directly defeats the observability story of the rc.4 hardening fixes (CHANGELOG: "rc.4 = rc.3 with 3 lint errors fixed and coverage threshold reconciled" — but every rc.4 client will telemetry-self-identify as rc.3, defeating the ability to even observe the rc.4 rollout).

**Remediation:** One-line edit at `config.ts:225`:
```
export const SDK_VERSION = '1.1.0-rc.4';
```
Effort: 30 seconds. Add a `verify:version-sync` CI gate (parse `package.json` + grep `SDK_VERSION` + assert equality) — same playbook as the existing `verify:no-jose` and `verify:watermarks`. Effort: 30 minutes.

---

## 4. New attack-surface review (rc.2+ deltas)

### 4.1 HMAC entitlements — timing-safe equality? (NEW NL7)

**File:** `src/core/entitlements.ts:165`
```
if (expectedSig === envelope.sig) {
```
Plain `===` against a base64url string. JavaScript `===` for strings is short-circuit / variable-time (V8 returns on first mismatched code unit).

**Threat model.** The adversary needed to exploit this is one who can:
1. Write an arbitrary `{ data, sig }` envelope to localStorage (== same-origin XSS).
2. Repeatedly trigger `verifyDiskSignatureAsync` and observe the timing.
3. Use the timing oracle to recover one byte of the HMAC tag at a time.

The same XSS attacker already has direct access to `getRefreshToken()`/`getAccessToken()` per standing H3, and can mint forged DPoP proofs via `crypto.subtle.sign` on the in-memory keypair. So in the realistic threat tree this is dominated.

**Why I'm still flagging it.** A new HMAC verifier shipped without `crypto.subtle.timingSafeEqual` (or a hand-rolled XOR-and-OR fold) sets a precedent and gets cited in mechanical SAST scanners that lack the threat-model context. Cost-of-fix is ~6 LOC.

**Severity:** Low.

**Remediation pseudo-fix:**
```
function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

### 4.2 Stable JSON canonicalization for HMAC (V8 insertion order)

**File:** `src/core/entitlements.ts:178-189` `computeSignature()`.

Builds the hashed input as a fresh literal `{ features, app_access, fetched_at, identity_id }`. ECMAScript 2020+ guarantees `Object.keys` insertion order for non-numeric string keys; V8 / SpiderMonkey / JSC all honor it. `JSON.stringify` of a fresh literal therefore produces a byte-stable serialization across modern browsers.

**Edge cases reviewed:**
- `data.features` is `readonly string[]` — `JSON.stringify` preserves array element order. The server returns features in a stable order per the `/auth/v1/me` contract.
- `data.fetched_at` is `number` — finite-integer JSON serialization is stable.
- `data.identity_id` is `string | null` — `null` serializes as the literal `null`.
- No floats, no `Date` objects, no `Map`/`Set`/`undefined` slots — none of the pathological JSON.stringify cases.

**Verdict:** No finding. The rc.2 audit's caveat ("flag if the server ever sorts arrays differently between calls") still applies and is the right concern, but is a contract-coupling issue rather than a security defect.

### 4.3 Dynamic libphonenumber-js import — supply-chain risk

**File:** `src/profile/validators.ts:54-57`
```
const { parsePhoneNumberFromString, isValidNumberForRegion } = await import(
  'libphonenumber-js'
);
```

**Bundling check.** `package.json:71-76` lists `libphonenumber-js` as a runtime `dependency` (not `peerDependency`). The build (`scripts/build.ts` per `package.json:45`) is esbuild-based; dynamic `import('libphonenumber-js')` is bundled into a code-split chunk that ships with the package, **not** loaded from a CDN at runtime. No CDN dependency exists.

**Wire-format check.** No CSP `script-src 'self'` violation; no remote fetch; no `<script>` injection. The chunk is loaded via the consumer app's own asset host.

**Verdict:** No supply-chain risk from the dynamic-import pattern itself. The `libphonenumber-js` package is on the standard NPM supply-chain trust boundary; that is the same boundary as every other production dep. No finding.

### 4.4 WebAuthn UV byte parser — bounds checking on `authenticatorData`

**File:** `src/flows/passkey-flow.ts:92-116` `authenticatorPerformedUv()`.

Re-walked at rc.4 source:
- `:101-102` base64url-pad and replace: pure string ops, no length assumption.
- `:104-108` `atob`/`Buffer.from`: throws on invalid input; caught by outer `try/catch` at `:99,112-115` → fail-closed `false`.
- `:109` `bin.length < 33` short-input guard → fail-closed.
- `:110-111` reads byte 32, ANDs with `0x04`. No write, no out-of-bounds, no integer overflow (single-byte char code).

**Edge cases reviewed:**
- Empty string: `bin.length === 0 < 33` → false. ✓
- 32-byte string (rpIdHash only, no flags): false. ✓
- 33-byte string with flags=0x00: false. ✓
- 33-byte string with UV=1 only: true. ✓
- Spec-violating UV=1+UP=0: still true (rc.2 NL6 caveat — server `@simplewebauthn/server` re-validates).
- Spec-violating UV=0+AT=1: false (correct — UV not performed). ✓

**Verdict:** No finding. The parser is bounds-safe and fail-closed.

### 4.5 `cnf.jkt` verify — JWT-malformed handling

**File:** `src/core/token-manager.ts:412-440`.

Re-walked:
- `:415-419` `parts.length !== 3` and empty payload → `'unbound'`.
- `:421-422` base64url → base64 padding fix and char-replace.
- `:423` `atob`/`Buffer` decode — throws on malformed input.
- `:424` `JSON.parse` — throws on malformed JSON.
- `:425-426` defensive `cnf.jkt` shape check.
- `:434-439` global try/catch — any throw → `'unbound'` (fail-safe to permissive, NOT crash, NOT block legitimate refresh).

The behavior is correct per the docstring at `:401-410`: "JWT parse errors (opaque tokens, no `cnf` claim) are non-fatal." A malformed JWT cannot block a legitimate refresh; only a present-and-mismatched `cnf.jkt` aborts the refresh.

**Verdict:** No finding. Fail-safe-to-unbound is the correct posture for an informational check.

---

## 5. Crypto correctness checks

### 5.1 SHA-256 of accessToken for `ath` — empty-string handling

`src/core/dpop/proof.ts:71-75`:
```
if (accessToken !== undefined && accessToken.length > 0) {
  ...
  ath = base64UrlEncode(new Uint8Array(digest));
}
```

`undefined` and empty-string both omit `ath`. Per RFC 9449 §4.2, `ath` MUST be present when an access token accompanies the request. The SDK only attaches DPoP at all when a non-empty access token is present (`client.ts:236, 246-247`); the `accessToken.length > 0` guard is a belt-and-suspenders for the impossible-but-defensive case. **Conformant.**

### 5.2 HMAC key generation — non-extractable, key length

`src/core/storage.ts:225-229`:
```
const newKey = await crypto.subtle.generateKey(
  { name: 'HMAC', hash: 'SHA-256' },
  false, // non-extractable
  ['sign', 'verify'],
);
```

WebCrypto `HMAC` with `hash: 'SHA-256'` and no `length` parameter defaults to the SHA-256 block size (512 bits / 64 bytes), which is the recommended length per RFC 2104 §3 for HMAC-SHA-256. `extractable=false` means the raw key bytes never appear in JS; usages locked to `['sign','verify']`. **Conformant.**

### 5.3 JWK thumbprint — RFC 7638 compliance

`src/core/dpop/thumbprint.ts:42-49`:
- `:42-44` rejects non-EC kty and missing `crv/x/y`.
- `:46` `JSON.stringify({ crv, kty: 'EC', x, y })` — required members in **alphabetical** order (`crv` < `kty` < `x` < `y`), no whitespace, no extra members. **RFC 7638 §3.2 compliant.**
- `:47-49` SHA-256 → base64url (no padding, `+/` → `-_`). RFC 4648 §5 compliant.

**Verdict:** RFC 7638 conformant. Server-side thumbprint must use the same algorithm — verified as the contract per the file's own header at `:8-9` ("must match the BFF's `jwkThumbprint()` byte-for-byte").

### 5.4 IV uniqueness for AES-GCM

`src/core/storage-crypto.ts:42`:
```
const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(AES_IV_BYTES)));
```
12-byte (96-bit) random IV per encryption. Birthday bound is 2^48 encryptions before collision becomes meaningful — far above any realistic refresh-token rotation count. **Conformant.**

### 5.5 ECDSA signature shape

`src/core/dpop/proof.ts:93-97` uses `crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ...)`. WebCrypto returns the raw `r||s` 64-byte concatenation, which is exactly the JWS signature shape per RFC 7515 §3.4. **Conformant.**

---

## 6. Token-lifecycle audit

### 6.1 Refresh path — `cnf.jkt` + idempotency-key + AbortSignal

| Property | Wired? | File:line |
|---|---|---|
| `cnf.jkt` round-trip verify | ✓ | `token-manager.ts:322-333` |
| `Idempotency-Key` derived from refresh token | ✓ (truncated — see M6) | `client.ts:419, 467-474` |
| `redirect: 'manual'` on refresh fetch | ✓ | `client.ts:424` |
| `referrerPolicy: 'strict-origin-when-cross-origin'` | ✓ | `client.ts:425` |
| `AbortSignal` threading | **PARTIAL** | `refreshTokenRequest()` at `client.ts:406-458` does **not** accept or thread an `AbortSignal`. The token-manager's `performRefresh` does not accept one either (`token-manager.ts:288`). |

**AbortSignal gap on refresh.** P1-D added `signal` plumbing across the public surface, but the **internal** refresh path (called from `getAccessToken()` chains and from the 401-retry path at `client.ts:353-365`) is not cancellable. Consumer code that aborts a request whose 401-retry triggers a refresh will get the original request abort but the refresh continues to completion in the background. This is documented behavior (the refresh is shared via `state.inFlightRefresh`), but worth flagging as `NL8` (Low).

### 6.2 Storage `STORE_HMAC_KEY` upgrade path for v3 → v4

`src/core/storage.ts:50-51`:
```
// v1.2.0 (P1-J): bumped to 4 to add `hmac_key` store.
const DB_VERSION = 4;
```

`src/core/storage.ts:81-112` upgrade callback. Walked carefully:
- `:82-84` create `STORE_REFRESH_TOKENS` if absent.
- `:85-92` create `STORE_OFFLINE_QUEUE` with indices.
- `:93-95` create `STORE_EVENT_QUEUE`.
- `:96-98` create `STORE_DEAD_LETTER_QUEUE`.
- `:99-102` create `STORE_MASTER_KEY`.
- `:103-106` create `STORE_DPOP_KEYPAIR`.
- `:107-111` create `STORE_HMAC_KEY`.

All seven stores guarded with `if (!db.objectStoreNames.contains(...))`. A v3 → v4 user lands on `:107-111` only — existing data in the other six stores untouched. **Upgrade path correct.** No data migration needed because `STORE_HMAC_KEY` is new and starts empty (key generated lazily on first entitlements write).

### 6.3 Refresh-token rotation after `cnf.jkt` mismatch

`src/core/token-manager.ts:323-333` — on `cnf.jkt` mismatch:
1. `clearRefreshToken()` (line 324) — removes the encrypted RT from IDB.
2. State zeroed (`accessToken`, `accessExpiresAt`, `sessionId`).
3. `broadcast({ type: 'session_cleared' })` — other tabs evict their state.
4. `notifyListeners()` — useAuth re-renders to signed-out.
5. `throw` `CNF_JKT_MISMATCH` — caller learns about it.

**Note:** the DPoP keypair is **NOT** deleted on this path (it's only deleted by the broader `clearSession()` at `:243-260`, which is not called in the mismatch branch). This is **defensible** — the local key is still valid, it's the server that bound to a wrong key; deleting it would force a fresh enrollment ceremony rather than just a sign-in. But worth tracking as documentation debt: the docstring at `:316-320` does not mention the keypair-retention choice.

---

## 7. Supply-chain hygiene

### 7.1 `verify:no-jose` exclusions

`scripts/verify-no-jose.ts:7`:
```
const FORBIDDEN_IN_PROD = ['jose', 'lodash', 'axios', 'zustand', 'moment', 'date-fns'];
```

Walks `pnpm ls --prod --depth=Infinity --json` (with `npm` fallback) and refuses any match. The check is **production-tree-only** — `eslint-plugin-react-hooks` (added in rc.4) is dev-only and not in `dependencies` (`package.json:71-76`), so it does not appear in the prod tree. **Still effective.**

`package.json:71-76` runtime deps:
- `@simplewebauthn/browser` — first-party WebAuthn helper.
- `idb` — IndexedDB wrapper.
- `libphonenumber-js` — phone validation (lazy-loaded).
- `nanoid` — ID generator.

None are in the forbidden list.

### 7.2 SBOM diff — new transitive deps in rc.4 vs rc.1

The CHANGELOG rc.4 entry adds **only one new top-level dep**: `eslint-plugin-react-hooks@^5.0.0`. It is registered as a `devDependency` (`package.json:95`) and does not flow into the production tree.

**Verification.** Re-grepped runtime `dependencies` block at `package.json:71-76` — identical four-package list as rc.1 (per the rc.1 baseline audit). No new runtime transitives.

**Verdict:** Supply-chain runtime surface unchanged from rc.1 → rc.4. Dev-tree growth is reasonable for the 4 fixes shipped.

### 7.3 npm audit — CalExp5-noted high-sev vuln

The brief mentioned "1 high-severity vuln noted in CalExp5 install — is that in SDK runtime tree?" CalExp5 is a separate consumer project; the SDK itself does not install CalExp5 dependencies. The high-sev vuln in CalExp5's tree must be assessed against the SDK's own `pnpm audit` output, which is not in scope of this rc.4 source-only audit (no `pnpm audit` JSON committed in the repo).

**Recommendation.** Run `pnpm audit --prod --json` in CI as a post-install gate; treat any High/Critical in the runtime tree as a blocker. **Tracked as recommendation R8 below.** Effort: 30 minutes to add CI step.

---

## 8. Debt inventory

| ID | Severity | File:line | Finding | Age (sessions) | Exploit prerequisites | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| **H4 NEW** | High | `src/config.ts:225` | `SDK_VERSION = '1.1.0-rc.3'` while `package.json:3` is `1.1.0-rc.4` — version drift defeats fleet observability of rc.4 hardening | 1 (rc.4) | None (latent observability bug, not exploitable directly) | One-line edit + add `verify:version-sync` CI gate | 30 min |
| H2 | High | `src/core/client.ts:234` | `useDpop:'auto'` default → silent Bearer downgrade on any DPoP-build error | 3+ (rc.1, rc.2, rc.4) | XSS or fault-injection that throws inside `getOrCreateKeypair`/`buildDpopProof` while server still accepts plain Bearer | Flip default to `'always'` post server-enforcement; alert on `dpop.fallback_used` rate | 2 hr |
| H3 | High | `src/core/storage.ts:313`, `src/core/dpop/keypair.ts:73-77` | Same-origin XSS oracle — SDK can decrypt RT and sign DPoP proofs from any in-page caller | 3+ | Same-origin XSS | Document Trusted Types + strict CSP requirement; long-term: cross-origin iframe sandbox for signing | 2 hr now / 2-3 days long-term |
| M6 | Medium | `src/core/client.ts:473` | Refresh `Idempotency-Key` truncated to 16 hex chars (64 bits) | 3+ | None practically; collision dominated by RT entropy and 5-min server window | Drop the `.slice(0, 16)` | 5 min |
| **NL7 NEW** | Low | `src/core/entitlements.ts:165` | `expectedSig === envelope.sig` is variable-time string compare on HMAC tag | 1 (rc.4 audit, code dates to rc.2) | Same-origin XSS already has full session compromise; theoretical timing oracle dominated by H3 | Add `timingSafeStringEqual` helper or use `crypto.subtle.verify` API | 15 min |
| **NL8 NEW** | Low | `src/core/client.ts:406-458`, `src/core/token-manager.ts:288` | `refreshTokenRequest` and `performRefresh` do not accept/thread `AbortSignal`; consumer aborts on a 401-retry leak the underlying refresh fetch | 1 (rc.4 audit) | None (resource leak, not exploitable) | Thread an internal `AbortController` through `inFlightRefresh`; abort when all callers' signals abort | 1 hr |
| **NL9 NEW** | Low | `src/core/token-manager.ts:316-320, 323-333` | `cnf.jkt` mismatch path retains the local DPoP keypair (correctly); docstring does not document the choice | 1 (rc.4 audit) | None (documentation debt) | Add a 2-line clarifier to the docstring | 10 min |
| NL1 | Low | `src/core/entitlements.ts:118-152` | Verify-after-adopt window — sync `loadFromDisk` returns tampered data until async verifier runs | 2 (rc.2, rc.4) | XSS that writes tampered envelope; impact is UI-affordance spoofing for sub-frame to long-task duration | Document in INTEGRATION_GUIDE; consider `entitlements.tamper_detected` event | 30 min |
| L2 | Low | `src/flows/enroll-flow.ts:178-203` | Document caller ordering re: enrollment token strip | 3+ | None (doc rec) | INTEGRATION_GUIDE addendum | 15 min |
| L3 | Low | `src/core/session-events.ts:114` | SSE no auth header (WHATWG constraint) | 3+ | Misconfigured `apiBaseUrl` (mitigated by M4 in production) | Already mitigated; no further code change | 0 |
| L4 | Low | `src/core/storage.ts:353-361` | `inferDecryptFailureReason` collapses two branches to same return | 3+ | None (cosmetic) | Restore distinct `key_handle_missing` reason or simplify the union type | 15 min |
| L5 | Low | n/a (SW config) | SW SRI/provenance pinning optional | 3+ | None (high-assurance consumers only) | Add config field | 4 hr |
| **COV-1** | Medium (debt) | `vitest.config.ts:34` | Branches threshold lowered 85 → 83; 4 P1 surfaces lack focused branch tests | 1 (rc.4) | None (test debt, not runtime); fail-closed branches are correct but unverified by regression tests | Add focused `*-branches.test.ts` for entitlements HMAC, storage HMAC key store, validators dynamic-import error, passkey UV try/catch | 4 hr total |

**Total debt remediation:** ~14 hr (excluding L5 and H3 long-term iframe sandbox).

---

## 9. Recommendations (ranked by exploit prereq + effort)

| # | Action | Severity | Effort | Exploit prereq |
|---|---|---|---|---|
| **R1** | **Fix `SDK_VERSION` drift at `config.ts:225` → `'1.1.0-rc.4'`. Add `verify:version-sync` CI gate.** | H4 | 30 min | None — observability defeat, latent |
| R2 | Drop `.slice(0, 16)` on refresh Idempotency-Key (`client.ts:473`) | M6 | 5 min | None practically |
| R3 | Use `timingSafeStringEqual` helper in entitlements HMAC verify (`entitlements.ts:165`) | NL7 | 15 min | Same-origin XSS (dominated by H3) |
| R4 | Wrap `setSession` deprecation warn in test-mode guard, audit for L4 dead-branch simplification | L4 | 15 min | None |
| R5 | Add `AbortSignal` threading to `refreshTokenRequest` / `performRefresh` | NL8 | 1 hr | None |
| R6 | Document `cnf.jkt`-mismatch keypair-retention choice in token-manager docstring | NL9 | 10 min | None |
| R7 | Add focused branch tests for the four P1 surfaces; restore vitest branches threshold to 85 | COV-1 | 4 hr | None |
| R8 | Add `pnpm audit --prod --json` post-install CI gate (treat High/Critical as blockers) | supply-chain | 30 min | Future CVE in transitive |
| R9 | Once server enforces DPoP, flip `useDpop` default to `'always'`; alert on `dpop.fallback_used` rate | H2 | 2 hr | Server coupling |
| R10 | INTEGRATION_GUIDE: document Trusted Types + strict CSP requirement; emit warn at init when TT unenforced | H3 | 2 hr | Doc + warn |
| R11 | (Long-term) Move signing key into cross-origin iframe sandbox to defeat in-page XSS | H3 | 2-3 days | Architectural |

**Quick-win bundle (R1 + R2 + R3 + R6 = ~1 hr total)** closes the new rc.4 finding plus three carry-overs at trivial cost.

---

## 10. Method/scope statement

**Files read in full at rc.4 source state:** `src/core/dpop/{proof,thumbprint,keypair,nonce-cache,index}.ts`; `src/core/{token-manager,client,storage,entitlements,device-id,session-events,session-watcher,settings-sync,abac,error-hook,event-reporter,sdk-metrics,storage-crypto,crypto-client,crypto-worker}.ts`; `src/flows/{passkey-flow,code-flow,enroll-flow,impersonation,recovery,permission-grants,delegation,consent,persona-registry-client}.ts`; `src/{config,errors,index}.ts`; `src/profile/validators.ts:1-90`; `vitest.config.ts`; `eslint.config.js`; `scripts/verify-no-jose.ts`; `package.json`. Comparison docs read: `audits/holistic-2026-05-07/SECURITY.md`, `audits/holistic-2026-05-06/SECURITY.md` (lines 1-120), `docs/THREAT_MODEL.md`, `docs/CHANGELOG.md` (rc.2-rc.4 sections).

**Search verifications:** `grep -rn "unsignedLegacyAdopted" src/` → no matches. `grep -rn "SDK_VERSION" src/` → 5 matches (one declaration at `config.ts:225` plus four consumers). `grep -rn "localStorage" src/` → 22 matches, all in `entitlements.ts` and as comment-only references in `device-id.ts` / `storage.ts`.

**Read-only.** No source modifications. All findings cite `file:line` with quoted strings ≤ 15 words.

---

*Audit performed read-only against `src/` v1.1.0-rc.4 (commit `f7010e3`, tag `v1.1.0-rc.4`). 2026-05-08.*
