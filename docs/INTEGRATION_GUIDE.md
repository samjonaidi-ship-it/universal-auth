# Integration Guide | `@samjonaidi-ship-it/universal-auth` | v1.1.0-rc.7 | 2026-05-08 | BB

> **Read first**: [`CREW_UX_PRINCIPLES.md`](./CREW_UX_PRINCIPLES.md). BB
> Express users wear gloves and have dirty hands. Every UX decision in
> this SDK is filtered through that constraint. If your integration
> requires the user to type, scroll precisely, or hit a small target
> repeatedly, you're doing it wrong.

How to add `@samjonaidi-ship-it/universal-auth` to a Bainbridge Builders consumer app (CalExp5/BB_Express, ControlTower SPA, future Customer Portal, future Buddy Console). Spec citations point to `BB_UNIVERSAL_AUTH_SDK_SPEC.md v1.6.0`.

**v1.0.1 changes affecting consumers:**
- Domain consolidation per D20: `cookieDomain` defaults to `.buildwithbainbridge.com`; `apiBaseUrl` defaults to `https://api.buildwithbainbridge.com` (cutover 2026-05-03).
- `setSession` moved to `@samjonaidi-ship-it/universal-auth/internal` subpath. Existing imports from the main barrel emit a one-time `console.warn` deprecation; v1.1 retires them.
- At-rest refresh-token encryption now uses a non-extractable random AES-256-GCM CryptoKey (handle persisted in IDB). Legacy ciphertext from v1.0.0 is wiped on first v1.0.1 boot — users see one re-sign-in. No code change required by consumers.
- Cross-tab refresh coalescing via `navigator.locks` (replaces former SharedWorker plan). No API change.
- `Retry-After` header honored on offline queue 429 responses. No API change.

**v1.0.2 changes affecting consumers (2026-05-02 — Lane 2 hardening):**
- Rcodex security pass — 31 internal bugs fixed (token-manager invalidate, settings-sync changed_keys, storage clearAllSessionState, session-watcher revoke event, entitlements input guards, etc.).
- `<ConsentVersionWatcher>` gained WCAG 2.1 SC 2.1.2 focus trap; `<ContactInfoForm>` accepts `required?: boolean`; `<VehicleSection>` adds submit-time validation with `aria-invalid` / `role="alert"`.
- No API breaks. Drop-in upgrade from v1.0.1.

**v1.0.3 changes affecting consumers (2026-05-03 — scope rename):**
- Package renamed `@bainbridgebuilders/universal-auth` → `@samjonaidi-ship-it/universal-auth`. Bit-identical runtime; only the import path changes.
- Update `package.json` + `.npmrc` scope key + every `import` site (see CHANGELOG v1.0.3 for diff). Repo transferred to `samjonaidi-ship-it/universal-auth`.

**v1.0.4 changes affecting consumers (2026-05-04 — additive):**
- New `X-Device-Id: <32-char hex>` header on authenticated requests (anonymous endpoints skip it). Sourced from memoized `getOrCreateDeviceId()`. Additive — no existing contract changes.
- `useImpersonation()` return value gains `lastDriftEvent: ImpersonationDriftEvent | null` for surfacing `impersonation.local_clear_drift` events. New imperative `onLocalClearDrift(listener)` export.
- 614/614 tests pass; branch coverage threshold restored to 85%.

**v1.1.0-rc.5 changes affecting consumers (2026-05-08 — first publishable v1.1):**

The v1.1 line is the largest API surface expansion since v1.0.0. rc.5 = rc.4 + 7 audit-debt items closed; consumers should upgrade rc.1 → rc.5 directly (rc.2/rc.3/rc.4 were unpublished internal milestones).

NEW capabilities, all opt-in unless noted:

