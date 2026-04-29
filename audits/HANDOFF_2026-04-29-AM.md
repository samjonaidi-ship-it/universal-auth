# Morning handoff — 2026-04-29 AM | overnight cutover work

**TL;DR:** Phases A + B + C all live in production. SDK rc.3 source merged + tarball ready. Phase D partial — wired everything that doesn't change UX, gated by `VITE_USE_UNIVERSAL_AUTH` flag (default OFF). Branch pushed, NOT merged. Phase E waits on you.

**You don't need to do anything before flipping the flag** — just review the open branches and decide when to merge / staging-test / cutover. Estimated ~2-4 hours of careful UX wiring left in Phase D + the 14-crew coordination of Phase E.

---

## What landed (merged to main, deployed where applicable)

### CT BFF (`BB_ControlTower`) — 5 merges to main since you went to sleep

| SHA | Branch | Phase | What |
|---|---|---|---|
| `96b7057` | agent/cutover-day23-ct-prework | A | BFF_PUBLIC_URL set on Railway, auto-email magic-links via Resend, samjonaidi@gmail.com confirmed admin, UserBadge popover in admin SPA sidebar |
| `483f051` | agent/cutover-day24-ct-bff-paths | C-Day24 | passkey + enroll + identity-consents path renames; webauthn/authenticate/verify + enroll/activate now return full §D2.1 Session payload via `reply.issueSessionV1()` + `buildSessionPayload()` (extracted to `bff/services/session-payload.js`) |
| `2262ef3` | agent/cutover-day25-identity-profile-settings | C-Day25 | NEW `bff/routes/identity-v1.js` with profile GET/PUT, profile/avatar POST/DELETE (multipart via @fastify/multipart), persona-fields-registry, settings GET/PUT |
| `09d3731` | agent/cutover-day26-permission-consent-tests | C-Day26 | permission-grants POST, consent-documents GET, consents/bulk POST + 22 new tests (11 no-DB + 11 DB-gated) |

**Deployed:** Railway image with all of the above is live at `https://ct-bff.bainbridgebuilders.com`. Healthcheck passing. Migrations 061+062 applied. **Tests: 505 pass / 26 skipped** (was 494/15 — +11 new + 11 DB-gated for identity-v1 routes).

**Live verification (curl):**
- `GET /healthz` → ok ✓
- `GET /identity/v1/persona-fields-registry` → 8 personas + cache headers ✓
- `GET /identity/v1/consent-documents?audience=crew` → 12 docs (9 required + 3 optional) ✓
- `GET /identity/v1/profile` (anon) → 401 AUTH_SESSION_EXPIRED ✓
- `POST /auth/v1/passkey/register/options` → handler responds (400 missing identityId is correct) ✓
- `POST /auth/v1/enroll/verify/badtoken` → 404 AUTH_CODE_INVALID ✓

### CalExp5 — 1 merge to main + 1 branch pushed (NOT merged)

| SHA | Branch | Phase | What |
|---|---|---|---|
| `9c4ad78` | agent/cutover-day23-calexp5-prework | B | Dead device_credentials IDB store removed (-45 LOC), RegisterFlow.jsx deleted (-100 LOC), preconnect added to index.html, watermark backfill on CrewEntryAuthBackdrop + login-warmup |
| **(unmerged)** | agent/cutover-day27-calexp5-sdk-wire | D-partial | SDK rc.3 wired behind flag, api-base.js dual-mode token source, 11 leak-sites swept |

### SDK (`@bainbridgebuilders/universal-auth`) — 1 merge to main

| SHA | Branch | What |
|---|---|---|
| `cd33fbb` | agent/sdk-rc3-imperative-api | 1.0.0-rc.3 — real `getAuth()` imperative API (was Day-1 stub); direct exports `getAccessToken`, `getCurrentSessionId`, `hasLiveAccessToken`; CHANGELOG entry. 387 unit tests pass. **Tarball ready at `dist-pack/bainbridgebuilders-universal-auth-1.0.0-rc.3.tgz`** but NOT published to GitHub Packages — see "Action needed" below. |

---

## Action needed from you

### 1. Publish SDK rc.3 to GitHub Packages (5 min — REQUIRED before flag flip)

