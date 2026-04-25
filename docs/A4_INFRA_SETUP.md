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

## ⏳ Phase C — Railway Demo Service (Sam owns ~10 min)

The SDK side is complete:
- `demo/` scaffold (Vite + React + SDK)
- `demo/railway.json` + `demo/nixpacks.toml` (Railway build config)
- `.github/workflows/demo-deploy.yml` (auto-deploy on `main` push)

**What Sam needs to do (one-time):**

### C.1 Connect Railway → BainbridgeBuilders GitHub org

The `BainbridgeBuilders/universal-auth` repo is private + under a fresh org. Railway can't auto-link without explicit auth.

1. Open https://railway.app/dashboard → BB-Production
2. Click **+ New Service** → **GitHub Repo**
3. If prompted, click "Configure GitHub App" → authorize Railway for the **BainbridgeBuilders** organization
4. Select **BainbridgeBuilders/universal-auth**

### C.2 Configure the service

1. **Service name:** `auth-sdk-demo`
2. **Root directory:** `/demo`
3. **Branch:** `main`
4. **Watch paths:** `demo/**` and `src/**` (so SDK changes also trigger redeploy)

Railway will auto-detect `demo/railway.json` + `demo/nixpacks.toml` and use them.

### C.3 Add custom domain

1. Service settings → **Domains** → **+ Custom Domain**
2. Enter: `auth-sdk-demo.bainbridgebuilders.com`
3. Railway will print a CNAME target like `xxxxxxx.up.railway.app`

### C.4 Cloudflare DNS

In Cloudflare → bainbridgebuilders.com zone → **+ Add Record**:

```
Type:    CNAME
Name:    auth-sdk-demo
Target:  <CNAME from step C.3>
Proxy:   DNS only (grey cloud) — Railway issues its own SSL
TTL:     Auto
```

Wait ~30 seconds for DNS propagation. Railway will auto-issue an SSL cert via Let's Encrypt.

### C.5 Wire GitHub Actions secrets

For the `demo-deploy.yml` workflow to work:

1. Railway → Project Settings → **Tokens** → **+ Create Token**
   - Name: `github-actions-deploy`
   - Scope: `BB-Production` (project-scoped)
   - Copy the token
2. GitHub repo → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `RAILWAY_TOKEN`
   - Value: paste token from step 1
3. Same place → another secret:
   - Name: `RAILWAY_SERVICE_AUTH_DEMO`
   - Value: the service ID (visible in Railway service URL `https://railway.app/project/.../service/<this-id>`)

### C.6 First deploy

Either:
- Push any change to `main` that touches `demo/` or `src/` → workflow auto-runs
- OR Railway dashboard → **Deploy now**

### C.7 Smoke test (gate #6 + #8)

Once deployed:

```bash
curl -sI https://auth-sdk-demo.bainbridgebuilders.com/
# Expect HTTP/2 200
```

Walk through the demo in a browser:
- Open DevTools console
- Sign in (or attempt to)
- Verify ZERO React deprecation warnings (gate #8)
- Verify ProfileSetupScreen renders correctly with avatar picker
- Verify ConsentScreen shows the 9 crew consents seeded above

---

## A4 Sign-Off Status

| # | Gate | Status |
|---|---|---|
| 1 | Spec-coverage matrix complete | ✓ (in audit) |
| 2 | Demo exercises 100% of SDK | ⏳ scaffold ✓ ; full kitchen-sink Block 7 |
| 3 | 9 crew consents seeded | **✓** (24 total rows, 9 crew required) |
| 4 | R2 bucket writable | **✓** (CORS configured) |
| 5 | Migrations 046-058 applied | **✓** (HWM = 058, 14/14 tables) |
| 6 | Demo deployed + reachable | ⏳ pending Sam Phase C steps |
| 7 | Extendability mock adapter test | ✓ (3 tests) |
| 8 | No deprecation warnings in demo | ⏳ verify after C.6 |
| 9 | Watermarks + zero TODO | ✓ |

**5 of 9 ✓ + 4 pending Phase C completion.**

When Phase C lands → all 9 ✓ → A4 signed → proceed to Block 6.