1. **DPoP sender-bound tokens (RFC 9449).** Every authenticated request signs a per-request proof JWT with a non-extractable EC P-256 key. Includes `ath` claim binding the proof to the access token (rc.2 P0-3). Server-side enforcement happens transparently via `cnf.jkt` round-trip verify on every refresh (rc.2 P1-G). No consumer code change — flip default via `useDpop: 'always'` in your config when ready (currently `'auto'`).
2. **ABAC checks: `useAccess` + `useAccessBulk` hooks + imperative `canAccess(...)`.** Per ABAC_DESIGN_v1.0.md §5.1 + §8.1. Stale-while-revalidate cache, 60s TTL, multi-tab cache invalidation via `navigator.locks`. Example:
   ```tsx
   import { useAccess } from '@samjonaidi-ship-it/universal-auth/react';
   const { allowed, loading } = useAccess(
     { resource_type: 'project', id: 'p-123' },
     'edit'
   );
   ```
3. **DelegationCenter component + `useDelegatedGrants` hook.** Per DELEGATION_CENTER_DESIGN_v1.0.md (LOCKED 2026-05-05). Four-tab UX: Active / Granted to Me / History / Effective Access. Wire it inside `<AuthProvider>`:
   ```tsx
   import { DelegationCenter } from '@samjonaidi-ship-it/universal-auth/react';
   <DelegationCenter scopeCatalog={crewScopeCatalog} />
   ```
4. **`<SignInForm defaultDestination + onDestinationChange>`.** Pre-fill the destination field instead of forking the component (rc.2 P1-C):
   ```tsx
   <SignInForm
     defaultDestination={lastUsedDestination}
     onDestinationChange={(d) => persistDestination(d)}
     onSubmit={...}
   />
   ```
5. **Component theming surface.** All 25 React components now accept `className?: string` AND `style?: CSSProperties`. Form-style components (SignInForm, CodeEntry, ContactInfoForm, PersonaFieldsForm) also accept a `classNames?: { root, label, input, error, button }` slot map. 6 user-facing components are wrapped in `forwardRef`:
   ```tsx
   const formRef = useRef<HTMLFormElement>(null);
   <SignInForm
     ref={formRef}
     classNames={{ button: 'tw-bg-bb-red-500 tw-rounded-full' }}
     style={{ minWidth: 320 }}
     onSubmit={...}
   />
   ```
6. **`AbortSignal` threading on every public async function.** Every flow + ABAC + entitlements + settings-sync function now accepts an optional `signal?: AbortSignal`. Plumb it from TanStack Query, SWR, or React Strict Mode cleanups:
   ```ts
   await requestCode(destination, { signal: abortController.signal });
   await listDelegatedGrants({ signal });
   ```
7. **`config.onError` observability hook.** Soft-fail sites (DPoP fallback, legacy refresh response, no `navigator.locks`, `cnf.jkt` mismatch, CodeEntry generic-error) route through this hook instead of raw `console.warn`. Wire it once in your `initUniversalAuth(...)` call:
   ```ts
   await initUniversalAuth({
     apiBaseUrl: 'https://api.buildwithbainbridge.com',
     appId: 'crew-calendar',
     onError: (err) => Sentry.captureException(err),
   });
   ```
8. **`hydrateSettings(signal?)` (rc.3).** Public method on `useSettingsSync()` to force a server-fetch + local hydrate. Useful for refresh-on-window-focus patterns.
9. **Person-Centric Profile (PCP) hook + components (rc.5 — D1 fix).** `useIdentity()` hook returns the canonical PCP envelope (addresses, vehicles, gear, property, compliance docs, media gallery). Built since v1.0.0-rc.4 but only re-exported in rc.5:
   ```tsx
   import { useIdentity, MediaGallery, AddressInput, VehicleSection } from '@samjonaidi-ship-it/universal-auth/react';
   const { identity, addAddress, addResource, addMedia } = useIdentity();
   ```
