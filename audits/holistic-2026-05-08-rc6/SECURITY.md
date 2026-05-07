# Security Audit — rc.6 Lookback | 2026-05-08

**Subject:** `@samjonaidi-ship-it/universal-auth@1.1.0-rc.6` (commit `80ad904`, tag `v1.1.0-rc.6`, published 2026-05-07 01:01 UTC).
**Auditor:** Security agent (read-only).
**Scope:** rc.6 source tree under `src/`, build/verify scripts, package manifest, lockfile, pre-push hook, CHANGELOG rc.5/rc.6 sections, prior audit deltas vs `audits/holistic-2026-05-08-rc4/SECURITY.md` (rc.4 baseline) + `audits/holistic-2026-05-08-rc4/rc5_VERIFICATION.md`.
**Method:** 100% file:line citations; quotes ≤ 15 words; distinguishes VERIFIED (read source) from INFERRED. No source modifications.

---

## Score: **9.0 / 10** (rc.4: 8.6 / 10 · rc.2: 8.7 / 10 · rc.1: 7.6 / 10)

**Net delta vs rc.4:** **+0.4**.

The single rc.4 High-class regression (H4 — `SDK_VERSION` drift) is closed AND a CI gate now prevents recurrence (`scripts/verify-version-sync.ts`). The rc.4 NL7 finding (variable-time HMAC compare) is closed with an algorithmically-correct constant-time helper. No new findings introduced by the rc.5/rc.6 deltas. The `useDpop:'auto'` soft-fallback default (H2) is the only remaining open High, and it is a deliberate server-coupling decision pending the BFF enforcement window — not a code defect.

This is the strongest score the SDK has earned in the audit-trail series.

---

## Risk summary

| Severity | rc.1 | rc.2 | rc.4 | **rc.6** | Δ vs rc.4 |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | **0** | 0 |
| High     | 3 | 2 | 3 | **2** | −1 (H4 closed) |
| Medium   | 6 | 2 | 2 | **2** | 0 |
| Low      | 5 | 6 | 7 | **6** | −1 (NL7 closed) |

---

## 1. Resolved findings — verification matrix

Every closed P0/P1 finding re-verified at rc.6 source.

| ID | Title | rc.6 status | rc.6 evidence (file:line) |
|---|---|---|---|
| H1 | DPoP `ath` claim missing (RFC 9449 §4.2) | **STILL CLOSED** | `src/core/dpop/proof.ts:69-75` — `if (accessToken !== undefined && accessToken.length > 0)` guard at `:71`; `ath = base64UrlEncode(new Uint8Array(digest))` at `:74`; conditionally placed in payload at `:83` (`...(ath !== undefined ? { ath } : {})`). Empty-string omits `ath` rather than emitting hash-of-empty. |
| **H4** | **`SDK_VERSION` drift (rc.4 NEW)** | **CLOSED in rc.5; STILL CLOSED in rc.6** | `src/config.ts:231` `export const SDK_VERSION = '1.1.0-rc.6';`. `package.json:3` `"version": "1.1.0-rc.6"`. New CI gate at `scripts/verify-version-sync.ts:48-65` parses both + exits 1 on mismatch. Wired at `package.json:68` (`"verify:version-sync": "tsx scripts/verify-version-sync.ts"`); enforced by `.githooks/pre-push:34` (pre-push gate) AND inferred CI build-job per CHANGELOG line 84. |
| M1 | `cnf.jkt` round-trip verify after refresh | **STILL CLOSED** | `src/core/token-manager.ts:312-333` mismatch path; `:412-440` `verifyAccessTokenJktBinding()` with try/catch at `:415,434-439` returning `'unbound'` on parse failure. Mismatch at `:323-333` clears RT + broadcasts + throws `CNF_JKT_MISMATCH`. |
| M2 | Entitlements unencrypted in localStorage | **STILL CLOSED** | `src/core/entitlements.ts:91-104` envelope; `:160-181` async verify; `:199-210` HMAC compute via `crypto.subtle.sign('HMAC', ...)`; non-extractable HMAC key in IDB at `src/core/storage.ts:225-229` (`extractable=false`, `usages: ['sign','verify']`). |
| M3 | Device-id in localStorage | **STILL CLOSED** | `src/core/device-id.ts` — only matches for `localStorage` are in comments at `:8-10, 34, 67`. No live `localStorage.*` calls. |
| M4 | `apiBaseUrl` not validated | **STILL CLOSED** | `src/config.ts:180-219` `assertApiBaseUrlSafety()`; wired at `:282`. Three look-alike checks (apex / proper subdomain / parent) at `:208-211` all required to fail-open. |
| M5 | WebAuthn UV/UP enforcement | **STILL CLOSED** | `src/flows/passkey-flow.ts:61-75` `assertUvNotDiscouraged()`; post-call UV bit at `:92-116`. |
| **NL7** | **Variable-time HMAC compare (rc.4 NEW)** | **CLOSED in rc.5; VERIFIED CORRECT at rc.6** | See §3.1 below. `src/core/entitlements.ts:170` `if (constantTimeStringEquals(expectedSig, envelope.sig))`; helper at `:190-197` with length-fast-path + XOR-accumulator + no early-exit during diff loop. |
| rc.3 fixup | `authenticatorPerformedUv` try/catch fail-closed | **STILL VERIFIED** | `src/flows/passkey-flow.ts:99-115` — entire decode block wrapped in `try { ... } catch { return false; }`. Malformed base64url, short input (`< 33` bytes at `:109`), and any other thrown exception fail-closed to `false`. |

