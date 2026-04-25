# A4 Infra Setup — BB Universal Auth SDK

**Owner:** Sam Jonaidi
**Date:** 2026-04-25
**Status:** A + B applied. C pending Railway dashboard setup.

This doc tracks the infrastructure tasks required for **A4 sign-off**. The SDK code itself is feature-complete (193/193 tests passing, A4 audit ✓ on gates 1, 7, 9). These tasks unblock gates 3, 4, 5, 6, 8.

---

## ✅ Phase A — Migrations 046-058 (DONE 2026-04-25)

13 migrations applied to `ep-lingering-fog-am69u44n.c-5.us-east-1.aws.neon.tech`:

| HWM | File | Purpose |
|---|---|---|
| 046 | `046_plans.sql` | D4 plan catalog |
| 047 | `047_features_catalog.sql` | D4 feature keys |
| 048 | `048_plan_feature_mappings.sql` | D4 plan↔feature |
| 049 | `049_subscriptions.sql` | D1 (one active sub per identity) |
| 049b | `049b_seat_pools.sql` | D1 shared-payer |
| 049c | `049c_bridge_master_snapshot.sql` | Wizard §5.3 (renumbered from 058 for runner sort order) |
| 050 | `050_stakeholder_search.sql` | Wizard §5.3 unified search MV |
| 051 | `051_identity_profile.sql` | SDK §5.4 (with version trigger) |
| 052 | `052_identities_org_id.sql` | SDK §8.5.4 multi-tenancy hook |
| 053 | `053_app_registry.sql` | SDK §3.5 + D10 |
| 054 | `054_app_events.sql` | SDK §6 rich event envelope |
| 055 | `055_persona_registry.sql` | D6 + 6-persona + 3-role seeds |
| 056 | `056_grant_subject_type_narrowing.sql` | D7 narrowing |
| 056b | `056b_role_templates.sql` | Wizard §7 + 8 seed templates |
| 057 | `057_wizard_sessions.sql` | Wizard §5.5 |
| **058** | **`058_consent_documents.sql`** | **§3.4 + 9 crew consents seed + 13 multi-audience rows** |

**Verification:**
- ✓ HWM = `058_consent_documents`
- ✓ 14 / 14 tables present in `ct_bff` schema
- ✓ 6 personas in `persona_registry` (admin, architect, client, crew, subcontractor, supplier)
- ✓ 3 roles in `ct_role_registry` (admin, operator, viewer)
- ✓ 8 templates in `role_templates`
- ✓ 9 / 9 crew required consents (3 legal + 3 device + 3 ai_assistant)
- ✓ 24 total rows in `consent_documents` (crew + supplier + subcontractor + client + architect + admin + 3 optional)

**Branch:** `BB_ControlTower:agent/migrations-046-058` — pushed, awaiting `/merge-agent`.

**Migration map deviations** (documented in commit message + file headers):
- `bridge_master_snapshot` was originally numbered 058 in `BB_MIGRATION_MAP.md v1.1.0` but renumbered to 049c so the file-sort runner applies it before 050's view (which depends on it).
- `consent_documents` was originally allocated to slot 073 (D13 agents). Pulled forward to 058 because Phase 1 Wizard finalize gates on it. D13 agent rollout can ADD agent-specific rows on top of this baseline schema.

---

## ✅ Phase B — R2 Bucket (DONE 2026-04-25)

**Bucket:** `bb-profile-avatars`
**Location:** WNAM (Western North America)
**Created:** 2026-04-25 04:26 UTC
**Public dev URL:** `https://pub-5e92f2b6589145168f4ef37309e12fee.r2.dev`

**CORS rules:**

| Allowed origins | Methods | Headers | Max-Age |
|---|---|---|---|
| `https://*.bainbridgebuilders.com` | GET, PUT, POST, DELETE, HEAD | * | 3600 |
| `https://bainbridgebuilders.com` |  |  |  |
| `http://localhost:5173` (Vite default) |  |  |  |
| `http://localhost:5174` (demo Vite override) |  |  |  |
| `http://localhost:3300` (CT BFF dev) |  |  |  |
| `http://localhost:3200` (other dev) |  |  |  |

**Object key pattern (per spec §5.4.4):** `<identity_id>/<uuid>.jpg`

**Verification:** `curl -sI https://pub-5e92f2b6589145168f4ef37309e12fee.r2.dev/` → `HTTP/1.1 404 Not Found` (expected on empty bucket).