10. **`AuthErrorCode` literal union + `AuthProviderMissingError` (rc.5 — D7+D8).** `AuthSdkError.code` is now a typed literal union, enabling exhaustive `switch` over canonical codes. Hooks called outside `<AuthProvider>` throw `AuthProviderMissingError` instead of plain `Error` so consumers can `instanceof`-check.
11. **Bundle wins (rc.2 P1-F + closure-aware budgets).** React subpath dropped 64.5 KB → 36.21 KB gzip (`libphonenumber-js` lazy-loaded). Profile subpath 44.2 KB → 15.29 KB. **Breaking change in rc.2:** `validatePhone` is now `async` because of the lazy-load; if you call it directly you must `await`.
12. **Production-mode safety: `assertApiBaseUrlSafety` (rc.2 P1-I).** `apiBaseUrl` must be HTTPS in production; if `cookieDomain` is set, `apiBaseUrl`'s host must share its registrable domain. Throws synchronously from `initUniversalAuth(...)` on violation.
13. **Entitlements localStorage HMAC tag (rc.2 P1-J).** Cache blob is now `{ data, sig: HMAC-SHA-256(data) }` with a non-extractable HMAC key in IDB. Tampered envelopes are detected (constant-time compare in rc.5) and the cache is cleared. Migration is automatic on first read — legacy bare-CacheShape blobs are accepted once and re-signed on next save.
14. **Device ID recompute every boot (rc.2 P1-K).** No longer cached in localStorage. SHA-256 of `navigator.userAgent` recomputed once per page load. XSS attacker can't overwrite the cached value to evade server-side anomaly detection.
15. **WebAuthn UV/UP enforcement (rc.2 P1-H).** Pre-call: refuses `userVerification: 'discouraged'`. Post-call: parses `authenticatorData` flags byte and verifies UV bit set when policy was preferred or required. NIST SP 800-63B AAL2 floor.

Migration recipe rc.1 → rc.5 (typical consumer):
- `npm install @samjonaidi-ship-it/universal-auth@1.1.0-rc.5` (or update the tarball reference)
- Add `await` to any direct `validatePhone(...)` call (P1-F break)
- Optionally wire `config.onError` for soft-fail observability
- Optionally adopt `defaultDestination` / `classNames` / `forwardRef` / `signal?` patterns
- No code change required for the rest of the v1.1 surface — every other addition is opt-in.

**Audience:** Sam (CalExp5 cutover), future ControlTower implementer, third-party integrator.

**Tone:** copy-paste-able. Each section is a self-contained "do this".

---

## 0. Prerequisites

| What | Where | Notes |
|---|---|---|
| Node 20+ | local + CI | required for ESM + Web Crypto |
| pnpm, npm, or yarn | local + CI | any modern package manager |
| GitHub Packages auth token | `.npmrc` | personal access token with `read:packages` scope (see §1) |
| CT BFF dev branch with migrations 046-058 applied | Neon | required for integration tests; run `pnpm bff:migrate` in `samjonaidi-ship-it/BB_ControlTower` |
| App registered in `ct_bff.apps` table | CT BFF | `app_id`, `event_types[]` populated. **Hard prereq before flipping the feature flag** (see §6). |

---

## 1. `npm install` + GitHub Packages scope auth

The package is published private on GitHub Packages registry. Consumer `.npmrc`:

```ini
@samjonaidi-ship-it:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

`GITHUB_PACKAGES_TOKEN` is a personal access token with `read:packages` scope. In CI, set as a GitHub Actions secret. Locally, store in `~/.npmrc` (NOT committed).

Then:

```bash
pnpm add @samjonaidi-ship-it/universal-auth
# or:
npm install @samjonaidi-ship-it/universal-auth
```

Optional CSS:

```ts
import '@samjonaidi-ship-it/universal-auth/react/styles.css';
```

Subpath imports (tree-shaking-friendly):

```ts
import { initUniversalAuth, getAuth } from '@samjonaidi-ship-it/universal-auth';
import { AuthProvider, useAuth } from '@samjonaidi-ship-it/universal-auth/react';
import { uploadAvatar } from '@samjonaidi-ship-it/universal-auth/profile';
```

---

## 2. Register the app + declared event types in CT BFF

**This is a hard prereq before flipping `USE_UNIVERSAL_AUTH=true` in production.** Per spec §6.3, unknown event types are server-rejected with `UNKNOWN_EVENT_TYPE` and the SDK silently drops them — that's silent data loss if you skip this step.

The actual schema lives in `ct_bff.apps` (per `BB_ControlTower/bff/migrations/053_app_registry.sql` + `059_v1_namespace_tables.sql`). The primary key is `id` (TEXT, not UUID), and `event_types` is a `TEXT[]` array column on the same row — there is **no** separate `app_events` registry table; `ct_bff.app_events` is the runtime ingestion target, not a registry.

Run on CT BFF (ONE statement, idempotent — `ON CONFLICT` overwrites event_types but preserves status + secrets):

```sql
INSERT INTO ct_bff.apps
  (id, display_name, app_kind, event_types, allowed_personas)