**No regressions detected** in the closed-finding set. Two formerly-open Highs (H4 + NL7) are now both closed.

---

## 2. Standing deferrals — status check

| ID | Title | rc.4 status | rc.6 status | Evidence / commentary |
|---|---|---|---|---|
| H2 | DPoP `useDpop:'auto'` silent downgrade | OPEN (deferred) | **OPEN — unchanged** | `src/core/client.ts:234-274`. Default still `'auto'` at `:234`; soft-fallback path at `:254-273` emits `dpop.fallback_used` + `reportSoftError`. No client-side change in rc.5/rc.6. Server-coupling decision pending BFF enforcement. |
| H3 | Same-origin XSS oracle | OPEN (long-term) | **OPEN — unchanged** | `src/core/storage.ts:313-351` (refresh decrypt oracle); `src/core/dpop/keypair.ts:73-77` (`getOrCreateKeypair` reachable from any in-page caller). Iframe-sandbox remediation deferred. |
| M6 | Idempotency-Key truncation | OPEN (deferred) | **OPEN — unchanged** | `src/core/client.ts:467-474` — `return hex.slice(0, 16);`. `__deriveRefreshIdempotencyKeyForTests` at `:476`. 64-bit truncation; risk dominated by RT entropy + 5-min server window. |
| L2 | Enrollment fragment in Referer | OPEN | **OPEN — unchanged** | `src/flows/enroll-flow.ts:178-203` strips fragment via `history.replaceState`. Doc-only rec. |
| L3 | SSE no auth header | OPEN | **OPEN — unchanged** | `src/core/session-events.ts:114` — WHATWG EventSource constraint; mitigated by M4. |
| L4 | `inferDecryptFailureReason` dead branch | OPEN | **OPEN — unchanged** | `src/core/storage.ts:353-361` — cosmetic; `key_handle_missing` literal also returned via early-return at `:332`. |
| L5 | SW SRI/provenance pinning | OPEN | **OPEN — unchanged** | Optional, no code change. |
| NL1 | Entitlements verify-after-adopt window | OPEN (Low) | **OPEN — unchanged** | `src/core/entitlements.ts:118-152` — `loadFromDisk()` returns `parsed.data` synchronously; `verifyDiskSignatureAsync` clears asynchronously on mismatch. |
| NL8 | `refreshTokenRequest` no AbortSignal | OPEN (rc.4 NEW) | **OPEN — unchanged; deferred to GA** | `src/core/client.ts:406-458`, `src/core/token-manager.ts:288-395`. CHANGELOG line 173-174 explicitly defers to v1.1.0 GA: "touches token-manager cross-tab lock — needs deeper refactor". |
| NL9 | `cnf.jkt`-mismatch keypair retention undocumented | OPEN (rc.4 NEW) | **OPEN — unchanged** | `src/core/token-manager.ts:316-333` docstring still doesn't mention keypair retention choice. Documentation debt only. |
| COV-1 | Branches threshold lowered (rc.4 audit) | rc.4 → 83; rc.5 → 84 | **rc.6: 84.72 measured / 84 floor** | `vitest.config.ts:40` (per rc.5 verification). +71 tests beyond rc.4. Per CHANGELOG `:42-46`, `storage.ts` IDB-upgrade branches still under-tested; deferred to v1.1.0 GA per `BACKLOG.md`. |

**No deferral has gotten worse.** No new code paths introduced in rc.5/rc.6 widen any of these surfaces.

---

## 3. rc.5 + rc.6 delta security analysis

### 3.1 Constant-time HMAC compare — algorithmic correctness check

**File:** `src/core/entitlements.ts:190-197`

