# Integration Guide | `@bainbridgebuilders/universal-auth` | v1.0.0-rc.2 | 2026-04-28 | BB

How to add `@bainbridgebuilders/universal-auth` to a Bainbridge Builders consumer app (CalExp5/BB_Express, ControlTower SPA, future Customer Portal, future Buddy Console). Spec citations point to `BB_UNIVERSAL_AUTH_SDK_SPEC.md v1.4.3`.

**Audience:** Sam (CalExp5 cutover), future ControlTower implementer, third-party integrator.

**Tone:** copy-paste-able. Each section is a self-contained "do this".

---

## 0. Prerequisites

| What | Where | Notes |
|---|---|---|
| Node 20+ | local + CI | required for ESM + Web Crypto |
| pnpm, npm, or yarn | local + CI | any modern package manager |
| GitHub Packages auth token | `.npmrc` | personal access token with `read:packages` scope (see §1) |
| CT BFF dev branch with migrations 046-058 applied | Neon | required for integration tests; run `pnpm bff:migrate` in `BainbridgeBuilders/control-tower` |
| App registered in `ct_bff.apps` table | CT BFF | `app_id`, `event_types[]` populated. **Hard prereq before flipping the feature flag** (see §6). |

---

## 1. `npm install` + GitHub Packages scope auth

The package is published private on GitHub Packages registry. Consumer `.npmrc`:

```ini
@bainbridgebuilders:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

`GITHUB_PACKAGES_TOKEN` is a personal access token with `read:packages` scope. In CI, set as a GitHub Actions secret. Locally, store in `~/.npmrc` (NOT committed).

Then:

```bash
pnpm add @bainbridgebuilders/universal-auth
# or:
npm install @bainbridgebuilders/universal-auth
```

Optional CSS:

```ts
import '@bainbridgebuilders/universal-auth/react/styles.css';
```

Subpath imports (tree-shaking-friendly):

```ts
import { initUniversalAuth, getAuth } from '@bainbridgebuilders/universal-auth';
import { AuthProvider, useAuth } from '@bainbridgebuilders/universal-auth/react';
import { uploadAvatar } from '@bainbridgebuilders/universal-auth/profile';
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
curl -X POST https://ct-bff.bainbridgebuilders.com/events/v1/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"events":[{
    "event_type":"session.heartbeat",
    "app_id":"bb_express",
    "client_ts":"2026-04-28T20:00:00Z",
    "sdk_version":"1.0.0-rc.2",
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
<link rel="preconnect" href="https://ct-bff.bainbridgebuilders.com">
<link rel="dns-prefetch" href="https://ct-bff.bainbridgebuilders.com">
```

Saves ~100-300ms on cold first auth call (TLS handshake parallelizes with bundle download).

---

## 4. CSP (Content Security Policy)

The SDK is CSP-compatible. Default-deny CSP with explicit allowlist works:

```http
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://ct-bff.bainbridgebuilders.com;
  img-src 'self' data: https://bb-profile-avatars.bainbridgebuilders.com;
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

## 5. Cookie domain override (non-`*.bainbridgebuilders.com` consumers)

The SDK defaults to `cookieDomain: '.bainbridgebuilders.com'` so the session cookie is shared across BB Express, ControlTower, demo, etc.

**If your app is on a different root domain** (e.g., a partner-branded portal at `mycompany.com`), set:

```ts
await initUniversalAuth({
  apiBaseUrl: 'https://ct-bff.bainbridgebuilders.com',
  appId: 'partner_portal',
  cookieDomain: '.mycompany.com',  // override
});
```

The demo at `auth-sdk-demo.bainbridgebuilders.com` falls under the default and does NOT need the override.

---

## 5b. WebAuthn enrollment — known weakness (v1.0)

The current `/auth/v1/enroll/activate` flow accepts a WebAuthn credential payload (`{attestationObject, clientDataJSON}`) WITHOUT first calling `/auth/v1/passkey/register/options` to generate + store a server-side challenge. The CT BFF therefore falls back to extracting the challenge from `clientDataJSON` only — there's no server-stored challenge to bind against.

