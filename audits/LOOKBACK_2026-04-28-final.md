# Final Pre-CalExp5 Look-Back Audit | 2026-04-28 evening (post Tier-2/3 fix)

**Scope:** every file touched since `c3ae457` (Tier-1 commit). Read 100% of:
- `bff/routes/auth-v1.js` v1.2.0 (838 lines)
- `bff/routes/events-v1.js` (107 lines)
- `bff/routes/webauthn.js` v1.2.0 (220 lines, post LB-13)
- `bff/plugins/session.js` v3.1.0 (380 lines)
- `bff/plugins/cors.js` (108 lines)
- `bff/services/access-token.js` (155 lines)
- `bff/services/refresh-token.js` (200 lines)
- `bff/services/device-refresh-tokens.js` v1.1.0 (107 lines)
- `bff/services/audit.js` (head)
- `bff/lib/env-check.js` v1.1.0 (84 lines)
- `bff/lib/sentry.js` (50 lines)
- `bff/migrations/059_v1_namespace_tables.sql` (160 lines)
- `bff/migrations/060_refresh_tokens_generalize.sql` (31 lines)
- `tests/auth-v1-routes.test.js` (15 + 6 tests)
- `bff/server.js` (route wiring section)
- Schema cross-checks: `001_sessions.sql`, `002_audit_log.sql`, `008_identities.sql`,
  `038_identities_access_identity_extension.sql`, `054_app_events.sql`,
  `007_role_expansion.sql`

**Live verification:** 11 smoke tests against `https://ct-bff.bainbridgebuilders.com`
(T1–T11), including a full happy-path E2E (request→verify→/me→refresh→reuse-detect).

**Test suite:** 487 pass / 14 skipped (only DB-gated skips; all unit + route + DB-non-required pass).

**Outcome:** **12 findings.** **3 must-fix-before-CalExp5 (Tier 1).** 4 fix-soon (Tier 2). 5 defer (Tier 3).

This is **not a clean bill of health yet.** Three real issues (F1, F2, F3) should land before CalExp5 cutover. None are show-stoppers; all are bounded.

---

## Tier 1 — must fix before Block 7 Day 24 (CalExp5 cutover)

### F1 — `writeAudit` is silently dropping critical context on every `/auth/v1/*` call

**Where:** `bff/routes/auth-v1.js` lines 328, 389, 476, 595, 688, 720 (six sites);
also `routes/webauthn.js` lines 65, 114, 157; `routes/identity.js` lines 44, 117.

**What's wrong:** these call sites pass `{ identity_id, details, ip_address, resource_type }`
but `bff/services/audit.js` only reads `{ session_id, user_id, user_name, role, action,
method, path, status, error_text, before_hash, after_hash, trace_id, ip, user_agent }`.
Mismatched field names are silently dropped by the destructuring pattern.

**Concrete impact (verified by reading the schema):**
- `audit_log.user_id` is NULL on every audit-v1 row (because callers pass `identity_id`).
- `audit_log.ip` is NULL (callers pass `ip_address`).
- The `details` object — masked destination, app_id, channel, device_id, error context — is discarded entirely (no column exists for it).
- `resource_type` (used by webauthn.js + identity.js) is also discarded.

**Why it's Tier 1:** post-CalExp5, an investigation of "who logged in from where, what app" against the audit trail will return rows with NULL identity, NULL IP. Forensics blind spot for every `/auth/v1/*` and `/identity/v1/*` event. Not security-breaking (other systems have this data) but an audit-log promise we're not keeping.

**Evidence:**
```
$ grep -A1 "INSERT INTO ct_bff.audit_log" bff/services/audit.js
   …
   VALUES (${fields.session_id}, ${fields.user_id}, …, ${fields.ip}::inet, …)

$ grep -B1 -A8 "writeAudit" bff/routes/auth-v1.js
   void writeAudit(app.sql, {
     identity_id: identityId,    // ← dropped
     ip_address: req.ip,         // ← dropped
     details: { masked, … },     // ← dropped
   });
```

**Fix (recommended):** extend `writeAudit` to accept the synonyms:
```js
const userId = fields.user_id ?? fields.identity_id ?? null;
const ip     = fields.ip      ?? fields.ip_address  ?? null;
```
Plus add a migration `061_audit_log_details.sql` that adds `details JSONB` +
`resource_type TEXT` columns, and have `writeAudit` write them when present.
Effort: 30 min. Net positive — backward compatible, existing rows unaffected.

---

### F2 — JIT-created demo identities still get `persona_type='admin'` (LB-2 incomplete)

**Where:** `bff/routes/auth-v1.js` lines 140-151 (`jitCreateIdentityForDemo`):
```js
INSERT INTO ct_bff.identities (
  …,
  status, persona_type, display_name
) VALUES (
  …,
  'active', 'admin',     -- ← still hardcoded admin
  ...
)
```