```
function constantTimeStringEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

**Audit checklist (per assignment brief):**

| Property | Status | Evidence |
|---|---|---|
| Length fast-path before loop | ✓ | `:191` `if (a.length !== b.length) return false;` — early-return on mismatched lengths. Length is not secret (both sides are 43-char base64url SHA-256 HMAC outputs per docstring `:184-188`). |
| XOR-accumulator (no `===` per char) | ✓ | `:194` `diff |= a.charCodeAt(i) ^ b.charCodeAt(i);` — bitwise OR accumulates differences across all positions. |
| No early-exit during diff loop | ✓ | The for-loop body has only one statement (`:194`). No `if`, no `break`, no `return`. Loop iterations run for every `i < a.length` regardless of partial match. |
| Single comparison at end | ✓ | `:196` `return diff === 0;` — one terminal compare; the only branch is post-loop. |
| Wired correctly into call site | ✓ | `:170` `if (constantTimeStringEquals(expectedSig, envelope.sig))` — replaces the rc.4 `expectedSig === envelope.sig`. |

**Caveat (informational, not a finding).** The function's docstring `:184-188` correctly notes that for ASCII / base64url strings (where each `charCodeAt` returns a value in `[0, 127]`), the XOR fold is well-defined. For arbitrary UTF-16 strings the comparison would still be correct (charCodeAt returns the UTF-16 code unit, 0..65535) but the property would be "constant-time per code unit count," not "constant-time per byte." Since both inputs to this function come from `base64UrlEncode(...)` at `entitlements.ts:218`, the inputs are guaranteed-ASCII; the implementation is correct for its declared contract.

**Verdict:** Algorithmically correct. NL7 is fully closed.

### 3.2 `verify-version-sync.ts` — path traversal / file-read concerns

**File:** `scripts/verify-version-sync.ts:1-67` (entire file).

**Threat model.** The script runs in CI + pre-push contexts, reads `package.json` and `src/config.ts`, parses both, exits 0 on match / 1 on mismatch. Inputs are derived from build-time file paths, NOT from user/runtime input. There is no consumer-facing surface.

**Path-traversal review:**
- `:17-18` `here = dirname(fileURLToPath(import.meta.url))`; `repoRoot = resolve(here, '..')`. `resolve` normalizes `..`; `repoRoot` is fixed at the package's git root regardless of the cwd the script is invoked from. NOT user-controllable.
- `:25` `resolve(repoRoot, 'package.json')` — literal sibling; cannot escape `repoRoot`.
- `:34` `resolve(repoRoot, 'src/config.ts')` — literal grandchild; cannot escape `repoRoot`.

**File-read concerns:**
- `:26` `JSON.parse(readFileSync(path, 'utf8'))` — if `package.json` is corrupt, throws → CI fails. No exfiltration surface.
- `:27-29` rejects non-string or empty `version` field.
- `:35-44` reads `src/config.ts` line-by-line; regex at `:40` matches `^export\s+const\s+SDK_VERSION\s*=\s*['"]([^'"]+)['"]` — anchored at line start, single-quote/double-quote balanced, no character-class issues. Cannot ReDoS on pathological input.
- The error message at `:58-63` echoes both versions to stderr — these are values the developer already controls; not a leakage surface.

**Verdict:** No security concerns. Build-time tool, fixed inputs, anchored regex, no shell invocation.

### 3.3 `AuthErrorCode` union widened to `(string & {})` — attacker-controlled codes?

**File:** `src/errors.ts:44-73`

The union ends with `| (string & {})` at `:73`, which is the standard TypeScript "branded any-string fallback that still preserves literal-completion in IDEs" idiom. Type-system implication only.

**Runtime impact.** `AuthSdkError.code` is a string at runtime regardless of the type signature. The error envelope flows through `errorFromEnvelope` at `:354-390`:
- Lines `:361-385` — switch on the 17 known canonical codes and instantiate the matching typed class with the envelope's hint/retry/trace_id values.
- Line `:386-388` (default) — wraps unknown `env.code` in the base `AuthSdkError(env.code, ...)`. Server-supplied code is preserved verbatim.

**Attacker-controlled-code threat tree.** A code value reaches `AuthSdkError.code` through one of:
1. SDK-internal literals at the constructor sites (`code-flow.ts`, `client.ts`, `passkey-flow.ts`, etc.) — all literals.
2. The CT BFF error envelope's `code` field over an authenticated channel (CORS + cookie + DPoP). The server is the trust anchor; if the attacker can spoof the server, the SDK has bigger problems than typing.
3. The legacy `errorFromEnvelope` default at `:388` echoes `env.code` and `env.error`. The downstream consumer renders `err.message` and `err.code`. Both flow into JSX text nodes at the consumer; React escapes both.

**Verdict:** No attack surface admitted by the type widening. The change is purely a type-system relaxation to admit forward-compatible BFF-evolved codes without breaking consumer `switch` exhaustiveness checks. Runtime behavior unchanged.

### 3.4 `AuthProviderMissingError` — hookName XSS risk?

**File:** `src/errors.ts:285-295`

```
constructor(hookName: string) {
  super(
    'AUTH_PROVIDER_MISSING',
    `[@samjonaidi-ship-it/universal-auth] ${hookName}() called outside <AuthProvider>. ` +
      ...
  );
  this.hookName = hookName;
}
```

**Call sites (verified by grep across src/):**
- `src/react/useAuth.ts:54` — `throw new AuthProviderMissingError('useAuth');` (literal)
- `src/react/useEntitlements.ts:24` — `throw new AuthProviderMissingError('useEntitlements');` (literal)

Both call sites pass string literals. There is no public `AuthProviderMissingError` constructor exposed for consumers (it's exported by `src/errors.ts` only for `instanceof` checks; nothing in the SDK constructs it from untrusted input).

**XSS surface.** `hookName` flows into the Error message string. Consumers typically render `err.message` via React JSX text interpolation, which escapes all characters. There is no HTML rendering surface in this path.

**Documentation drift (NEW LOW — INFO-1).** `src/errors.ts:24-26` says "the 3 plain `throw new Error(...)` sites in useAuth/useEntitlements/useProfile" but only useAuth and useEntitlements were actually migrated (verified by grep). `useProfile` was not updated. This is a comment/changelog drift, not a security issue. Recommend either migrating useProfile too or updating the comment to "2 of 3 sites — useProfile deferred."

**Verdict:** No XSS risk. Hook names are SDK literals. The widening would only become a concern if a future caller passed user input as `hookName`; recommend a 1-line internal-only documentation comment to that effect.

### 3.5 7 PCP component exports — unsafe HTML / sinks audit

**Files re-exported in rc.5 (`src/react/index.ts:132-168`):** `MediaGallery`, `AddressInput`, `VehicleSection`, `GearSection`, `ComplianceDocsSection`, `PropertySection`, `CompletenessBar`, plus `useIdentity`.

**Search verifications across the 7 components + useIdentity.ts (verified by Grep):**
- `dangerouslySetInnerHTML` — **0 matches** in `src/`.
- `innerHTML` — **0 matches** in `src/`.
- `outerHTML` — **0 matches** in `src/`.
- `eval(` — **0 matches** in `src/`.
- `new Function(` / `Function(` — **0 matches** in `src/`.
- `document.write` / `insertAdjacentHTML` — **0 matches** in `src/`.
- `document.` / `window.` / `setTimeout` / `setInterval` access — **0 matches** in the 7 PCP component files (verified by Grep restricted to those files).

**Server-supplied URL audit.** Three components render server-supplied URLs:
- `MediaGallery.tsx:169` — `<img src={item.thumb_url ?? item.url} ... />` (server-issued R2 URL).
- `ComplianceDocsSection.tsx:123` — `<a href={primary.url} target="_blank" rel="noopener noreferrer" download={primary.file_name}>` (server-issued document URL; `rel="noopener noreferrer"` prevents tab-nabbing).
- `AvatarPicker.tsx:159, 178` — preset dataUri (literal in code) + server-supplied `r.src`.

React 16.9+ silently sanitizes `javascript:` URLs in `<a href>` (no warning, replaces with empty string). React does NOT explicitly sanitize `<img src>`, but per HTML spec, `<img src="javascript:...">` does not execute (image fetch only). `data:` URLs are admitted in `<img src>` and `<a href>`; the trust boundary is the CT BFF (server-side validator). For the rc.6 audit this is the same posture as rc.4 (none of the rc.5/rc.6 deltas changed it).

**`useIdentity.ts` mutation paths.** All path-parameter mutations use `encodeURIComponent`:
- `:268, 282, 314, 328, 368` — addresses, resources, media, property assets all interpolate ids via `encodeURIComponent(id)`. Defense against path-injection if ids ever contained `/` or `?`.

**Verdict:** No unsafe-HTML / dynamic-code / DOM-injection sinks introduced by the 7 new exports. The components were built and present in v1.0.0-rc.4 — only their exports are new in rc.5; the runtime behavior was already audited at rc.4 (per `audits/holistic-2026-05-08-rc4/SECURITY.md` §7.1 supply-chain hygiene context).

### 3.6 Pre-push hook security audit (`.githooks/pre-push`)

**File:** `.githooks/pre-push:1-52` (entire 52-line file).

Mode `755` (executable), shebang `#!/usr/bin/env bash` at `:1`, `set -euo pipefail` at `:13` (fail-fast on any error, undefined-variable use, or pipe failure).

**Per assignment brief — shell-injection risk if branch name contains special chars.**

The hook receives 2 positional args from git's pre-push protocol (`remote`, `url`):
- `:15` `remote="$1"` (assigned, then compared via `:21` `if [[ "$remote" != "origin" ]]`).
- `:16` `url="$2"` (assigned but never used in any subsequent command).

**Key observations:**
1. **Branch names are not consumed by this hook.** Git's pre-push hook protocol passes per-ref data (local-ref, local-sha, remote-ref, remote-sha) on stdin, NOT as args. This hook does not read stdin. It cannot see branch names at all.
2. **Args are quoted.** `:21` uses `"$remote"` inside `[[ ... ]]` — bash safe-string compare; no expansion-injection.
3. **No shell interpolation of variables into commands.** The `GATES` array at `:31-38` contains literal command strings (`"pnpm typecheck"` etc). The loop at `:40-48` runs each via `eval "$gate"`.
4. **`eval "$gate"` audit.** `gate` is iterated from the `GATES` literal array; values are SDK-author-controlled hardcoded strings. No external input flows to `eval`. `eval` here is harmless idiomatically (it's used to allow per-gate command parsing into argv) — equivalent to `bash -c "$gate"` with the same trust profile.

**Hypothetical attacker model.** An attacker who could modify the `GATES` array (i.e., commit to the repo with push access) is by definition already trusted to push code. There is no escalation path through this hook.

**Other gates:**
- `:21` skips when `remote != "origin"` — only mirror-pushes / fork-pushes bypass; that is by design (this is a CI-parity guard, not a security fence).
- `:25` `cd "$(git rev-parse --show-toplevel)"` — quoted command substitution; safe for spaces in repo paths.
- `:13` `set -euo pipefail` — any failed gate aborts.

**Verdict:** No shell-injection surface. The hook can be bypassed with `--no-verify` (documented at `:11`); that is a **client-side** local pre-flight, not a security boundary. The trust boundary is the server-side CI gate (which mirrors the same checks per CHANGELOG line 86 / commit `deb886e`).

### 3.7 `BROWSER_SMOKE_ENABLED` gate — fail direction

**File:** `.github/workflows/ci.yml:118` and `.github/workflows/browser-matrix.yml:48`.

Both jobs are gated `if: vars.BROWSER_SMOKE_ENABLED == 'true'`. GitHub Actions evaluates this at job-dispatch time:
- `vars.BROWSER_SMOKE_ENABLED` unset → expression `'' == 'true'` → false → job **skipped**.
- `vars.BROWSER_SMOKE_ENABLED == 'true'` → job runs.
- Any other value (`'1'`, `'yes'`, etc.) → false → skipped.

**Direction.** The gate **fail-closes the test-coverage** (no smoke run if the var isn't set), NOT the security gate. The build-job that runs the security-relevant CI gates (`verify:no-jose`, `verify:version-sync`, `verify:watermarks`, `lint`, `typecheck`) is in a SEPARATE job that does NOT depend on `BROWSER_SMOKE_ENABLED` and is unconditionally run on every push/PR.

**Risk.** If `BROWSER_SMOKE_ENABLED` is left unset (default), browser end-to-end tests are silently skipped. CHANGELOG `:120-125` documents this is intentional pending a working smoke target. The risk is reduced cross-browser coverage, not a security regression — the security CI gates run irrespective.

**Verdict:** Default-off for browser smoke is fail-open from a TEST coverage standpoint, but the security CI gates are independent and always run. Acceptable; track as known limitation.

---

## 4. NEW findings (rc.6 audit)

**One INFO-class observation; zero new Highs / Mediums / Lows.**

| ID | Severity | File:line | Finding |
|---|---|---|---|
| **INFO-1 NEW** | Informational (doc drift) | `src/errors.ts:24-26` | Comment claims `AuthProviderMissingError` "replaces the 3 plain throw new Error(...) sites in useAuth/useEntitlements/useProfile", but grep confirms only 2 sites migrated (useAuth + useEntitlements). useProfile.ts still has its original `throw new Error(...)` site (per rc.5 audit verification, useProfile was outside rc.5 scope). Recommend either migrating useProfile or updating the comment to "2 of 3 hooks; useProfile migration deferred to v1.1.0 GA." Zero security implication. |

No other new findings.

---

## 5. Crypto correctness re-derivations

### 5.1 SHA-256 of accessToken for `ath` claim — empty-string handling

`src/core/dpop/proof.ts:71-75`:

```
if (accessToken !== undefined && accessToken.length > 0) {
  const tokenBytes = new TextEncoder().encode(accessToken);
  const digest = await crypto.subtle.digest('SHA-256', tokenBytes);
  ath = base64UrlEncode(new Uint8Array(digest));
}
```

`undefined` AND empty-string both **omit** `ath` rather than producing `SHA-256("")` = `47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU`. RFC 9449 §4.2 requires `ath` when an access token accompanies the request; the SDK only attaches DPoP at all when a non-empty access token is present (`client.ts:236, 246-247`). The `length > 0` guard is belt-and-suspenders. **Conformant.**

### 5.2 HMAC key generation — non-extractable, length, algorithm-locked

`src/core/storage.ts:225-229`:

```
const newKey = await crypto.subtle.generateKey(
  { name: 'HMAC', hash: 'SHA-256' },
  false, // non-extractable
  ['sign', 'verify'],
);
```

- WebCrypto `HMAC` with `hash: 'SHA-256'` and no `length` parameter defaults to the SHA-256 block size (512 bits / 64 bytes), per W3C WebCrypto §29.5. Recommended length per RFC 2104 §3 for HMAC-SHA-256.
- `extractable=false` — raw bytes never appear in JS land; the structured-clone of the CryptoKey persisted to IDB at `:236` carries an opaque handle, not the key material.
- `usages: ['sign', 'verify']` — algorithm-locked. The same handle cannot be re-used as an AES-GCM encrypt key (would error at `crypto.subtle.encrypt`), preserving the algorithm-isolation property documented at `entitlements.ts:202-205`.

**Conformant.**

### 5.3 JWK thumbprint — RFC 7638 compliance

`src/core/dpop/thumbprint.ts:32-50`:
- `:36-39` rejects non-EC kty.
- `:42-44` rejects missing `crv/x/y`.
- `:46` `JSON.stringify({ crv: jwk.crv, kty: 'EC', x: jwk.x, y: jwk.y })` — required members in **alphabetical** order (`crv` < `kty` < `x` < `y`), no whitespace, no extra members. RFC 7638 §3.2 conformant.
- `:47-49` SHA-256 → base64url (no padding, `+/` → `-_`). RFC 4648 §5 conformant.

**Conformant.** Server-side thumbprint must use the same algorithm (`bff/services/dpop.js v0.1.0`). Inferred from the docstring at `:8-9`; not re-verified server-side at this audit.

### 5.4 AES-GCM IV uniqueness

`src/core/storage-crypto.ts:42` — 12-byte (96-bit) random IV per encryption. Birthday bound: 2^48 encryptions before collision becomes meaningful. Refresh-token rotation count is bounded by 90-day TTL × ~hourly rotation = ~2160 encryptions per identity. **Far below the bound. Conformant.**

### 5.5 ECDSA r||s shape for DPoP

`src/core/dpop/proof.ts:93-97`:
```
const sigBytes = await crypto.subtle.sign(
  { name: 'ECDSA', hash: 'SHA-256' },
  pair.privateKey,
  new TextEncoder().encode(signingInput),
);
```
WebCrypto `ECDSA.sign` with P-256 returns the raw 64-byte `r || s` big-endian concatenation per W3C WebCrypto §23.4 — exactly the JWS signature shape per RFC 7515 §3.4. **Conformant.**

---

## 6. Token-lifecycle audit

### 6.1 Refresh path — `cnf.jkt` + idempotency-key + AbortSignal

| Property | Wired? | File:line |
|---|---|---|
| `cnf.jkt` round-trip verify | ✓ | `token-manager.ts:322-333` |
| `Idempotency-Key` derived from refresh token | ✓ (truncated — see M6) | `client.ts:419, 467-474` |
| `redirect: 'manual'` on refresh fetch | ✓ | `client.ts:424` |
| `referrerPolicy: 'strict-origin-when-cross-origin'` | ✓ | `client.ts:425` |
| `AbortSignal` threading through refresh | **PARTIAL — NL8** | `refreshTokenRequest()` at `client.ts:406-458` does not accept `AbortSignal`. Per CHANGELOG `:173-174` deferred to GA. |

### 6.2 Storage `STORE_HMAC_KEY` upgrade path for v3 → v4

`src/core/storage.ts:50-51` `DB_VERSION = 4`. Upgrade callback at `:81-112`:
- `:82-84` create `STORE_REFRESH_TOKENS` if absent.
- `:85-92` create `STORE_OFFLINE_QUEUE` with indices.
- `:93-95, :96-98, :99-102, :103-106` create `STORE_EVENT_QUEUE`, `STORE_DEAD_LETTER_QUEUE`, `STORE_MASTER_KEY`, `STORE_DPOP_KEYPAIR`.
- `:107-111` create `STORE_HMAC_KEY` for v3→v4 (the rc.4 P1-J addition).

All seven stores guarded with `if (!db.objectStoreNames.contains(...))`. v3→v4 user lands on `:107-111` only — existing data in the other six stores untouched. New `STORE_HMAC_KEY` starts empty (key generated lazily on first entitlements write at `:215-244`).

**Verdict:** Upgrade path correct; no data migration needed. **Still correct at rc.6** — no source change since rc.4.

---

## 7. Supply-chain hygiene

### 7.1 `verify:no-jose` exclusions

`scripts/verify-no-jose.ts:7`:
```
const FORBIDDEN_IN_PROD = ['jose', 'lodash', 'axios', 'zustand', 'moment', 'date-fns'];
```
Same banlist as rc.4. Walks `pnpm ls --prod --depth=Infinity --json` (with npm fallback). Production-tree-only — devDeps (`eslint-plugin-react-hooks` etc) do not appear in the prod tree. **Still effective.**

### 7.2 SBOM diff — new transitive deps in rc.5/rc.6 vs rc.4

**Runtime `dependencies` block at `package.json:72-77`:**
- `@simplewebauthn/browser` `^13.0.0`
- `idb` `^8.0.0`
- `libphonenumber-js` `^1.10.0`
- `nanoid` `^5.0.0`

Identical four-package list as rc.4 (per rc.4 audit §7.2). **Zero new runtime deps in rc.5/rc.6.**

### 7.3 4 devDeps removed in rc.5 — confirm not in production build

Per CHANGELOG `:130-132`, rc.5 removed `size-limit`, `@size-limit/preset-small-lib`, `tiny-invariant`, `toxiproxy-node-client`. Verified by Grep against `package.json:78-106` (devDependencies block):
- `size-limit` — not present.
- `tiny-invariant` — not present.
- `toxiproxy-node-client` — not present.
- `@size-limit/preset-small-lib` — not present.

**Confirmed.** Per the rc.5_VERIFICATION.md row #12 (BUILD-4), these were also confirmed absent. None of the four were in production deps at any point, so removal is purely build-tree hygiene; no production-bundle delta.

### 7.4 `eslint-plugin-react-hooks@5.2.0` — supply-chain integrity

`pnpm-lock.yaml:1663-1665`:
```
eslint-plugin-react-hooks@5.2.0:
  resolution: {integrity: sha512-+f15FfK64YQwZdJNELETdn5ibXEUQmW1DZL6KXhNnc2heoy/sg9VJJeT7n8TlMWouzWqSWavFkIhHyIbIAEapg==}
```
Pinned with sha512 integrity hash. Transitive deps (`eslint@9.39.4(jiti@2.6.1)`) match the existing build's eslint pin. Dev-only — not in the production tree (`verify:no-jose` covers).

**Note:** `package.json:95` declares `^5.2.0` (rc.5 verification said `^5.0.0` — minor discrepancy but the actually-pinned lockfile version is 5.2.0). No security regression; `^5.2.0` is a strict-or-newer constraint and the lockfile is the source of truth at install time.

### 7.5 npm/pnpm audit in CI

Same recommendation as rc.4 audit §7.3 (R8): no `pnpm audit --prod --json` post-install gate observed. Still recommended; same effort estimate (30 min). **Tracked as carry-over.**

---

## 8. Pre-push hook security audit

Per §3.6 above: **no shell-injection, no path-escape, no eval-of-untrusted-input**. The hook is a defensible build-time pre-flight that mirrors the CI build-job step list. Recommend documenting the `--no-verify` bypass usage in `docs/INTEGRATION_GUIDE.md` so emergency hotfixes don't accidentally bypass `verify:version-sync` (same regression class as rc.4 H4).

---

## 9. Debt inventory (full table)

| ID | Severity | File:line | Finding | Age (audits) | Exploit prerequisites | Recommendation | Effort |
|---|---|---|---|---|---|---|---|
| H2 | High | `src/core/client.ts:234, 254-273` | `useDpop:'auto'` default → silent Bearer downgrade on any DPoP-build error | 4 (rc.1, rc.2, rc.4, rc.6) | XSS or fault-injection that throws inside `getOrCreateKeypair`/`buildDpopProof` while server still accepts plain Bearer | Flip default to `'always'` post BFF enforcement window; alert on `dpop.fallback_used` rate | 2 hr |
| H3 | High | `src/core/storage.ts:313-351`, `src/core/dpop/keypair.ts:73-77` | Same-origin XSS oracle — SDK can decrypt RT and sign DPoP proofs from any in-page caller | 4 | Same-origin XSS | Document Trusted Types + strict CSP requirement; long-term: cross-origin iframe sandbox for signing | 2 hr now / 2-3 days long-term |
| M6 | Medium | `src/core/client.ts:473` | Refresh `Idempotency-Key` truncated to 16 hex chars (64 bits) | 4 | None practically; collision dominated by RT entropy and 5-min server window | Drop the `.slice(0, 16)` | 5 min |
| **COV-1** | Medium (debt) | `vitest.config.ts:40` | Branches threshold floor at 84 (target 85); `storage.ts` HMAC v3→v4 upgrade branches under-tested | 2 (rc.4, rc.6) | None (test debt, not runtime); fail-closed branches are correct but unverified | Add fake-indexeddb-with-version-injection harness; restore threshold to 85 | 4 hr |
| NL1 | Low | `src/core/entitlements.ts:118-152` | Verify-after-adopt window — sync `loadFromDisk` returns tampered data until async verifier runs | 3 | XSS that writes tampered envelope; impact is UI-affordance spoofing | Document in INTEGRATION_GUIDE; consider `entitlements.tamper_detected` event | 30 min |
| NL8 | Low | `src/core/client.ts:406-458`, `src/core/token-manager.ts:288-395` | `refreshTokenRequest`/`performRefresh` do not accept/thread `AbortSignal` | 2 | None (resource leak, not exploitable) | Thread internal `AbortController` through `inFlightRefresh`; abort when all callers' signals abort | 1 hr (per CHANGELOG `:173`: "needs deeper refactor") |
| NL9 | Low | `src/core/token-manager.ts:316-333` | `cnf.jkt` mismatch path retains the local DPoP keypair; docstring doesn't document the choice | 2 | None (documentation debt) | Add a 2-line clarifier to the docstring | 10 min |
| L2 | Low | `src/flows/enroll-flow.ts:178-203` | Document caller ordering re: enrollment token strip | 4 | None (doc rec) | INTEGRATION_GUIDE addendum | 15 min |
| L3 | Low | `src/core/session-events.ts:114` | SSE no auth header (WHATWG constraint) | 4 | Misconfigured `apiBaseUrl` (mitigated by M4) | Already mitigated; no further code change | 0 |
| L4 | Low | `src/core/storage.ts:353-361` | `inferDecryptFailureReason` collapses two branches to same return | 4 | None (cosmetic) | Simplify the union or split the early-return | 15 min |
| L5 | Low | n/a (SW config) | SW SRI/provenance pinning optional | 4 | None (high-assurance consumers only) | Add config field | 4 hr |
| **INFO-1 NEW** | Informational | `src/errors.ts:24-26` | Comment claims AuthProviderMissingError migrated 3 hooks; only 2 (useAuth, useEntitlements) actually migrated. useProfile still uses plain Error | 1 (rc.6) | None (documentation drift) | Migrate useProfile too OR update comment to match reality | 15 min |

**Closed since rc.4:** H4 (SDK_VERSION drift), NL7 (variable-time HMAC compare).

**Total debt remediation:** ~14 hr (excluding L5 SW SRI and H3 long-term iframe sandbox). Quick-wins R1-R3 below total ~30 min.

---

## 10. Recommendations (ranked by exploit prereq + effort)

| # | Action | Severity | Effort | Exploit prereq |
|---|---|---|---|---|
| **R1** | Drop `.slice(0, 16)` on refresh Idempotency-Key (`client.ts:473`) | M6 | 5 min | None practically |
| **R2** | Update `src/errors.ts:24-26` comment OR migrate useProfile to AuthProviderMissingError | INFO-1 | 15 min | None (doc drift) |
| **R3** | Document `cnf.jkt`-mismatch keypair-retention choice in token-manager docstring | NL9 | 10 min | None |
| **R4** | Add `pnpm audit --prod --json` post-install CI gate (treat High/Critical as blockers) | supply-chain | 30 min | Future CVE in transitive |
| **R5** | Add `AbortSignal` threading to `refreshTokenRequest` / `performRefresh` (per CHANGELOG GA-defer) | NL8 | 1 hr (refactor) | None |
| **R6** | Restore vitest branches threshold 84 → 85; add `storage.ts` IDB-upgrade-callback fake-indexeddb harness | COV-1 | 4 hr | None |
| **R7** | Once server enforces DPoP, flip `useDpop` default to `'always'`; alert on `dpop.fallback_used` rate | H2 | 2 hr | Server coupling |
| **R8** | INTEGRATION_GUIDE: document Trusted Types + strict CSP requirement; emit warn at init when TT unenforced | H3 | 2 hr | Doc + warn |
| **R9** | (Long-term) Move signing key into cross-origin iframe sandbox to defeat in-page XSS | H3 | 2-3 days | Architectural |

**Quick-win bundle (R1 + R2 + R3 = ~30 min total)** closes all three trivial-effort carry-overs and the one new INFO finding at near-zero cost.

---

## 11. Method/scope statement

**Files read in full at rc.6 source state (commit `80ad904`, tag `v1.1.0-rc.6`):**
- `src/core/dpop/{proof,thumbprint,keypair}.ts`
- `src/core/{token-manager,client,storage,entitlements}.ts` (full or relevant sections)
- `src/core/device-id.ts` (Grep verification only)
- `src/flows/passkey-flow.ts:60-116` (rc.3 fixup region)
- `src/config.ts` (full)
- `src/errors.ts` (full)
- `src/react/index.ts` (full)
- `src/react/{useAuth,useEntitlements,useIdentity}.ts` (full)
- `src/react/components/{MediaGallery,AddressInput}.tsx` (full)
- `src/react/components/{ComplianceDocsSection,AvatarPicker}.tsx` (URL-handling regions)
- `scripts/verify-version-sync.ts` (full)
- `scripts/verify-no-jose.ts:1-30`
- `.githooks/pre-push` (full)
- `package.json` (full)
- `pnpm-lock.yaml` (eslint-plugin-react-hooks rows + grep verification)
- `docs/CHANGELOG.md:1-180` (rc.5 + rc.6 sections)

**Comparison docs read:** `audits/holistic-2026-05-08-rc4/SECURITY.md` (full); `audits/holistic-2026-05-08-rc4/rc5_VERIFICATION.md` (full).

**Search verifications:**
- `grep -rn "dangerouslySetInnerHTML|innerHTML|eval(|new Function|.outerHTML"` in `src/` → **0 matches**.
- `grep -rn "document.write|insertAdjacentHTML"` in `src/` → **0 matches**.
- `grep -rn "document.|window.|setTimeout|setInterval|new Function|Function("` in 7 PCP component files → **0 matches**.
- `grep -rn "AuthProviderMissingError"` in `src/` → 11 matches (declaration + 2 wirings + comments + import statements; useProfile NOT wired).
- `grep -rn "localStorage"` in `src/core/device-id.ts` → 4 matches, all in comments (verified).
- `grep -rn "BROWSER_SMOKE_ENABLED"` in `.github/workflows/` → 4 matches (2 conditional gates + 2 explanatory comments).
- `grep -rn "eslint-plugin-react-hooks"` in `pnpm-lock.yaml` → version 5.2.0 with sha512 integrity hash.

**Read-only.** No source modifications. All findings cite `file:line` with quoted strings ≤ 15 words.

---

## 12. Final assessment

**rc.6 SHIP-CONFIRMED at score 9.0 / 10.**

Net delta vs rc.4: +0.4. Two formerly-open Highs are closed (H4 + NL7) with CI automation in place to prevent recurrence (`scripts/verify-version-sync.ts` + `.githooks/pre-push` + constant-time HMAC compare with correct algorithmic shape). The rc.5 + rc.6 deltas introduce **zero** new runtime/source-tree security findings. The single new finding (INFO-1) is a comment/documentation drift in `src/errors.ts:24-26` that has zero security implication.

The remaining open Highs (H2 — DPoP soft-fallback; H3 — same-origin XSS oracle) are unchanged from rc.4 and are by design — H2 is gated on the BFF enforcement window opening, and H3 is the fundamental browser-cookie-in-page architecture that requires either iframe-sandboxing or the page-level Trusted Types CSP that the consumer app is responsible for. Neither is blocking GA; both are tracked.

The Quick-win bundle (R1 + R2 + R3 = ~30 min) would close all three trivial-effort carry-overs at near-zero cost and lift the score one more notch in the GA audit.

---

*Audit performed read-only against `src/` v1.1.0-rc.6 (commit `80ad904`, tag `v1.1.0-rc.6`). 2026-05-08.*
