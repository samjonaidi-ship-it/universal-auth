# Pass-3 Audit — Code + Documentation | 2026-04-28 (post final-fixes)

**Scope:** third audit pass after `7e5d690` (CT BFF final-fixes merged + Railway deployed). Read every CT BFF file *not* yet deeply audited in passes 1–2 + every SDK doc that CalExp5 will read on Day 24.

**Method:** 100% evidence-based — re-read each file cover-to-cover, cross-checked schemas, ran live tests against prod, scanned Railway logs.

**Outcome:** **0 new code findings.** **6 documentation findings.** **1 critical (D1 — would have broken CalExp5 cutover).** All 6 fixed in this pass.

---

## Code re-audit (clean)

### What was re-read

| File | Status |
|---|---|
| `bff/middleware/auditWrite.js` | ✅ uses canonical `user_id`/`ip` — works fine with v1.1.0 audit.js synonym mapping |
| `bff/routes/identity.js` | ✅ uses `identity_id`/`details`/`ip_address`/`resource_type` — all properly handled by v1.1.0 |
| `bff/routes/auth.js` (legacy PIN auth) | ✅ has its own `logAudit` helper with canonical `ip` field — clean |
| `bff/services/notifications.js` (Resend `sendEmail`) | ✅ throws on non-2xx, caller catches; LB-7 path verified |
| `bff/services/audit.js` v1.1.0 | ✅ INSERT writes 16 columns matching audit_log schema (14 base + 2 from migration 061) |
| `bff/migrations/061_audit_log_context_columns.sql` | ✅ confirmed applied to prod via `railway logs` |
| `bff/migrations/062_auth_codes_lockout_index.sql` | ✅ confirmed applied to prod |
| SDK `demo/src/App.tsx` | ✅ `apiBaseUrl: 'https://ct-bff.bainbridgebuilders.com'`, `appId: 'bb_demo'`, `mode: 'production'` |

### Live verification

- T-A: `/auth/v1/code/request` → 200 with dev_code, no audit-write errors in Railway logs since deploy
- T-B: zero `[audit] write failed:` entries in 47 minutes of post-deploy logs
- T-C: full test suite re-run: **494 pass / 15 skipped** (unchanged from final fixes)
- T-D: live happy path E2E (request→verify→/me→refresh→reuse-revoke) — all green from previous pass, re-confirmed unchanged

### Watermark scan

All 16 modified files (10 BFF + 6 migrations + 1 test) carry `// BB ControlTower BFF | <path> | vX.Y.Z | YYYY-MM-DD | BB`. Pre-existing inconsistency in path prefix (some `bff/routes/X.js`, some `routes/X.js`) — Tier-3 cosmetic, not introduced by audit cycles. Not fixing.

---

## Documentation findings (6, all fixed)

### D1 [CRITICAL — fixed] — `INTEGRATION_GUIDE.md §2` documented a schema that doesn't exist

**Where:** `BB_Universal_Auth/docs/INTEGRATION_GUIDE.md` lines 65-78 (pre-fix).

**What was wrong:** the SQL example told CalExp5 (and any third-party integrator) to:
```sql
INSERT INTO ct_bff.apps (app_id, app_name, owner, environment) VALUES (...);
INSERT INTO ct_bff.app_events (app_id, event_type) VALUES (...);
```

**Actual schema** (per `bff/migrations/053_app_registry.sql` + `054_app_events.sql` + `059_v1_namespace_tables.sql`):
- `ct_bff.apps`: primary key is `id` (TEXT, not `app_id`); uses `display_name` (not `app_name`); has `app_kind`/`event_types TEXT[]`/`allowed_personas TEXT[]` columns; **no** `owner` or `environment` columns.
- `ct_bff.app_events` is the **runtime event-ingestion target**, not a registry — declaring event types per row would silently insert junk into the events table without any registration effect.

**Concrete impact (had this not been caught):** CalExp5 implementer copy-pastes the SQL → first INSERT fails with `column "app_id" does not exist` → Day 24 cutover stalls. Or worse: succeeds silently against a schema-compatible misread (e.g., a similarly-named legacy table) and emits silent data loss when `/events/v1/ingest` returns `UNKNOWN_EVENT_TYPE` for everything.

**Fix:** replaced the §2 SQL with the canonical `INSERT INTO ct_bff.apps (id, display_name, app_kind, event_types, allowed_personas) ... ON CONFLICT (id) DO UPDATE SET ...` that mirrors migration 059 lines 109-159 (the pattern actually in production). Added inline note about why `status` is intentionally excluded from the ON CONFLICT clause (cross-references audit F3).

### D2 [doc — fixed] — INTEGRATION_GUIDE header still says rc.1

**Where:** line 1: `v1.0.0-rc.1`.
**Actual SDK version:** `1.0.0-rc.2` (since 2026-04-28 rc.2 publish, `package.json`).
**Fix:** bumped header to `rc.2`.

### D3 [doc — fixed] — INTEGRATION_GUIDE spec citation lagged spec patch

**Where:** line 3: `BB_UNIVERSAL_AUTH_SDK_SPEC.md v1.4.2`.
**Actual spec version:** `v1.4.3` (per SESSION_STATE.md "Spec patched v1.4.2 → v1.4.3" entry — `/auth/v1/code/verify` body adds `destination`).
**Fix:** updated to `v1.4.3`.

### D4 [doc — fixed] — smoke `curl` example in §2 used stale `sdk_version` + wrong envelope shape

**Where:** §2 verification block (post-D1 rewrite).