**What's wrong:** Tier-1 LB-2 changed the `role` passed to `issueSessionV1` from `'admin'` to `'viewer'` (and that part works — see F-trail). But the underlying identity row STILL gets stored with `persona_type='admin'`. This causes downstream pollution:

**Evidence (live, T11 step 3 — fresh JIT identity):**
```json
"primary_persona": "admin",
"personas": [{
  "persona_type": "admin",
  "landing_route": "/admin",
  ...
}],
"aggregate": {
  "features": [],
  "app_access": ["bb_demo", "bb_express", "controltower"]   ← bleed
}
```

The `app_access` includes `controltower` because controltower's `allowed_personas = ['admin']` (migration 059 line 150) and the JIT identity is stored as admin. The session role is correctly `viewer`, but `app_access` is informational and a consumer reading it would believe the demo user can access the admin SPA.

**Why it's Tier 1:** when CalExp5 ships and the SDK reads `app_access`, an SDK consumer with the wrong gate could route a demo JIT user into admin features. Even more directly: `landing_route: '/admin'` is what the SDK uses to redirect after sign-in.

**Fix:** change line 146 from `'admin'` to `'viewer'`. Effort: 5 min (one char). Existing identity rows in the DB stay as-is (only affects new JIT identities).

---

### F3 — Migration 059 ON CONFLICT clause silently revives disabled apps on every deploy

**Where:** `bff/migrations/059_v1_namespace_tables.sql` lines 109, 152-159.

**What's wrong:** the INSERT at line 109 supplies `(id, display_name, app_kind, event_types, allowed_personas)` — five columns. The ON CONFLICT clause at line 156 says `status = EXCLUDED.status`. Since `status` is NOT in the INSERT column list, `EXCLUDED.status` resolves to the column DEFAULT (`'active'` per migration 053).

**Concrete attack scenario:**
1. Admin disables `bb_demo` via `UPDATE ct_bff.apps SET status='disabled' WHERE id='bb_demo'`.
2. Next BFF deploy → migration 059 re-runs (idempotent migrations always re-run on Neon).
3. ON CONFLICT triggers → `status = EXCLUDED.status` → `status = 'active'`.
4. `bb_demo` is silently revived. No log, no alert.

**Why it's Tier 1:** migration is idempotent BY DESIGN to be re-run safely. But "safe" means "doesn't lose data" — quietly resurrecting an admin's disabled flag breaks the admin's mental model. If we ship CalExp5 and a security incident leads someone to disable an app, deployment will undo the protection.

**Fix (one-liner):** drop `status = EXCLUDED.status,` from the ON CONFLICT clause (line 156). Future seeds that intend to flip status should be a separate migration. Effort: 1 min.

---

## Tier 2 — fix before more endpoints land

### F4 — `jitCreateIdentityForDemo` will 500 on SMS path (latent)

**Where:** `bff/routes/auth-v1.js` lines 140-151 (INSERT) crossed with
`bff/migrations/008_identities.sql` line 19 (`email TEXT NOT NULL`).

**What's wrong:** the INSERT uses `${channel === 'email' ? sql\`email\` : sql\`phone\`}` — for SMS channel, only the `phone` column is supplied. But `identities.email` is `NOT NULL` with no default. Postgres rejects with NOT NULL violation. The route doesn't catch it → 500.

**Why it's latent:** SMS is gated by `ALLOW_SMS=false` (services/notifications.js:154). The Twilio path is currently disabled. So no SMS auth code is delivered anyway, and no /code/verify hits this path. But the gate is in `notifications.js` — `auth-v1.js` itself doesn't check `ALLOW_SMS` before queueing the auth_code or before JIT. A misconfigured deploy that flips `ALLOW_SMS=true` would expose this.

**Fix:** either (a) add `ALLOW_SMS` env check in `auth-v1.js` /code/request before accepting `channel='sms'`, OR (b) make `identities.email` nullable via migration (add CHECK constraint requiring at least one of email/phone is non-null), OR (c) fall back to a synthetic email like `${phone}@phone.local` for SMS JITs. Option (b) is cleanest. Effort: 15 min.

---

### F5 — LB-9 destination-lockout query has no supporting index

**Where:** `bff/routes/auth-v1.js` lines 464-473.

**Query:**
```sql
SELECT COALESCE(SUM(...))::int AS bad_attempts
FROM ct_bff.auth_codes
WHERE destination = $1
  AND created_at > now() - $2 * interval '1 minute'
```

**Existing indexes (migration 059):**
- `auth_codes_destination_idx ON destination WHERE consumed_at IS NULL` — partial; lockout query DOESN'T filter on consumed_at, so this index is unusable.
- `auth_codes_expires_idx ON expires_at WHERE consumed_at IS NULL` — partial; same problem.

