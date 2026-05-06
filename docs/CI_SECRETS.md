# CI Secrets & Variables | @samjonaidi-ship-it/universal-auth | v1.0 | 2026-05-08 | BB

This file documents every `secrets.*` and `vars.*` reference in `.github/workflows/*.yml`. Anyone forking the repo or restoring CI from a fresh GitHub org must populate these to get green builds.

Updated when a workflow adds/removes a secret. Authority: workflow YAML at HEAD of `main`.

---

## Secrets (sensitive — `Settings → Secrets and variables → Actions → Secrets`)

| Name | Used in workflow | Used by step | What it is | Rotation policy |
|---|---|---|---|---|
| `GITHUB_TOKEN` | all | all `gh ...` calls + `actions/checkout` | Auto-injected by GitHub Actions; never set manually | n/a — per-run |
| `BB_CROSS_REPO_PAT` | `chaos.yml` | "Cross-repo checkout of BB_ControlTower" | Personal access token (classic, `repo` scope) on a service account that can read `samjonaidi-ship-it/BB_ControlTower`. Required because BB_ControlTower is private and the default `GITHUB_TOKEN` cannot read across private repos | Rotate every 90 days |
| `TEST_MODE_KEY` | `ci.yml` (browser-smoke), `browser-matrix.yml` | Playwright runs with `TEST_MODE_KEY` env to enable test-mode endpoints on the deployed app | Shared secret with the BB_ControlTower BFF — must match `process.env.TEST_MODE_KEY` on the deployed service | Rotate when the BFF rotates it |
| `NEON_API_KEY` | `chaos.yml` (integration job) | `neonctl branches create` to spin up a per-CI-run Neon branch | API key from Neon dashboard, scoped to the `bb-production` project | Rotate every 90 days |
| `NEON_PROJECT_ID` | `chaos.yml` (integration job) | Project ID for `neonctl` commands | Find via `neonctl projects list` | Stable — bump only on Neon project recreation |
| `RAILWAY_TOKEN` | `demo-deploy.yml` | Authenticate `railway up` | Railway account token (NOT project token) | Rotate every 90 days; revoke immediately on team change |
| `RAILWAY_SERVICE_AUTH_DEMO` | `demo-deploy.yml` | Service-scoped deploy auth for the demo environment | Generated via `railway tokens create` against the demo service | Stale — demo URL was retired in v1.0.1 (CHANGELOG); workflow may be safe to delete (see BUILD audit BUILD-7) |

## Variables (non-sensitive — `Settings → Secrets and variables → Actions → Variables`)

| Name | Used in workflow | What it is | Default behavior if unset |
|---|---|---|---|
| `PLAYWRIGHT_BASE_URL` | `ci.yml` (browser-smoke) | URL of the deployed app under Playwright test | Defaults to `https://app.buildwithbainbridge.com` when unset (see ci.yml:123 fallback) |
| `NEON_INTEGRATION_ENABLED` | `chaos.yml` (integration job) | Boolean flag (`'true'` to enable). Acts as a feature gate — the integration job skips silently when not `'true'` so CI shows green on forks/dev branches | Skipped (green) — opt-in only |
| `NEON_PARENT_BRANCH` | `chaos.yml` (integration job) | Name of the Neon branch to fork from for per-run integration branches | `production` |
| `NEON_DATABASE_NAME` | `chaos.yml` (integration job) | Postgres database name on the forked branch | `bb_production` (verify against `neonctl branches list`) |
| `NEON_ROLE_NAME` | `chaos.yml` (integration job) | Postgres role to use on the connection string | `bb_app` (verify against `neonctl roles list`) |

---

## Setup checklist for a fresh CI environment

1. Create a service-account GitHub user (or reuse the BB ops account).
2. On that account, generate a Personal Access Token (classic) with `repo` scope. Save as `BB_CROSS_REPO_PAT` repo secret on `samjonaidi-ship-it/universal-auth`.
3. From the BB_ControlTower BFF prod env, copy `TEST_MODE_KEY` into `samjonaidi-ship-it/universal-auth` repo secrets under the same name.
4. From Neon dashboard:
   - `Account → API Keys → New API Key` → save as `NEON_API_KEY`
   - `Projects` → copy the project ID for `bb-production` → save as `NEON_PROJECT_ID`
5. From Railway dashboard:
   - `Account Settings → Tokens → New Token` → save as `RAILWAY_TOKEN`
   - (Skip `RAILWAY_SERVICE_AUTH_DEMO` unless the demo workflow is reactivated.)
6. Set repo variables:
   - `PLAYWRIGHT_BASE_URL=https://app.buildwithbainbridge.com` (or the consumer's prod URL)
   - `NEON_INTEGRATION_ENABLED=true` (only after Neon secrets are set; otherwise leave unset for skip-green)
   - `NEON_PARENT_BRANCH=production`
   - `NEON_DATABASE_NAME=bb_production`
   - `NEON_ROLE_NAME=bb_app`

After all are set, push a no-op commit to `main` and verify all 7 CI jobs green (or `skipped` for the integration job if `NEON_INTEGRATION_ENABLED` is intentionally absent).

---

## Maintenance

- Audit this file every release tag against `grep -hoE "secrets\.[A-Z_]+|vars\.[A-Z_]+" .github/workflows/*.yml | sort -u`.
- If the grep produces names not in this doc, fail the audit — add them or remove the reference.
- Future enhancement: a `verify:secrets-doc.ts` script that does the above grep automatically as a CI gate (tracked in BACKLOG.md as a follow-up to BUILD-5).

---

*Updated: 2026-05-08 — rc.5 ship | BB*