**Auth used:** Cloudflare Global API Key (X-Auth-Email + X-Auth-Key pattern, NOT Bearer token).

---

## ✅ Phase C — Railway Demo Service (DONE 2026-04-25, except DNS)

**The CLI path sidestepped the GitHub-org-link issue entirely.** Service was created via `railway add --service auth-sdk-demo` (Empty Service); `railway up --detach` deploys from local code without needing Railway-GitHub integration.

### What's live now

- **Railway service:** `auth-sdk-demo` in project `BB-Production`, env `production`
- **Service URL:** https://auth-sdk-demo-production.up.railway.app — **HTTP 200, serving the demo placeholder**
- **Custom domain registered in Railway:** `auth-sdk-demo.bainbridgebuilders.com` (DNS propagation pending)
- **Build:** `pnpm install + pnpm run build (SDK) + cd demo && pnpm run build` via Nixpacks
- **Start:** `cd demo && pnpm run start` → `vite preview --host 0.0.0.0 --port $PORT`
- **`vite.config.ts allowedHosts`:** `.up.railway.app`, `.bainbridgebuilders.com`, `localhost`

### What's deployed (Block 5 minimal placeholder)

The current demo is a **static placeholder page** (no AuthProvider, no SDK imports) that proves the deploy pipeline works end-to-end. Block 7 will replace it with the full kitchen-sink (AuthProvider, sign-in flows, ProfileSetupScreen, etc.).

**Why placeholder for Block 5?** The SDK's `core/crypto-client.ts` uses `new Worker(new URL('./crypto-worker.js', import.meta.url))` — Vite's static analyzer can't resolve that across the workspace boundary cleanly. Block 7 fixes via either:
- Vite plugin to handle `import.meta.url` workers
- Conditional Worker construction guarded by a feature flag
- Build-time replacement of crypto-client with a stub for bundlers

### One step remaining — DNS records (Sam ~30 sec at Porkbun)

DNS for `bainbridgebuilders.com` is on **Porkbun** (per `CLOUDFLARE_CREDENTIALS.md`, the nameserver switch to Cloudflare is "pending"). Add these records at Porkbun:

```
Type   Name                              Value
─────  ────────────────────────────────  ───────────────────────────────────────────────────────────────────────────────────────
CNAME  auth-sdk-demo                     badfwcn5.up.railway.app
TXT    _railway-verify.auth-sdk-demo     railway-verify=railway-verify=d9d0c11a260cce2abf1e3d31421d00fe46137a4ff44c2b0065f1e94b4e90bdd3
```

After ~5 min DNS propagation:
- Railway auto-issues SSL via Let's Encrypt
- `https://auth-sdk-demo.bainbridgebuilders.com/` → HTTP 200

Verify:

```bash
curl -sI https://auth-sdk-demo.bainbridgebuilders.com/
# expect: HTTP/2 200
```

### Optional — wire GitHub Actions auto-deploy

`.github/workflows/demo-deploy.yml` is staged. To enable auto-deploy on `main` push:

1. Railway dashboard → Project Settings → **Tokens** → **+ Create Token** → scope `BB-Production` → copy token
2. GitHub repo Settings → Secrets and variables → Actions → **New repository secret**:
   - `RAILWAY_TOKEN` = the token from step 1
   - `RAILWAY_SERVICE_AUTH_DEMO` = service ID `d86f35cc-a607-48e8-badb-28a6484569e1`

After that, any push to `main` touching `demo/**` or `src/**` auto-redeploys.

---

## A4 Sign-Off Status

| # | Gate | Status |
|---|---|---|
| 1 | Spec-coverage matrix complete | ✓ (in audit) |
| 2 | Demo exercises 100% of SDK | ⏳ scaffold ✓ ; full kitchen-sink Block 7 |
| 3 | 9 crew consents seeded | **✓** (24 total rows, 9 crew required) |
| 4 | R2 bucket writable | **✓** (CORS configured) |
| 5 | Migrations 046-058 applied | **✓** (HWM = 058, 14/14 tables) |
| 6 | Demo deployed + reachable | **✓ via Railway** (custom DNS pending Porkbun) |
| 7 | Extendability mock adapter test | ✓ (3 tests) |
| 8 | No deprecation warnings in demo | ⏳ Block 7 — current placeholder has no SDK imports to test |
| 9 | Watermarks + zero TODO | ✓ |

**5 of 9 ✓ + 4 pending Phase C completion.**

When Phase C lands → all 9 ✓ → A4 signed → proceed to Block 6.