VALUES (
  'bb_express',                               -- TEXT primary key
  'BB Express (CalExp5)',                     -- display_name
  'consumer',                                 -- app_kind: 'consumer'|'admin'|'agent'|'iot'
  ARRAY[
    -- Auth lifecycle
    'enrollment.code_sent','enrollment.consent_recorded',
    'enrollment.completed','enrollment.code_failed',
    -- Login + session
    'login.success','login.failure','session.heartbeat',
    'session.revoked','session.expired',
    -- Identity
    'identity.employee_linked',
    -- Settings + permission
    'settings.changed','settings.restored',
    'sync.conflict','sync.failed','sync.flushed',
    'permission.granted','permission.denied','permission.revoked',
    -- Profile
    'profile.updated','profile.avatar_uploaded','profile.avatar_cleared',
    -- App-specific (timesheet, field events, etc.) — ADD YOUR APP'S EMISSIONS
    'timesheet.submitted','timesheet.synced','timesheet.failed',
    'photo.uploaded','photo.synced','photo.deleted'
  ]::text[],
  ARRAY['crew','admin']::text[]               -- allowed_personas (NULL = all allowed)
)
ON CONFLICT (id) DO UPDATE SET
  display_name     = EXCLUDED.display_name,
  app_kind         = EXCLUDED.app_kind,
  event_types      = EXCLUDED.event_types,
  allowed_personas = EXCLUDED.allowed_personas,
  updated_at       = now();
  -- Note: status is intentionally NOT updated here (so admin-disabled apps
  -- aren't revived on redeploy — see migration 059 + audit F3).
```

**Verification:** SDK calls `POST /events/v1/ingest` with each declared type — returns 200 with all events accepted. Run smoke check after registration:

```bash
curl -X POST https://api.buildwithbainbridge.com/events/v1/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"events":[{
    "event_type":"session.heartbeat",
    "app_id":"bb_express",
    "client_ts":"2026-04-28T20:00:00Z",
    "sdk_version":"1.0.0",
    "protocol_version":"v1",
    "payload":{}
  }]}'
```

Expected response: `{"accepted":1,"rejected":0,"protocol_version":"v1"}`.

If you see `{"accepted":0,"rejected":1,"details":[{"reason":"UNKNOWN_EVENT_TYPE",...}]}`, that event_type isn't in your `event_types[]` array — re-run the INSERT above with the missing type added.

---

## 3. Preconnect hint (perf — spec §8.1)

Add to `<head>` of every consumer-app HTML entry, BEFORE the SDK loads:

```html
<link rel="preconnect" href="https://api.buildwithbainbridge.com">
<link rel="dns-prefetch" href="https://api.buildwithbainbridge.com">
```

Saves ~100-300ms on cold first auth call (TLS handshake parallelizes with bundle download).

---

## 4. CSP (Content Security Policy)

The SDK is CSP-compatible. Default-deny CSP with explicit allowlist works:

```http
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://api.buildwithbainbridge.com;
  img-src 'self' data: https://*.r2.cloudflarestorage.com;  /* TODO: confirm canonical avatar bucket host post-D20 (legacy: bb-profile-avatars.bainbridgebuilders.com) */
  worker-src 'self' blob:;
  script-src 'self' 'nonce-${NONCE}';
  style-src 'self' 'nonce-${NONCE}';