**Result:** the lockout query does a sequential scan on `auth_codes` filtered by destination. The cleanup view (line 103 of 059) suggests rows are purged after 24h, so the table stays small (~hundreds of rows max). Sequential scan is fine today. **Becomes a problem at scale** (if cleanup lags or traffic spikes). Not a bug right now; an optimization gap.

**Fix:** add `CREATE INDEX IF NOT EXISTS auth_codes_destination_created_idx ON ct_bff.auth_codes(destination, created_at DESC);` in a new migration. Effort: 5 min.

---

### F6 — No test exercises the `isDemoRequest` (Origin gate) success path

**Where:** `tests/auth-v1-routes.test.js`.

**Coverage gap:** the LB-1 / LB-3 demo-only behaviors are only tested for the REJECTION path (no Origin → JIT denied / dev_code not echoed). The SUCCESS path (correct DEMO_ORIGIN header → JIT allowed / dev_code echoed) is not exercised. A typo in the `DEMO_ORIGIN` constant (e.g. `auth-sdk-demo` vs `auth_sdk_demo`) would silently break the demo with all tests still green.

**Fix:** add 2 tests in the no-DB tier:
1. POST /code/request with `Origin: $DEMO_ORIGIN` + `app_id: 'bb_demo'` + `BB_DEMO_CODE_ECHO=true` → response includes `dev_code`.
2. POST /code/request with `Origin: 'https://attacker.example.com'` + same body → response omits `dev_code`.

Effort: 15 min.

---

### F7 — No test exercises LB-9 destination-scoped lockout

**Where:** `tests/auth-v1-routes.test.js`.

**Coverage gap:** the LB-9 destination-scoped lockout is functional (verified live in T11 indirectly) but not tested. A regression that broke the SQL CASE expression or the threshold check would silently disable the lockout.

**Fix:** add to the DB-tier tests: pre-seed 10 auth_codes rows with `attempt_count=1, consumed_at=NULL` for a test destination, then call /code/verify with any code, expect 429 + `AUTH_RATE_LIMITED` + `retry_after_seconds: 900`. Effort: 20 min.

---

## Tier 3 — defer (no impact on CalExp5)

### F8 — `subscription_status: 'active'` fallback when no active sub

**Where:** `bff/routes/auth-v1.js` line 219 — `subscription_status: sub?.subscription_status ?? 'active'`.

**Impact:** demo JIT identities have no subscription, but the `/me` payload reports `subscription_status: 'active'`. Misleading; should be `'none'` or `'free'`. Defer to v1.1.

### F9 — `app_events.session_id` is TEXT not UUID

Spec choice. `events-v1.js` accepts whatever the SDK sends. Informational only.

### F10 — auth-v1 writeAudit calls don't auto-populate request context

**Where:** every `void writeAudit(app.sql, { … })` call in auth-v1.js manually passes `ip_address`, `user_agent`. `routes/auth.js` has a `logAudit(app, req, fields)` helper that does this automatically. auth-v1 could adopt the same pattern. Defer — this is housekeeping after F1 lands.

### F11 — Webauthn rotation still uses legacy `device-refresh-tokens.rotateRefreshToken`

**Pre-existing** before this audit cycle. Webauthn rotation lacks the V1 family-revoke on reuse detection. Phase 2 consolidation. Filed against `device-refresh-tokens.js` in v1.1.0 deprecation header.

### F12 — `events-v1.js` JSONB serialization style differs from auth-v1.js

**Where:** events-v1.js line 87 uses `${payload ?? {}}` (implicit). auth-v1.js LB-7 line 376 uses `${JSON.stringify(payload)}::jsonb` (explicit cast). Both work via neon's auto-serialization. Inconsistent style only.

---

## Verified clean (evidence)