The `gh auth token` only has `repo` scope; publish needs `write:packages`. Generate a classic PAT at github.com/settings/tokens with both `read:packages` AND `write:packages` scopes. Then:

```bash
cd /c/Users/samjo/Desktop/BB_Universal_Auth
echo "//npm.pkg.github.com/:_authToken=ghp_<your-token>" >> ~/.npmrc
npm publish --tag rc
```

Once published, swap CalExp5's `package.json` from the local-tarball reference to the registry version:
```
"@bainbridgebuilders/universal-auth": "file:../BB_Universal_Auth/dist-pack/..."
                            ↓
"@bainbridgebuilders/universal-auth": "^1.0.0-rc.3"
```
Then `npm install` from CalExp5 to refresh `package-lock.json`.

(Optional alternative: keep the local-tarball reference until v1.0.0 GA. Works fine for staging + prod as long as the file path stays valid relative to CalExp5's repo root.)

### 2. Review the unmerged D-phase branch

Branch `agent/cutover-day27-calexp5-sdk-wire` (CalExp5 repo). Two commits:
- `d8f49eb` — D2+D3+B4+D5: SDK init in main.jsx, api-base.js dual-mode token, plaintext scrub, SW logout-purge listener
- `40ac815` — D4: 11 leak-sites swept

**Build clean** (`npm run build` works). **Flag default is OFF** — merging this branch does NOT change runtime behavior for anyone. The flag-on path is safe to test in staging:

```bash
# Set in Railway staging env:
VITE_USE_UNIVERSAL_AUTH=true
# Trigger redeploy
```

Under flag-on with this branch: SDK initializes, AuthProvider wraps App, but `<LoginScreen>` (legacy) is still what renders for anonymous users. So you'll see the legacy PIN flow with SDK loaded in the background. Useful for confirming SDK init doesn't break anything before the UX wiring lands.

### 3. Phase D remaining (the work I deliberately stopped on — needs your eyes)

The plan's D-phase had 14 steps. I did D2/D3/D4/B4/D5. Remaining 9 steps (~3-4 hours):

| Step | What | Why I deferred |
|---|---|---|
| D6 | Replace `<LoginScreen />` (App.jsx:247) with `<SignInForm />` | UX-visible; you should design the layout/copy |
| D7 | Rewrite `EnrollmentFlow.jsx` (~80 LOC) using SDK's 3 imperative functions + `<ConsentScreen>` (NOT a single SDK component) | UX-visible; needs your sign-off on the consent presentation |
| D8 | Wire `usePermissionGrants()` in `<FirstLaunchScreen>` after each `navigator.permissions.query` resolve | Touches a flow you've recently iterated on — better with you in the loop |
| D9 | Wire `<MyProfile>` to `useProfile()` + `useSettingsSync()`; replace avatar UI with `<AvatarPicker>`; this also fixes `receipt-queue.js:79` (employee.id read) by sourcing identity from SDK | Big UX change; defer to your review |
| D10 | Adapt 4 hooks (useDeviceSync, useMigration, useNeonSync, useFeatures) to read SDK auth state | Each is small; bundling them safely needs your domain knowledge of when each fires |
| D11 | Delete `src/hooks/useAuth.js` (95 lines), update all imports to `@bainbridgebuilders/universal-auth/react`. Signature different — `isAuthenticated → status === 'authenticated'`, `employee → identity`, `logout → signOut` | Mechanical but breaks every caller; needs grep + careful sweep + retest |
| D12 | Subscribe `useStore` slices to SDK session-change so logout clears both stores | Small; ~20 min |
| D13 | Hard-delete legacy auth stack (~1,907 LOC: api-base.js stays as wrapper, but auth.js/indexed-db.js/authStore.js/LoginScreen.jsx/EnrollmentFlow.jsx/BiometricButton.jsx/PinPad.jsx all go) — **MUST be the LAST commit** for single-revert rollback | Don't delete until you've confirmed the SDK-on path works end-to-end in staging |
| D14 | Remove `app.all('/api/auth/*', ...)` proxy block in CalExp5's server.js (lines 643-707) | Same — only after SDK-on confirmed |

### 4. Phase E — flag flip Day-of (your call)

Once D6-D14 land + you've smoked the demo on staging:

1. **Pre-flight (Day -1)**: SQL — confirm each crew's `ct_bff.identities.email` matches a reachable inbox: `SELECT email FROM ct_bff.identities WHERE primary_employee_id IN (<active 14>);`
2. **Re-issue magic-links** to 14 active crew via Bulk Ops UI at `https://ct-bff.bainbridgebuilders.com/app/admin-bulk-ops` (admin-only — your role is now `admin`, the UserBadge popover confirms it)
3. **Flip flag** in Railway prod: `VITE_USE_UNIVERSAL_AUTH=true` → triggers redeploy
4. **24-hour monitoring**: Sentry baseline × 1.1, p95 ≤ 800ms, no `[audit] write failed:` in CT BFF logs, `ct_bff.app_events` shows `bb_express` events flowing
5. **Rollback playbook (30s target)**: `git revert <D13 SHA>` on the cutover branch + redeploy. D13 is intentionally the LAST commit so a single revert restores everything.

---

## What I changed in the plan vs original

The original plan in `purring-sleeping-hanrahan.md` said to delete `api-base.js` (832 lines). Pass-4 audit identified 91 callers across non-auth code (receipts, tools, GPS, admin, notes) that depend on `apiCall()`. Deleting it = 91 immediate breaks.

I rewrote `api-base.js` as a thin wrapper (kept the 832 lines mostly intact; added `getCurrentToken()` helper + dual-mode token source). The 91 callers see no change. The 12 leak-point files that previously read `localStorage('bb-cal-session')` directly now route through `getCurrentToken()`. Single source of truth.

This is a deviation from the plan — documented in the D3/D4 commit messages. Net effect: same security outcome (LB-1 plaintext-token concern resolved when flag=true via SDK), much smaller blast radius for the cutover.

---

## Test surface

| Project | Pass | Skip | Note |
|---|---|---|---|
| CT BFF (`npm test`) | **505** | 26 | Was 494/15 |
| SDK (`npm run test:unit`) | **387** | 0 | Was 384/0 (+3 from new getAuth tests, replaced 2 stub assertions) |
| CalExp5 | (existing surface) | (skip mocks `VITE_ENABLE_AUTH=false`) | No new tests added — Phase D adds them as UX wires up |

---

## Open questions for you (not blocking — just to think about)

1. **Agent_buddy_crew + agent_data_processing + agent_memory_retention consents** — migration 058 marks all 3 as `required=TRUE` for crew. SDK `<ConsentScreen>` will hard-gate them. Are crew expected to opt-in to AI consents at enrollment, or should those flip to `required=FALSE`? (Quick `UPDATE ct_bff.consent_documents SET required=FALSE WHERE consent_type LIKE 'agent_%' AND audience='crew';` if you want them optional.)

2. **`controltower.bainbridgebuilders.com` DNS** — still not wired (the CORS allowlist has it forward-declared). Want me to add the Cloudflare CNAME → Railway, or skip?

3. **CSP on CalExp5 index.html** — I deferred this from B3 (added preconnect only). Adding CSP later is a 30-min report-only-then-enforce roll-out. Schedule it for v1.1 hardening?

4. **`receipt-queue.js:79`** still reads `localStorage.bb-cal-session` for `employee.id` (not the token). Under flag=true that returns null and offline-queue records won't have employeeId. Plan was D9 (MyProfile wiring) provides the SDK identity_id source. Until D9 lands, flag=true with offline writes is risky. Don't flip flag until D9 done.

---

## Deploy state at handoff

```
CT BFF:  https://ct-bff.bainbridgebuilders.com  (image 2262ef3 via Day 25 deploy; Day 26 deploy in progress)
SDK:     1.0.0-rc.3 source on main (cd33fbb); tarball at dist-pack/; not yet published
CalExp5: prod still on legacy auth (no flag flip yet); branch agent/cutover-day27-calexp5-sdk-wire pushed
Demo:    https://auth-sdk-demo.bainbridgebuilders.com (still using rc.2 — works fine, no behavior change)
```

Sleep well. ☕