```

**Required:**
- `connect-src` must include the CT BFF origin
- `worker-src` must include `'self'` (Web Worker for crypto) + `blob:` (some bundlers blob-URL workers)
- `img-src` must include the R2 avatar bucket origin if `<AvatarPicker>` is used
- **No `eval`, no inline scripts** — SDK never uses these (verified by `scripts/verify-bundle.ts`)

If CSP blocks the Web Worker, the SDK falls back to inline crypto automatically (graceful degradation).

---

## 5. Cookie domain override (non-`*.buildwithbainbridge.com` consumers)

The SDK defaults to `cookieDomain: '.buildwithbainbridge.com'` so the session cookie is shared across BB Express, ControlTower, etc.

**If your app is on a different root domain** (e.g., a partner-branded portal at `mycompany.com`), set:

```ts
await initUniversalAuth({
  apiBaseUrl: 'https://api.buildwithbainbridge.com',
  appId: 'partner_portal',
  cookieDomain: '.mycompany.com',  // override
});
```

The former demo at `auth-sdk-demo.bainbridgebuilders.com` is **retired** as of 2026-05-01 (D20). `demo/` source survives in the repo for local `pnpm demo:dev` only.

---

## 5a. Crew sign-in pattern — wrap `<SignInForm>` for low-touch returning-user flow

For consumer apps with field crew users (gloves, dirty hands — see
[`CREW_UX_PRINCIPLES.md`](./CREW_UX_PRINCIPLES.md)), wrap the bare
`<SignInForm>` with a recent-users picker so returning users sign in
in **one tap** instead of re-typing their email.

Reference implementation: `CalExp5/src/components/auth/CrewSignInGate.jsx`.

**Pattern**:

1. After every successful sign-in, persist `{email, display_name,
   initials, badgeColor}` to `localStorage('bb-recent-users')` (max 5
   entries, oldest evicted on overflow).
2. On mount, read that list. If non-empty, render avatar tiles as the
   primary surface; tap a tile → call `useAuth().requestCode({
   destination: email, channel: 'email', appId: 'bb_express' })`
   directly → render `<CodeEntry>` with the destination shown.
3. Provide a "Use a different email" link that falls through to the
   bare `<SignInForm>` for first-time / shared-device cases.
4. Provide a "×" forget-this-user button on each tile (privacy +
   shared-device hygiene).

Why a custom wrapper instead of a SignInForm prop? `<SignInForm>` v1.0
doesn't accept a `defaultDestination` prop — its destination input is
internal. v1.1 will likely add this, at which point the wrapper can
shrink. For now, the wrapper composes `useAuth().requestCode + signIn`
with `<CodeEntry>` directly when the email is already known.

**Required CSS**: tap targets must be ≥88×88 px for the user tiles.
See `CalExp5/src/index.css` `.bb-user-tile` block for the canonical
implementation.

---

## 5b. WebAuthn enrollment — known weakness (v1.0)

The current `/auth/v1/enroll/activate` flow accepts a WebAuthn credential payload (`{attestationObject, clientDataJSON}`) WITHOUT first calling `/auth/v1/passkey/register/options` to generate + store a server-side challenge. The CT BFF therefore falls back to extracting the challenge from `clientDataJSON` only — there's no server-stored challenge to bind against.

**Practical impact:** an attacker who can capture a `clientDataJSON` from another flow could replay it during enrollment. Not a v1.0 cutover blocker for the 14 internal crew, but flagged for v1.1 hardening (audit reference: F-N12 in `LOOKBACK_2026-04-29-overnight.md`).

**v1.1 plan:** SDK enroll-flow will be extended to call `/auth/v1/passkey/register/options` (passing `identityId` from the verify response) before invoking `navigator.credentials.create()`. CT BFF will then drop the `clientDataJSON`-only fallback in `verifyRegistrationAttestation` and require a stored challenge.

**Workaround for v1.0:** prefer the `'pin'` enrollment method during the cutover window. The `'webauthn'` path works but with the security caveat above.

---

## 5c. Consent re-prompt on policy version bump (recommended)

When you bump a `consent_documents` row's `policy_version` server-side (say, your Privacy Policy gets revised), users who already accepted the old version need to be re-prompted. The SDK ships `<ConsentVersionWatcher>` — wrap it around your authenticated app routes:

```tsx
import {
  AuthProvider,
  ConsentVersionWatcher,
} from '@samjonaidi-ship-it/universal-auth/react';