| What | How verified |
|---|---|
| /healthz responds, bridge OK, db OK | T1 live |
| /auth/v1/persona-registry public + cached | T2 live (cache-control: public, max-age=3600) |
| /auth/v1/me unauth → 401 | T3 live |
| /auth/v1/me bad bearer → 401 | T4 live |
| /auth/v1/code/request validation | T5 live |
| LB-1: bb_express + unknown destination → AUTH_CODE_INVALID (no JIT, no leak) | T6 live |
| LB-3: bb_demo + bad Origin → no dev_code echo | T7 live |
| LB-3: bb_demo + correct Origin → dev_code echoed | T8 live |
| Events ingest empty → ok | T9 live |
| Events ingest unknown event_type → UNKNOWN_EVENT_TYPE | T10 live |
| Full happy path: request→verify→/me→refresh→reuse-revoke | T11 live (refresh family revoke fires correctly on token replay) |
| All 487 unit+route tests pass | local `npm test` |
| Spec §D2.1 Session payload shape | T11 step 3 live (every required field present) |
| Refresh token reuse-detection family-revoke | T11 step 5 → AUTH_SESSION_REVOKED |
| HS256 JWT issued, signed, verifies | T11 step 2 access_token decodes (sub, sid, ik, pp, jti, protocol) |
| OTP code hashed (no plaintext in DB) | code review auth-v1.js:82-86 |
| SQL injection paths | All queries use tagged templates (neon parameter binding) — verified by scan |
| Watermarks on every modified file | grep-confirmed (auth-v1 v1.2.0, session v3.1.0, env-check v1.1.0, webauthn v1.2.0, device-refresh-tokens v1.1.0) |
| TypeScript / ESLint cleanliness | `npm test` is the gate; passes |
| Dual cookie name read (LB-8) | session.js:175-183 reads from COOKIE_READ_NAMES array |
| Cookie domain prod default (LB-6) | session.js:63-70 — `.bainbridgebuilders.com` in prod |
| JWT_SECRET env-check (LB-4) | env-check.js:36-39 in REQUIRED_IN_PROD |
| Resend failure → Sentry + app_events row + audit (LB-7) | auth-v1.js:353-400 (3-channel signal) |

---

## Remediation plan

| # | Finding | Tier | Effort | Blocking? |
|---|---|---|---|---|
| F1 | writeAudit field-name mismatch | 1 | 30 min | YES |
| F2 | JIT identity persona_type='admin' | 1 | 5 min | YES |
| F3 | Migration 059 ON CONFLICT revives apps | 1 | 1 min | YES |
| F4 | SMS JIT will 500 | 2 | 15 min | NO (SMS disabled) |
| F5 | Lockout query no index | 2 | 5 min | NO (small table) |
| F6 | Demo origin gate test gap | 2 | 15 min | NO |
| F7 | Lockout test gap | 2 | 20 min | NO |
| F8 | subscription_status fallback wording | 3 | 5 min | NO |
| F9 | session_id TEXT not UUID | 3 | — | NO (spec) |
| F10 | auth-v1 writeAudit ergonomics | 3 | 30 min | NO |
| F11 | webauthn legacy rotate (pre-existing) | 3 | v1.1.0 | NO |
| F12 | JSONB style inconsistency | 3 | — | NO |

**Tier 1 total: ~36 min.** **Tier 2 total: ~55 min.** **Tier 3 deferred.**

After Tier 1 + Tier 2 land: **clean bill of health, ready for CalExp5.**

---

## Sign-off

- [x] **Tier-1 fixes landed** (branch `agent/lookback-final-fixes-2026-04-28`):
  - F1: `writeAudit` now accepts `identity_id`/`ip_address`/`details`/`resource_type` synonyms; migration `061_audit_log_context_columns.sql` adds `details JSONB` + `resource_type TEXT` + index. `logRequestAudit(app, req, fields)` helper added (F10) for ergonomic call sites.
  - F2: `jitCreateIdentityForDemo` now stores `persona_type='viewer'`. `buildSessionPayload` synthesizes a fallback persona block for operational role types (`viewer`/`operator`) so `personas[]` stays non-empty per spec §D2.1.
  - F3: migration 059 ON CONFLICT no longer touches `status` (status changes go through explicit migrations only).
- [x] **Tier-2 fixes landed**:
  - F4: `/auth/v1/code/request` rejects `channel='sms'` when `ALLOW_SMS != 'true'` (no more latent 500).
  - F5: migration `062_auth_codes_lockout_index.sql` adds `(destination, created_at DESC)` index for the LB-9 lockout query.
  - F6: 6 unit tests for `isDemoRequest` covering correct origin / wrong origin / no origin / wrong app_id / null app_id / DEMO_ORIGIN constant.
  - F7: DB-gated test for LB-9 destination-scoped lockout (pre-seeds 10 bad attempts, expects 429 + 900s retry_after).
- [x] **Tier-3 fixes landed**:
  - F8: `subscription_status` fallback `'free'` (was `'active'`).
  - F9: doc comment in `events-v1.js` explaining `session_id TEXT` choice.
  - F10: `logRequestAudit` helper in `services/audit.js`.
  - F11: doc comment in `webauthn.js` flagging the legacy rotator + v1.1.0 migration plan.
  - F12: `events-v1.js` now uses explicit `JSON.stringify + ::jsonb` cast (matching auth-v1).
- [x] **Final live re-verification:** 12-test smoke + happy-path E2E re-run after deploy; all pass; F2 confirmed (JIT identity → `app_access: ['bb_demo']`, no admin SPA bleed).

**Test suite:** 487 → 494 pass / 14 → 15 skipped.

**Audit closed 2026-04-28.** Ready for CalExp5 cutover (Block 7 Day 24).
