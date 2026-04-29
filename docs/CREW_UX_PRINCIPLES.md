# Crew UX Principles | BB Universal Auth + BB Express | v1.0.0 | 2026-04-29 | BB

> Field crew use this app **with gloves on and dirty hands**, often in
> bright sunlight, on small phone screens, while standing on a job site.
> Every UX decision is filtered through this constraint. **Tactile
> precision is a luxury we don't have.**

---

## The 5 tenets

### 1. Avoid typing whenever possible

Typing is the most expensive interaction at the jobsite. Gloves reduce
keyboard accuracy, dirty/wet fingers misregister, sun glare obscures
auto-suggestion popups, ambient noise prevents speech-to-text confidence.

**Rules:**
- Returning users sign in via a **tap target** (recent-users picker), not by
  re-typing their email. See `CrewSignInGate.jsx`.
- Forms persist last-known values per-device. Re-entry is opt-in.
- Where typing is unavoidable, use the right input modes:
  - `inputmode="email"` for emails (gives the @ key)
  - `inputmode="tel"` for phone numbers
  - `inputmode="numeric"` for codes, PINs, hours
  - `autocomplete="*"` for browser autofill (one tap to populate)
- For codes, prefer **paste-from-email** flows (single gesture) over
  digit-by-digit entry.
- Voice input is a fallback, not the default — site noise compromises it.

### 2. Big tap targets — 88×88 ideal, 44×44 minimum

The WCAG 2.2 minimum is 44×44 px. **Crew minimum is 88×88** (twice that)
for primary actions on the sign-in / dashboard / day-entry screens.

**Rules:**
- Primary action buttons: ≥56px height, full-width on mobile
- User picker tiles: ≥88px tall, single-column on small phones
- Day cells in the calendar: ≥48px wide on a 360px viewport
- Avoid stacking small tap targets within 8px of each other

### 3. High contrast, big text, dark surface

- Minimum body font: 14px (16px preferred for jobsite use)
- Headings: ≥1.25rem
- Background: dark (`#111111`) reduces glare; text near-white (`#f5f5f5`)
- Errors: `#ff6b6b` (lighter red — works on dark bg)
- Never light-text-on-light-bg or vice versa
- Never rely on color alone to convey state — always pair with icon or text

### 4. Forgiving + recoverable

A misclick at a jobsite shouldn't cost progress. Examples:
- Sign-out from the user menu prompts **only when you have unsaved work**
- The sign-in code-entry path remembers your email if the OTP times out;
  doesn't force re-typing
- "Try again" buttons appear on every error state
- Server failures show **what happened + what to do**, not "Error 500"

### 5. Persistence first

Every meaningful state survives:
- Page refresh (zustand persist + IDB)
- Network loss (offline queue + reconciler)
- Sign-out + back in (server-side per-identity profile/settings)
- Device change (per-identity DB-backed sync)

The user should **never feel they have to re-enter something they
already entered.** This is the difference between an app the crew
trusts and one they fight.

---

## Specific patterns

### Sign-in (returning user)

**Goal:** ≤2 taps from "open app" to "verifying code"

```
Open app
  → Recent users picker shows last 5 sign-ins on this device
  → Tap your face/name (1 tap)
  → SDK fires /code/request automatically
  → CodeEntry renders with your email shown (don't make them re-read)
  → Read OTP from email app, enter 6 digits
  → Auto-submit on 6th digit (no "Verify" button tap)
  → Signed in
```

**Built**: `CrewSignInGate.jsx` (CalExp5).
**Source of truth**: `localStorage('bb-recent-users')` — max 5 entries,
oldest evicted on overflow. Tap "×" on a tile to forget.

### Sign-in (first time, no recents)

**Goal:** ≤4 taps from "open app" to "verifying code" — typing 1 email
unavoidable.

```
Open app
  → No recents → fresh email entry form
  → Tap email field (1) → type email (autocomplete kicks in for browser-
    remembered emails) → tap Send code (2)
  → Read OTP → tap field (3) → type code → auto-submit on 6th digit
  → Signed in
```

After first sign-in, this device is in the recent-users list. Next
sign-in is the 2-tap path above.

### Profile editing

**Goal:** infrequent, but when used, simple.

- Single-column form, big inputs (≥52px)
- Save button is **sticky at bottom** so they never have to scroll back up
- Avatar picker is **preset-first** (20 SVG presets) — photo upload is
  a secondary option (camera UX with gloves is awful)
- Phone field uses `inputmode="tel"`; locale/timezone are dropdowns,
  not free-text

**Built**: `MyProfileSdk.jsx` (CalExp5). Backed by SDK `useProfile()` →
`/identity/v1/profile` (CT BFF) + `/identity/v1/profile/avatar` (R2).

### Daily timesheet entry

(Out of scope for this doc — addressed in `CalExp5/docs/MONTHVIEW_UX.md`)

---

## Anti-patterns (don't ship)

- ❌ Modal dialogs that require precise close-X taps (use full-screen
  with a big "Done" button instead)
- ❌ Multi-step wizards that lose state on accidental back-button
- ❌ Drop-down selects where the option list is longer than the viewport
  (gloved scrolling is jittery — use radio cards or pages instead)
- ❌ Real-time validation that flashes red while still typing
- ❌ Toasts that auto-dismiss in <4 seconds (jobsite crew often look
  away while a toast is on screen)
- ❌ Tooltips on hover (touch devices have no hover; trapping
  information behind hover loses it)

---

## Audit checklist (for new screens)

Before shipping any new SDK component or CalExp5 view, walk through:

- [ ] Tap targets ≥ 44×44 minimum, 88×88 for primary actions
- [ ] Body text ≥ 14px (16px preferred)
- [ ] Color-blind safe (test with Sim Daltonism / contrast tools)
- [ ] Works in bright sunlight (test on real device outdoors if
  possible)
- [ ] Works with one thumb on a 360px-wide viewport
- [ ] Works in airplane mode (offline-first or graceful degrade)
- [ ] Survives a page refresh without re-typing
- [ ] Recovery path on every error
- [ ] No interaction takes more than 3 taps unless it's a one-time event
  (enrollment, profile edit) — daily flows must be 1-2 taps

---

*Living document. Updated as we learn from real jobsite use.*