export function App() {
  return (
    <AuthProvider>
      <ConsentVersionWatcher>
        <Routes />
      </ConsentVersionWatcher>
    </AuthProvider>
  );
}
```

What it does:
- On `status === 'authenticated'`, fetches `getConsentDocuments(audience)` + `listConsents()`
- Compares each REQUIRED document's `policy_version` against the user's accepted version (semver-ish compare)
- If any are stale, renders a modal-style overlay with `<ConsentScreen required={[...stale]}>` blocking the rest of the app until accepted
- Optional consents are NOT re-prompted here — they belong in `<ConsentCenter>` settings UI
- Persona-change events (e.g. Stripe webhook flips `client → homeowner`) automatically re-evaluate via `activePersona` change

Failure mode: fail-open with one transient retry per spec §11. Server-side `CONSENT_REQUIRED` enforcement on protected endpoints is the actual gate; the SDK watcher is UX-only.

Custom audience override (rare):
```tsx
<ConsentVersionWatcher audience="homeowner" heading="Updated terms">
  <Routes />
</ConsentVersionWatcher>
```

---

## 6. Feature flag pattern (gradual rollout)

Recommended pattern for migrating an existing app:

```ts
// src/config.ts (consumer app)
export const USE_UNIVERSAL_AUTH =
  import.meta.env.VITE_USE_UNIVERSAL_AUTH === 'true';
```

```tsx
// src/App.tsx
import { AuthProvider } from '@samjonaidi-ship-it/universal-auth/react';
import { LegacyAuthProvider } from './legacy/auth/LegacyAuthProvider';
import { USE_UNIVERSAL_AUTH } from './config';

export function App() {
  const Provider = USE_UNIVERSAL_AUTH ? AuthProvider : LegacyAuthProvider;
  return (
    <Provider {...providerProps}>
      <Routes />
    </Provider>
  );
}
```

Roll forward in stages:
1. **Day -7 to -1**: ship the SDK behind the flag, default `false`. Bake on staging.
2. **Day 0 (cutover)**: flip flag in production. Watch Sentry for 1 hour. **30-second rollback**: flip back to `false`, redeploy.
3. **Day +7**: if no regressions, delete the legacy `Provider` + flag.

Per spec §13.4, sessions issued under the SDK remain valid 90 days after rollback (refresh tokens are server-side records, independent of the client SDK version).

---

## 7. Rollback playbook

**Trigger conditions:**
- Sentry error rate >2× baseline in the first hour after cutover
- p95 auth latency >1500ms (vs ≤800ms target per spec §7.1)
- Any unrecoverable IDB-related crash on >1% of sessions

**Steps (target: 30 seconds):**

1. **Flip the feature flag** in production env (Railway, Vercel, etc.):
   ```
   VITE_USE_UNIVERSAL_AUTH=false
   ```
2. **Trigger redeploy** (most platforms auto-redeploy on env change).
3. **Verify** by hitting the app: legacy auth flow should fire. Check Sentry: errors stop within ~30s.
4. **File an incident issue** in the SDK repo with the Sentry snapshot. Don't immediately re-roll until the root cause is fixed.

**Data integrity post-rollback:** sessions issued under the SDK remain valid for 90 days (server-side refresh tokens are independent of client). Users see no logout.

---

## 8. Observability hookup

### Sentry shim (per spec §12.3)

```ts
import * as Sentry from '@sentry/react';

await initUniversalAuth({
  apiBaseUrl: 'https://api.buildwithbainbridge.com',
  appId: 'bb_express',
  onError: (err) => Sentry.captureException(err, { tags: { source: 'universal-auth' } }),
});
```

### Dev panel — `getSDKMetrics()` (per spec §12.2)

```tsx
import { getSDKMetrics } from '@samjonaidi-ship-it/universal-auth';