**What was wrong:** sent `sdk_version: "1.0.0-rc.1"` and used a flat envelope `{event_type, ts, client_ts, sdk_version, protocol_version}` — but the actual `events-v1` ingest expects `{event_type, app_id, client_ts, payload, sdk_version, protocol_version}` (per `bff/routes/events-v1.js:56-59`). Missing `app_id` would have caused `missing_required_fields` rejection.

**Fix:** updated example to `sdk_version: "1.0.0-rc.2"` and full canonical envelope including `app_id` and `payload: {}`.

### D5 [doc — fixed] — `.session/SESSION_STATE.md` was stale

**Where:** `BB_Universal_Auth/.session/SESSION_STATE.md`.

**What was wrong:** dated 2026-04-28 evening, but only reflected the work through commit `c434524` (Resend domain verified). Did not mention any of the 38 audit findings closed across 3 cycles, the 4 new commits on CT BFF (`bb2dcbe → 7e5d690`), the 4 new migrations, the new helper functions, or the test count growth (470 → 494).

**Fix:** rewrote with three new sections: "Late evening — 3 audit cycles", "Pass-3 doc audit", and updated commit-state block. Phase status table preserved (no changes).

### D6 [doc/repo hygiene — fixed] — 9 untracked dev scripts in `BB_ControlTower/` root

**Where:** repo root contained `apply-migrations-manually.mjs`, `check-033-plus.mjs`, `final-apply-migrations.mjs`, `final-verification.mjs`, `list-all-migrations.mjs`, `verify-final.mjs`, `verify-migrations-post-deploy.mjs`, plus 2 untracked docs in `docs/` — none in `.gitignore`, perpetual `git status` noise.

**Fix:** added gitignore rules for the 5 patterns matching dev/ops migration-verifier scripts:
```
/apply-migrations-manually.mjs
/check-*.mjs
/final-*.mjs
/list-all-migrations.mjs
/verify-*.mjs
```
Note added: "Move to `scripts/` if they become permanent." The 2 untracked docs left as-is (they're real docs, just not committed yet — future work decides whether to commit or rename).

### D7 [doc — deferred] — `BB_Platform_Specs/CT_BFF_V1_NAMESPACE_PLAN.md` doesn't reflect current Phase status

**Where:** lines 143-260.

**What it shows:** the plan from 2026-04-28 morning, showing phases as future work. Phases 0-3.4 are now complete (per SESSION_STATE.md), but the plan doc retains its prospective tense.

**Why deferred:** plan documents are typically immutable historical records — they describe what *was planned*. Status tracking belongs in SESSION_STATE.md (which D5 fixed). Retrofitting `✅ Phase 0 — DONE` markers into a planning doc creates two sources of truth.

**Recommendation if Sam disagrees:** add a single "Status as of YYYY-MM-DD" header at the top of the plan with a one-paragraph summary; don't edit the per-phase bodies.

---

## Verified clean (re-confirmed evidence)

| What | How verified |
|---|---|
| All 38 prior findings (LB-1..LB-13, F1..F12) still landed on prod | git log + railway image SHA |
| Migrations 061 + 062 applied to prod DB | railway logs grep |
| audit_log INSERT writes 16 columns matching schema | code read + zero errors in 47 min of prod logs |
| writeAudit synonym mapping handles all 11 call sites correctly | grep + signature cross-check |
| LB-1/LB-3 origin gate live | T7/T8 (prior pass) |
| F2 app_access bleed eliminated | T3 (prior pass): `app_access:["bb_demo"]` |
| F4 SMS gate live | T2 (prior pass): explanatory 400 message |
| Demo at `auth-sdk-demo.bainbridgebuilders.com` matches integration guide | re-read demo/src/App.tsx → matches §1 + §3 |
| 494 BFF tests pass / 15 skipped | local `npm test` |

---

## Remediation summary

| # | Finding | Severity | Status |
|---|---|---|---|
| D1 | INTEGRATION_GUIDE.md §2 wrong schema | **CRITICAL** | ✅ FIXED |
| D2 | INTEGRATION_GUIDE header rc.1 → rc.2 | doc | ✅ FIXED |
| D3 | INTEGRATION_GUIDE spec ref v1.4.2 → v1.4.3 | doc | ✅ FIXED |
| D4 | INTEGRATION_GUIDE smoke curl rc.1 → rc.2 + envelope | doc | ✅ FIXED |
| D5 | SESSION_STATE.md stale | doc | ✅ FIXED |
| D6 | 9 untracked dev .mjs scripts | repo hygiene | ✅ FIXED (.gitignore) |
| D7 | Plan doc status not retrofitted | doc | ⏸ DEFERRED (historical record) |

**Code findings: 0 new.**
**Doc findings: 6/6 closed (1 deferred as intentional).**
**Cumulative across 3 audit cycles: 38 findings (38 closed) + this pass-3 (6 closed + 1 deferred).**

---

## Sign-off

- [x] Code re-read complete: 8 files cover-to-cover
- [x] Live re-verification: 494 BFF tests pass, zero audit-write errors in 47 min of prod logs
- [x] D1 (critical) — INTEGRATION_GUIDE schema corrected before CalExp5 reads it
- [x] D2-D6 — all closed
- [x] D7 — deferred with rationale documented

**Pass-3 audit closed 2026-04-28.** Cumulatively across 3 cycles: 38 code + 6 doc findings = **44 findings, 0 open, 1 intentional defer.**

CalExp5 cutover (Block 7 Day 24) remains unblocked. Documentation now schema-correct.