**Practical impact:** an attacker who can capture a `clientDataJSON` from another flow could replay it during enrollment. Not a v1.0 cutover blocker for the 14 internal crew, but flagged for v1.1 hardening (audit reference: F-N12 in `LOOKBACK_2026-04-29-overnight.md`).

**v1.1 plan:** SDK enroll-flow will be extended to call `/auth/v1/passkey/register/options` (passing `identityId` from the verify response) before invoking `navigator.credentials.create()`. CT BFF will then drop the `clientDataJSON`-only fallback in `verifyRegistrationAttestation` and require a stored challenge.

**Workaround for v1.0:** prefer the `'pin'` enrollment method during the cutover window. The `'webauthn'` path works but with the security caveat above.

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
import { AuthProvider } from '@bainbridgebuilders/universal-auth/react';
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
  apiBaseUrl: 'https://ct-bff.bainbridgebuilders.com',
  appId: 'bb_express',
  onError: (err) => Sentry.captureException(err, { tags: { source: 'universal-auth' } }),
});
```

### Dev panel — `getSDKMetrics()` (per spec §12.2)

```tsx
import { getSDKMetrics } from '@bainbridgebuilders/universal-auth';

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
| 24  | Pre-work: fix CalExp5 port collision (`server.js` PORT vs CT_BFF_URL); delete `device_credentials` IDB store; delete `RegisterFlow.jsx`; consolidate WebAuthn to single `@simplewebauthn/browser`; add missing watermarks. Then `npm install @bainbridgebuilders/universal-auth`. Wrap `App` in `<AuthProvider>`. Replace `LoginScreen.jsx` with `<SignInForm>` behind `USE_UNIVERSAL_AUTH=false`. | §13.3 + alignment audit |
| 25  | SDK takes over refresh-token IDB + offline queue. Deprecate `api-base.js`. Refactor `settingsSlice.js` → thin wrapper over `useSettingsSync()`. Register `bb_express` in `ct_bff.apps` (§2 above). Flip flag to `true`. Delete legacy auth (api-base.js, auth.js, indexed-db.js, authStore.js, LoginScreen.jsx, EnrollmentFlow.jsx, BiometricButton.jsx, RegisterFlow.jsx). | §13.3 + §6.3 |
| 26  | Profile module migration: `<ProfileSetupScreen>` post-enrollment when `needsSetup`; replace `/profile/me` route with `<ProfileSetupScreen mode="edit" />`; wire FirstLaunchScreen permissions to `usePermissionGrants()`; cleanup. Run one-shot data backfill: for every identity with `primary_employee_id`, seed `ct_bff.identity_profile` from Bridge `cal_assets.metadata`. Idempotent — re-runnable. | §13.5.2 + §13.5.3 |
| 27  | E2E smoke in staging → production cutover → 24h monitoring window. | §13.4 |

Expected line delta: **−1,800 / +200** per spec §13.2 (replaces ~1,800 lines of hand-rolled CalExp5 auth with ~200 lines of SDK-wired code).

---

## Got stuck?

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` 401 | GitHub token missing `read:packages` scope | regenerate token at github.com/settings/tokens with `read:packages` |
| `[@bb/universal-auth] HTTP client called before configureClient()` | forgot to `await initUniversalAuth(...)` before first SDK call | move `initUniversalAuth` to top of app entry, before any `<AuthProvider>` |
| Cookie not shared between subdomains | CSP blocked Set-Cookie OR cookieDomain wrong | check Network tab for `Set-Cookie`; verify domain matches consumer app's root |
| SW registration fails | consumer CSP missing `worker-src 'self' blob:` | update CSP per §4 |
| `UNKNOWN_EVENT_TYPE` errors flooding logs | event types not registered in `ct_bff.app_events` | run §2 SQL |
| Tests fail with ENOTFOUND ct-bff.test | docker stack not running | `docker compose -f test/integration/docker-compose.test.yml up -d` |

For anything else, file an issue in `BainbridgeBuilders/universal-auth` with: SDK version, consumer app + version, network HAR, Sentry trace.