function DevPanel() {
  const [metrics, setMetrics] = useState(null);
  useEffect(() => {
    const t = setInterval(() => getSDKMetrics().then(setMetrics), 1000);
    return () => clearInterval(t);
  }, []);

  if (metrics === null || import.meta.env.PROD) return null;
  return (
    <pre style={{ position: 'fixed', bottom: 0, right: 0 }}>
      {JSON.stringify(metrics, null, 2)}
    </pre>
  );
}
```

Renders live values for: token refresh count + p95 latency, event batch count, error count + last error, offline + event queue depths.

---

## CalExp5-specific cutover notes (Block 7 Days 24-27)

Per spec §13.3 and the implementation plan:

| Day | Step | Spec §       |
|-----|------|--------------|
| 24  | Pre-work: fix CalExp5 port collision (`server.js` PORT vs CT_BFF_URL); delete `device_credentials` IDB store; delete `RegisterFlow.jsx`; consolidate WebAuthn to single `@simplewebauthn/browser`; add missing watermarks. Then `npm install @samjonaidi-ship-it/universal-auth`. Wrap `App` in `<AuthProvider>`. Replace `LoginScreen.jsx` with `<SignInForm>` behind `USE_UNIVERSAL_AUTH=false`. | §13.3 + alignment audit |
| 25  | SDK takes over refresh-token IDB + offline queue. Deprecate `api-base.js`. Refactor `settingsSlice.js` → thin wrapper over `useSettingsSync()`. Register `bb_express` in `ct_bff.apps` (§2 above). Flip flag to `true`. Delete legacy auth (api-base.js, auth.js, indexed-db.js, authStore.js, LoginScreen.jsx, EnrollmentFlow.jsx, BiometricButton.jsx, RegisterFlow.jsx). | §13.3 + §6.3 |
| 26  | Profile module migration: `<ProfileSetupScreen>` post-enrollment when `needsSetup`; replace `/profile/me` route with `<ProfileSetupScreen mode="edit" />`; wire FirstLaunchScreen permissions to `usePermissionGrants()`; cleanup. Run one-shot data backfill: for every identity with `primary_employee_id`, seed `ct_bff.identity_profile` from Bridge `cal_assets.metadata`. Idempotent — re-runnable. | §13.5.2 + §13.5.3 |
| 27  | E2E smoke in staging → production cutover → 24h monitoring window. | §13.4 |

Expected line delta: **−1,800 / +200** per spec §13.2 (replaces ~1,800 lines of hand-rolled CalExp5 auth with ~200 lines of SDK-wired code).

---

## Got stuck?

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` 401 | GitHub token missing `read:packages` scope | regenerate token at github.com/settings/tokens with `read:packages` |
| `[@samjonaidi-ship-it/universal-auth] HTTP client called before configureClient()` | forgot to `await initUniversalAuth(...)` before first SDK call | move `initUniversalAuth` to top of app entry, before any `<AuthProvider>` |
| Cookie not shared between subdomains | CSP blocked Set-Cookie OR cookieDomain wrong | check Network tab for `Set-Cookie`; verify domain matches consumer app's root |
| SW registration fails | consumer CSP missing `worker-src 'self' blob:` | update CSP per §4 |
| `UNKNOWN_EVENT_TYPE` errors flooding logs | event types not registered in `ct_bff.app_events` | run §2 SQL |
| Tests fail with ENOTFOUND ct-bff.test | docker stack not running | `docker compose -f test/integration/docker-compose.test.yml up -d` |

For anything else, file an issue in `samjonaidi-ship-it/universal-auth` with: SDK version, consumer app + version, network HAR, Sentry trace.

---

## 9. Hardening checklist for SDK consumers (v1.0.1+)

The SDK does its part to keep tokens safe (encrypted IDB, non-extractable CryptoKey, off-main-thread crypto, Web Locks coordination), but **the consumer app's HTML envelope is half the threat model**. Apply this checklist on every BB consumer app.

### 9.1 Content Security Policy (required)

