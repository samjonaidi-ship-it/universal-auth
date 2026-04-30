# Manual QA Runbook | `@bainbridgebuilders/universal-auth` | v1.0.0-rc.4 | 2026-04-30 | BB

A5 audit gate #8 — 40 scenarios per spec §11.10. Run before each `1.0.0-rc.N` → `1.0.0` GA promotion.

**Scope:** human-driven scenarios that complement the automated test pyramid. These exercise UX, race conditions, and cross-platform behavior the unit/integration suites can't fully verify.

**Estimated time:** ~3 hours for full pass.

**Target environment:** demo deployed at `https://auth-sdk-demo.bainbridgebuilders.com` against `https://ct-bff.bainbridgebuilders.com`.

**Convention:**
- ✅ = expected pass criterion
- ❌ = explicit anti-criterion (the thing that MUST NOT happen)
- 📸 = screenshot required for sign-off

---

## Section A — Happy path enrollment + sign-in (5 scenarios)

### A1 — New crew member: enrollment via magic-link → consent → passkey → land on dashboard
**Why**: full first-time onboarding flow.
**Steps**:
1. Admin issues magic-link invite via Wizard (target email `qa+crew@bainbridgebuilders.com`)
2. Open the magic link in fresh Chrome incognito
3. Enter 6-digit code from inbox
4. Tick all 9 required + 3 optional consents
5. Set up passkey via `<PasskeyPrompt>` (or skip → email-code fallback)
6. Land on persona-specific dashboard
**Expected**:
- ✅ ConsentScreen shows exactly 9 required + 3 optional for crew audience
- ✅ Passkey ceremony succeeds (or skip works)
- ✅ Land on `/crew` route (or app's configured `landing_route` for persona='crew')
- ✅ `useAuth().status === 'authenticated'`
- ❌ No console errors
- 📸 ConsentScreen, PasskeyPrompt, dashboard

### A2 — Returning user: passkey Conditional UI auto-fills sign-in
**Why**: §3.1 second-sign-in path.
**Steps**:
1. Sign out from A1's session
2. Reload sign-in page
3. Click email field → browser passkey autocomplete chip appears
4. Select stored passkey
**Expected**:
- ✅ No magic-link prompt — Conditional UI authenticates directly
- ✅ Lands on dashboard within ~2s
- ✅ `acr: hwk` recorded in `/auth/v1/me` session_meta
- 📸 Conditional UI chip

### A3 — Code-only fallback when passkey not available
**Why**: degradation path for older browsers / no biometric.
**Steps**:
1. Sign out
2. Reload in Firefox 115 (no Conditional UI support)
3. Type email → request code → enter 6-digit
**Expected**:
- ✅ `<PasskeyPrompt>` does NOT render (capability detection)
- ✅ CodeEntry → 6-digit accepts, lands on dashboard
- ✅ `acr: pwd` (or `otp`) on `/me`

### A4 — Mid-enrollment abandonment recovers
**Why**: user closes tab during ConsentScreen.
**Steps**:
1. Click magic-link, enter code, reach ConsentScreen
2. Close tab without ticking consents
3. Re-open same magic-link 5 min later
**Expected**:
- ✅ Server accepts re-use of token within 24h TTL
- ✅ Returns to ConsentScreen at the same step (no double-bill, no token replay error)
- ❌ Does NOT re-prompt for code

### A5 — Brand-new persona (homeowner) enrolment
**Why**: homeowner is the newest persona (PCP v1.0 §3.4); 6 required + 3 optional consents.
**Steps**:
1. Admin invites a homeowner identity
2. Magic-link → code → ConsentScreen
**Expected**:
- ✅ ConsentScreen lists exactly 6 required (privacy_policy, terms_of_service, service_agreement, property_data_processing, buddy_homeowner_agent, maintenance_data_retention) + 3 optional
- ✅ ConsentScreen does NOT show crew-only consents (employee_data_processing, geolocation, etc.)

---

## Section B — Offline → online behavior (5 scenarios)

### B1 — Single mutation queued offline, flushes on reconnect
**Why**: §9.4 reconciler basic path.
**Steps**:
1. Sign in, navigate to a profile-edit screen
2. Open DevTools Network → set to "Offline"
3. Edit phone number, submit
4. Verify "queued offline" indicator
5. Set Network back to "Online"
**Expected**:
- ✅ `<OfflineIndicator>` shows offline state
- ✅ Edit form shows pending state, doesn't error
- ✅ Within 5s of reconnect, mutation flushes (network panel shows POST)
- ✅ Server responds 2xx, queue empties

### B2 — 5 mutations queued offline, flush in FIFO order
**Why**: queue ordering correctness.
**Steps**:
1. Go offline
2. Make 5 different profile edits in rapid succession (phone, address line1, city, etc.)
3. Reconnect
4. Inspect server-side audit log
**Expected**:
- ✅ All 5 mutations appear in audit log in submitted order
- ✅ No duplicates (Idempotency-Key dedupes any retry)

### B3 — Offline queue survives tab refresh
**Why**: IDB persistence.
**Steps**:
1. Go offline
2. Submit 1 mutation
3. Hard-refresh tab while still offline
4. Reconnect
**Expected**:
- ✅ Pending mutation persisted in IDB
- ✅ Flushes after reconnect

### B4 — Offline mutation gets 4xx on flush — does NOT retry
**Why**: §9.4 reconciler 4xx-deletes path.
**Steps**:
1. Go offline
2. Submit a mutation that will fail validation server-side (e.g., malformed phone)
3. Reconnect
**Expected**:
- ✅ Server returns 400
- ✅ Mutation removed from queue (no retry storm)
- ✅ User sees error toast / inline message
- ❌ Does NOT silently re-attempt

### B5 — 7-day offline grace on entitlements
**Why**: §9.5 graceful read-only.
**Steps**:
1. Sign in (entitlements cached)
2. Go offline for 6 days
3. Open app → entitlements still resolve (cached)
4. Continue offline → day 8 → entitlements expired
**Expected**:
- ✅ Days 1-7: app fully functional offline (cached aggregate.features)
- ✅ Day 8+: degraded mode (read-only) until next online sign-in

---

## Section C — Multi-tab + concurrency (5 scenarios)

### C1 — Sign-in in Tab A propagates to Tab B
**Why**: BroadcastChannel cross-tab adoption.
**Steps**:
1. Open app in Tab A and Tab B (both signed-out)
2. Sign in in Tab A
3. Switch to Tab B without refreshing
**Expected**:
- ✅ Tab B picks up the session within 1s
- ✅ `<SignInForm>` swaps to authenticated UI
- ✅ Same `identity_id` in both tabs

### C2 — Sign-out in Tab A invalidates Tab B
**Why**: revocation propagation.
**Steps**:
1. Sign in to two tabs (mirror of C1)
2. Sign out in Tab A
3. Switch to Tab B
**Expected**:
- ✅ Tab B detects session-revoked within 60s (poll cycle) — or instantly via BroadcastChannel if implemented
- ✅ Tab B redirects to `<SignInForm>`
- ❌ Stale token does NOT continue to work for protected reads

### C3 — Multi-tab refresh race coalesces to 1 network call
**Why**: Shared Worker mutex.
**Steps**:
1. Sign in
2. Open 5 tabs of the same app
3. Wait for token expire (use `mode: 'development'` for accelerated 1-min TTL)
4. Trigger first authenticated read in all 5 tabs simultaneously
5. Inspect Network panel
**Expected**:
- ✅ Exactly 1 call to `/auth/v1/session/refresh` (Shared Worker coalesces)
- ✅ All 5 tabs continue with new access token
- ❌ No race-condition-induced 401 in any tab

### C4 — Tab crash + restore preserves session
**Why**: IDB persistence + recovery.
**Steps**:
1. Sign in (passkey)
2. Force-close browser process (Task Manager)
3. Re-open browser, navigate to app
**Expected**:
- ✅ Session re-hydrates from IDB
- ✅ User is still signed in
- ✅ Token refreshes if needed (may be expired)

### C5 — Browser private window: doesn't leak between sessions
**Why**: storage isolation.
**Steps**:
1. Sign in as user A (regular window)
2. Open private window, navigate to app
**Expected**:
- ✅ Private window shows `<SignInForm>` (no session)
- ❌ Private window does NOT inherit user A's tokens

---

## Section D — Passkey browser matrix (3 scenarios)

### D1 — iOS Safari 17+
**Why**: most-used WebAuthn target on mobile.
**Steps**:
1. On iPhone (real device, iOS 17+), Safari
2. Magic-link sign-in → passkey register
3. Verify Face ID prompt
4. Sign out, sign back in via Conditional UI
**Expected**:
- ✅ Passkey registration completes via Face ID
- ✅ Re-auth surfaces Conditional UI chip in QuickType bar
- 📸 Face ID prompt + Conditional UI chip

### D2 — Android Chrome 120+
**Why**: largest Android Webauthn footprint.
**Steps**:
1. Pixel 7 or similar, Chrome 120+
2. Same flow as D1 but with fingerprint / device PIN
**Expected**:
- ✅ Registration via fingerprint
- ✅ Re-auth via Conditional UI in autofill
- 📸 fingerprint prompt

### D3 — macOS Safari 17+ with iCloud Keychain sync
**Why**: passkey portability across Apple devices.
**Steps**:
1. Register passkey on macOS Safari
2. Switch to iPhone (same iCloud account)
3. Open app on iPhone Safari → sign in
**Expected**:
- ✅ iPhone sees the same passkey via iCloud sync
- ✅ Authenticates via Face ID (no re-registration)

---

## Section E — Impersonation (3 scenarios)

### E1 — Admin impersonates a user, banner persists across navigation
**Why**: §11.10 explicit scenario; audit-trail integrity.
**Steps**:
1. Sign in as admin
2. From admin SPA, click "Impersonate user X"
3. Navigate through 5 different routes in the consumer app
**Expected**:
- ✅ `<ImpersonationBanner>` renders at top throughout
- ✅ Banner shows admin's name + impersonated user's name
- ✅ Server-side audit log has rows for every action with both `identity_id` (real admin) and `acting_as` (target)
- 📸 banner across 3 different pages

### E2 — Stop impersonation reverts to admin's own session
**Why**: clean exit path.
**Steps**:
1. From E1 state, click "Stop impersonating"
**Expected**:
- ✅ Banner disappears
- ✅ App reflects admin's own identity (their name in header, their menu items)
- ✅ Subsequent server actions log as admin only (no `acting_as`)

### E3 — Impersonation session does NOT survive admin tab close
**Why**: short-lived impersonation token, security.
**Steps**:
1. Start impersonation in Tab A
2. Close Tab A entirely
3. Open new Tab B
**Expected**:
- ❌ Tab B does NOT auto-resume impersonation
- ✅ Tab B reflects admin's own session

---

## Section F — Settings sync + 409 conflict (3 scenarios)

### F1 — New device gets settings restored on first sign-in
**Why**: §11.10 explicit scenario.
**Steps**:
1. On Device 1 (Chrome), set custom theme + language preferences
2. On Device 2 (Firefox, same identity), sign in
**Expected**:
- ✅ Settings re-hydrate from server within 1s of sign-in
- ✅ Theme + language match Device 1
- ✅ `settings.restored` event fires on Device 2

### F2 — 409 conflict on stale If-Match → SDK rehydrates + retries
**Why**: §3.3 optimistic locking.
**Steps**:
1. Open Tab A, change setting X
2. Open Tab B (same identity), change setting Y simultaneously
3. Tab B was on stale version
**Expected**:
- ✅ Tab B's PUT returns 409
- ✅ SDK silently re-fetches latest, re-applies user's intent on top, retries PUT
- ✅ Final server state has both X and Y changes
- ❌ User does NOT see error UI

### F3 — Settings sync is debounced
**Why**: avoid PUT-storm.
**Steps**:
1. Toggle a setting on/off rapidly 10 times in 2 seconds
2. Inspect Network panel
**Expected**:
- ✅ At most 1-2 PUTs (500ms debounce)
- ✅ Final state matches last toggle

---

## Section G — Rate limit + error UX (3 scenarios)

### G1 — 5 wrong-code attempts → account lock w/ clear message
**Why**: §3.7 + §15.3 brute-force defense.
**Steps**:
1. Request code, enter wrong 6-digit 5 times
**Expected**:
- ✅ After attempt 5, server returns `AUTH_RATE_LIMITED` or account-lock code
- ✅ SDK surfaces clear message: "Too many attempts. Try again in 15 minutes."
- ❌ Generic 500 / "Something went wrong" — must be human-actionable

### G2 — 11 code-request rapid-fire → 429
**Why**: per-email/IP throttle.
**Steps**:
1. Hit "Send code" button 11 times in 60s
**Expected**:
- ✅ Request 11 returns 429
- ✅ SDK surfaces "Too many requests" with `Retry-After` countdown
- ✅ Buttondisables for the cooldown window

### G3 — Custody-chain incomplete → correct blocker surfaced
**Why**: §3.7 + Wizard §2 — 6 sub-codes.
**Steps**:
1. Manually break custody chain server-side (e.g., remove subscription row)
2. User attempts sign-in
**Expected**:
- ✅ Server returns `PROVISIONING_INCOMPLETE` with `blocker: 'no_subscription'` (or matching)
- ✅ SDK shows persona-appropriate message: "Your account isn't ready yet — contact your admin"
- ✅ Each blocker code maps to a specific message (no_app_registration, identity_disabled, etc.)

---

## Section H — Plan + persona transitions (3 scenarios)

### H1 — Plan suspension mid-session: feature hides
**Why**: entitlement cache invalidation.
**Steps**:
1. Sign in with paid plan
2. Use a paid feature (e.g., admin dashboard)
3. From a separate admin window, suspend the user's plan
4. User performs another action
**Expected**:
- ✅ Within stale-while-revalidate window (5 min), entitlement invalidates
- ✅ Paid feature UI grays out / hides
- ❌ User does NOT silently keep paid access indefinitely

### H2 — Persona changes mid-session (client → homeowner via Stripe webhook)
**Why**: PCP v1.0 §4.4 transition flow.
**Steps**:
1. Sign in as `client` persona (lead/prospect, no property)
2. Trigger Stripe subscription webhook (or manual DB change) → `persona_type: homeowner`
3. User reloads app
**Expected**:
- ✅ `profile.persona_changed` event fires
- ✅ ConsentVersionWatcher detects new required consent set (homeowner audience)
- ✅ Re-prompts for new required consents
- ✅ After accept, app reflects homeowner-specific UI

### H3 — Multi-persona identity: switch active persona
**Why**: §D2.4 v1.3.0 multi-persona.
**Steps**:
1. Sign in as identity that has 2+ personas (e.g., admin who's also a homeowner)
2. Use `<PersonaChooser>` to switch
**Expected**:
- ✅ `useAuth().activePersona` changes
- ✅ Available features update per new persona
- ✅ `<AgentStatusBanner>` (if applicable) reflects new context

---

## Section I — SMS + email channels (3 scenarios)

### I1 — SMS delivery failure → email fallback
**Why**: §11.10 explicit; F4 audit (`ALLOW_SMS=false` in v1.0 means SMS isn't actually used; this scenario only applies when re-enabled).
**Steps**:
1. (Set `ALLOW_SMS=true` in dev mode)
2. Request code via SMS to a number that returns Twilio failure
3. Wait 30s
**Expected**:
- ✅ SDK falls back to email channel automatically
- ✅ User sees: "We couldn't reach your phone, sent code to your email instead"
- ✅ Code via email succeeds

### I2 — Email delivery succeeds (Resend)
**Why**: primary channel happy path.
**Steps**:
1. Standard sign-in flow
**Expected**:
- ✅ Code email arrives within 30s
- ✅ Email body contains 6-digit code, no clickable link (D3 — defeats Safe Links)
- ✅ Sender domain matches BB sending domain (auth.bainbridgebuilders.com)

### I3 — Magic-link via email survives Outlook/Gmail Safe Links pre-fetch
**Why**: §3.1bis + §15.3 T5.
**Steps**:
1. Send magic-link to a corporate inbox known to pre-fetch (Outlook 365 or Gmail with Safe Links)
2. Don't click — wait 5 min
3. Click the link
**Expected**:
- ✅ Token still valid on click (POST-only verification doesn't get consumed by GET pre-fetch)
- ✅ Standard enrollment flow proceeds

---

## Section J — Mode banners + safety (2 scenarios)

### J1 — Dev/test/e2e modes show banner; production mode doesn't
**Why**: §10 mode visibility.
**Steps**:
1. Run demo with `mode: 'development'`
**Expected**:
- ✅ Banner: "DEV MODE — short TTLs, code echoed in response"
- ✅ Code echoed in `/code/request` response (dev convenience)
- 📸 banner

### J2 — Production-mode safety assertion: dev mode forbidden on prod hostname
**Why**: §10.6 safety.
**Steps**:
1. Configure `mode: 'development'` but run against `*.bainbridgebuilders.com` (NOT a `localhost` / `*.test` host)
**Expected**:
- ✅ `initUniversalAuth()` throws immediately with clear error
- ❌ App does NOT render at all (init throws before AuthProvider mounts)

---

## Section K — Profile module (PCP v1.0) (5 scenarios)

### K1 — Crew adds vehicle resource + photos
**Why**: PCP v1.0 §3.3 multi-media first-class.
**Steps**:
1. Sign in as crew
2. Navigate to MyProfile → Vehicle section
3. Click "Add vehicle", fill make/model/year/plate
4. Add 3 photos (drag-drop or file picker)
5. Save
**Expected**:
- ✅ Vehicle resource appears with all attributes
- ✅ All 3 photos render as thumbnails
- ✅ Each photo accessible from R2 via signed URL
- ✅ Reload → vehicle persists

### K2 — Homeowner adds 2 properties, each with HVAC asset
**Why**: PCP v1.0 §3.3 property → property_assets pattern.
**Steps**:
1. Sign in as homeowner
2. Add property #1 (address, year_built, sqft)
3. Add HVAC asset under property #1 (brand, install_date)
4. Repeat for property #2
**Expected**:
- ✅ Both properties listed in PropertySection
- ✅ Each property's nested assets render correctly
- ✅ Archiving property #1 does NOT affect property #2 (scope isolation)

### K3 — Profile completeness bar reflects missing required fields
**Why**: PCP v1.0 §3.4 completeness scoring.
**Steps**:
1. Sign in as crew with partial profile (no emergency_contact)
2. Open MyProfile
**Expected**:
- ✅ `<CompletenessBar>` shows < 60% (since required field missing)
- ✅ Lists "Emergency contact" as missing
- ✅ Color is yellow/red (not green)
- ✅ After adding emergency_contact, bar jumps green

### K4 — Persona-fields-registry drives form fields
**Why**: PCP v1.0 §2 — modular per-persona schema.
**Steps**:
1. Sign in as supplier
2. Open MyProfile
**Expected**:
- ✅ Fields shown match supplier's `profile_schema.required[]` (display_name, phone, company)
- ✅ Crew-only fields (vehicle, gear, emergency_contact) NOT shown
- ✅ Homeowner-only fields (property) NOT shown

### K5 — User_metadata writable; app_metadata read-only
**Why**: PCP v1.0 §3.1 Auth0 two-bucket pattern.
**Steps**:
1. Sign in
2. Try to PUT `/identity/v1/profile` with `app_metadata` field
3. Try same with `user_metadata` field
**Expected**:
- ✅ `app_metadata` PUT → 400 BAD_REQUEST
- ✅ `user_metadata` PUT → 200 OK, persists
- ✅ Server-managed `app_metadata` (qbt_id, hire_date, etc.) shows in GET but NOT modifiable

---

## Section L — Consent + permission center (3 scenarios)

### L1 — User reviews + withdraws an optional consent
**Why**: PCP v1.0 §4 GDPR Art. 7 withdraw-as-easy-as-grant.
**Steps**:
1. Sign in (with marketing consent already accepted)
2. Open ConsentCenter
3. Click "Withdraw" on `marketing_communications`
**Expected**:
- ✅ Consent moves to History section with revoked_at timestamp
- ✅ Reload → still revoked
- ✅ Server `identity_consents` row has `status: withdrawn`

### L2 — Policy version bump triggers re-prompt
**Why**: PCP v1.0 §4.5 versioning + ConsentVersionWatcher.
**Steps**:
1. Sign in (privacy_policy v1.0 accepted)
2. Admin pushes privacy_policy v2.0 to `consent_documents`
3. User reloads app
**Expected**:
- ✅ ConsentVersionWatcher surfaces re-acceptance modal
- ✅ Modal shows ONLY the changed required documents
- ✅ Cannot dismiss without accepting (or signing out)

### L3 — Permission center reflects browser permission state + revoke
**Why**: PCP v1.0 §5.1 W3C Permissions API mirror.
**Steps**:
1. Sign in (camera permission granted)
2. Open PermissionCenter
3. Click "Revoke" on camera grant
**Expected**:
- ✅ Server `permission_grants` row gets `revoked_at`
- ✅ App's photo-upload features hide / disable
- ✅ Future requests for camera state return `revoked`
- ⚠️ Note: SDK cannot revoke browser-side permission programmatically (must visit browser settings); UX must inform user

---

## Sign-off

- [ ] All 40 scenarios passed (or documented exception per scenario)
- [ ] QA reviewer name + date: __________
- [ ] Failed-scenario report attached (if any failures)

**Required for `1.0.0` GA tag** per A5 audit gate #8.

---

*v1.0.0-rc.4 expansion of spec §11.10's 14 enumerated scenarios → 40 by adding negative cases (G1-G3 rate limit, B4 4xx-non-retry), edge cases (C5 private window, F2 409 conflict, A4 mid-flow abandon), and PCP v1.0 coverage (K1-K5 profile, L1-L3 consent/permission center).*