Modern, nonce-based CSP with `'strict-dynamic'` is the 2025 baseline ([web.dev security headers](https://web.dev/articles/security-headers)). At minimum:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'nonce-RANDOM_PER_REQUEST' 'strict-dynamic';
  style-src 'self' 'nonce-RANDOM_PER_REQUEST';
  img-src 'self' data: https://*.r2.cloudflarestorage.com;
  font-src 'self' data:;
  connect-src 'self' https://api.buildwithbainbridge.com;
  worker-src 'self' blob:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  object-src 'none';
  upgrade-insecure-requests;
```

Notes:
- The SDK ships zero inline scripts (verified by `scripts/verify-bundle.ts`); `'strict-dynamic'` is safe.
- `worker-src 'self' blob:` is required because `crypto-worker.ts` is loaded as a Web Worker. Without it, the Worker fails silently and the SDK falls back to main-thread crypto (functional but slower).
- `connect-src` must allow your CT BFF origin (`api.buildwithbainbridge.com` post-D20 cutover, `ct-bff.bainbridgebuilders.com` pre-cutover, or your dev BFF for local development).
- `img-src` + your R2 avatar CDN if you upload user avatars.

### 9.2 Trusted Types (recommended)

`Content-Security-Policy: require-trusted-types-for 'script'` blocks trivial DOM-XSS sinks ([MDN Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API)). Roll out in **report-only** first to surface any policy violations from your own code:

```http
Content-Security-Policy-Report-Only:
  require-trusted-types-for 'script';
  trusted-types default;
  report-to csp-endpoint;
```

The SDK does not call `innerHTML`, `eval`, or `new Function()` (verified by source audit). If your `Content-Security-Policy-Report-Only` log is clean for 7 days, promote to enforcing.

### 9.3 Cross-Origin-Opener-Policy + Cross-Origin-Embedder-Policy (recommended)

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Enables cross-origin isolation (prerequisite for `SharedArrayBuffer` and high-precision timers if you ever need them). **The SDK uses redirect flows + BFF — it has no popup-based OAuth flow** that would conflict with strict COOP. Set `same-origin` safely. ([web.dev COOP/COEP](https://web.dev/articles/coop-coep))

If your app embeds third-party iframes (analytics, payments, etc.), use `same-origin-allow-popups` instead of `same-origin`, or set `Cross-Origin-Embedder-Policy: credentialless` (broader compatibility).

### 9.4 HSTS + preconnect (required)

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Submit to the [HSTS preload list](https://hstspreload.org/) once you've verified the policy works for 30+ days.

In your HTML `<head>`:

```html
<link rel="preconnect" href="https://api.buildwithbainbridge.com" crossorigin>
<link rel="dns-prefetch" href="https://api.buildwithbainbridge.com">
```

This shaves ~100-200ms off the first auth handshake on cold loads.

### 9.5 Other essentials

```http
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(self), microphone=(self), geolocation=(self), payment=()
```

The SDK sets `redirect: 'manual'` and `referrerPolicy: 'strict-origin-when-cross-origin'` on every fetch, so the consumer's `Referrer-Policy` is mostly cosmetic for SDK-issued requests, but should be set anyway for non-SDK code on the page.

### 9.6 Subresource integrity for cross-origin scripts (if any)

If you load any third-party JS (analytics, monitoring) via `<script src="https://...">`, use `integrity="sha384-..."` and `crossorigin="anonymous"`. Native browser SRI ([MDN SRI](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)).

### 9.7 SDK-specific config knobs

| Knob | Default (v1.0.1) | When to change |
|---|---|---|
| `cookieDomain` | `.buildwithbainbridge.com` | Override for non-`buildwithbainbridge.com` deployments (e.g., consumer apps on a tenant's own domain) |
| `apiBaseUrl` | `https://api.buildwithbainbridge.com` | Override for staging / e2e environments |
| `mode` | `'production'` | Switch to `'development'` / `'test'` / `'e2e'` per spec §10 |
| `offline.maxQueueSize` | 1000 | Lower for memory-constrained devices; spec §9.4 evicts oldest on overflow with `sync.failed` event |

### 9.8 Verification

After deploy, run:

```bash
# Headers check
curl -sI https://your-app.example.com | grep -E '^(content-security-policy|strict-transport|x-frame-options|cross-origin-opener|cross-origin-embedder)'

# Mozilla Observatory
# https://observatory.mozilla.org/analyze/your-app.example.com
```

Aim for an A+ grade. The SDK + this checklist together should give you a high score by default.
