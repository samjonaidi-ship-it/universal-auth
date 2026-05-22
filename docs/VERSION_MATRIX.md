# VERSION MATRIX | BB_Universal_Auth | v1.8 | 2026-05-08 | BB

## Current Active Versions

| Component | Version | File | Last Modified |
|-----------|---------|------|---------------|
| Package | v1.1.0-rc.8 | `package.json` | 2026-05-08 |
| permission-grants | v1.1.1 | `src/flows/permission-grants.ts` | 2026-05-08 |
| SDK Core | v1.0.4 | `src/index.ts` | 2026-05-04 |
| Config | v1.1.4 | `src/config.ts` | 2026-05-08 |
| Errors | v1.0.3 | `src/errors.ts` | 2026-05-08 |
| Client | v1.1.1 | `src/core/client.ts` | 2026-05-08 |
| Token Manager | v1.1.3 | `src/core/token-manager.ts` | 2026-05-08 |
| Imperative API | v1.0.2 | `src/imperative/getAuth.ts` | 2026-05-08 |
| ESLint config | v1.0.0-rc.3 | `eslint.config.js` | 2026-05-08 |
| size-check-closure | v1.0.1 | `scripts/size-check-closure.ts` | 2026-05-08 |
| React Subpath | v1.0.6 | `src/react/index.ts` | 2026-05-08 |
| SW Subpath | v1.0.4 | `src/sw/index.ts` | 2026-05-04 |
| Profile Subpath | v1.0.1 | `src/profile/index.ts` | 2026-05-01 |
| Extendability | v1.0.0-rc.1 | `src/extendability/index.ts` | 2026-04-24 |
| Errors | v1.0.2 | `src/errors.ts` | 2026-05-08 |
| Entitlements | v1.2.2 | `src/core/entitlements.ts` | 2026-05-08 |
| useAuth | v1.0.1 | `src/react/useAuth.ts` | 2026-05-08 |
| useEntitlements | v1.0.1 | `src/react/useEntitlements.ts` | 2026-05-08 |
| useAccess | v0.1.1 | `src/react/useAccess.ts` | 2026-05-06 |
| useAccessBulk | v0.1.1 | `src/react/useAccessBulk.ts` | 2026-05-06 |
| ESLint config | v1.0.0-rc.2 | `eslint.config.js` | 2026-05-06 |
| Vitest config | v1.1.0-rc.5 | `vitest.config.ts` | 2026-05-08 |
| CI workflow | v1.1.1 | `.github/workflows/ci.yml` | 2026-05-08 |
| Chaos workflow | v1.2.2 | `.github/workflows/chaos.yml` | 2026-05-22 |
| Browser-matrix workflow | v1.0.6 | `.github/workflows/browser-matrix.yml` | 2026-05-22 |
| verify-watermarks | v1.0.3 | `scripts/verify-watermarks.ts` | 2026-05-08 |
| verify-version-sync | v1.0.0 (new) | `scripts/verify-version-sync.ts` | 2026-05-08 |
| Demo App | v1.0.0-rc.1 | `demo/src/App.tsx` | 2026-04-28 |

---

## Compatibility Matrix

| Package | Status | Notes |
|---------|--------|-------|
| v1.1.0-rc.7 | ✅ PUBLISH-READY | rc.6 audit-debt finish: BUILD-9 git index exec bit, 4 new typed soft-error classes (DpopFallbackError, LegacyRefreshResponseError, NoNavigatorLocksError, CnfJktMismatchError), getAuth().signOut(signal), AuthErrorCode JSDoc clarification, + 9 doc/test/comment items. 824/824 tests, branches 84.79 / threshold 84. |
| v1.1.0-rc.6 | 🟡 PUBLISHED | COV-1 finish + audit followups; superseded by rc.7. |
| v1.1.0-rc.5 | 🟡 PUBLISHED | 14/17 audit-debt items closed; superseded by rc.6. |
| v1.1.0-rc.4 | 🟡 PUBLISHED | First publishable v1.1 ship; superseded by rc.5. |
| v1.1.0-rc.3 | ⚠ UNPUBLISHED | Failed CI on 3 lint errors before tag — superseded by rc.4. |
| v1.1.0-rc.2 | ⚠ UNPUBLISHED | Failed CI on same 3 lint errors — superseded by rc.4. |
| v1.1.0-rc.1 | 🟡 PUBLISHED | First v1.1 ship — last public release before rc.4. P0+P1 hardening NOT included. |
| v1.0.4 | ✅ STABLE | Lane 2 ship: 614/614 tests, branch threshold 85% restored |
| v1.0.3 | ✅ STABLE | Scope rename only (`@bainbridgebuilders` → `@samjonaidi-ship-it`); bit-identical runtime to v1.0.2 |
| v1.0.2 | ✅ STABLE | Rcodex hardening pass — 31 bugs fixed |
| v1.0.1 | ✅ STABLE | Security hardening + D20/D21 propagation |
| v1.0.0 | 📜 GA | Initial GA — 541 tests, 93.97/86.00/92.43 coverage |

---

## Test gates (canonical numbers per CHANGELOG v1.0.4)

| | v1.0.0 GA | v1.0.1 | v1.0.2 | v1.0.3 | v1.0.4 |
|---|---|---|---|---|---|
| Test files | 60 | 80 | 80 | 80 | **93** |
| Tests passed | 541 | (hardening) | 535 | 536 | **614** |
| Tests skipped | 0 | — | 0 | 9 | **0** |
| Branch coverage | 86.00% | — | — | 83.68% | **85.32%** |
| Branch threshold | 85 | — | — | 83 | **85** |
| Line coverage | 93.97% | — | — | 91.5% | **92.67%** |
| Function coverage | 92.43% | — | — | — | **92.09%** |

---

## Version History

<details>
<summary>📜 v1.0.4 — Lane 2 ships (2026-05-04)</summary>

**Changes:** Test cleanup + new coverage + small SDK extensions. 9 hydrate-race tests un-skipped + refactored. +29 new test cases / 7 new files. New `X-Device-Id` header on authenticated requests. New `lastDriftEvent` field on `useImpersonation()`. Branch threshold restored 83 → 85. `isTrustedClient` extracted to unit-testable helper.

**Package:** `@samjonaidi-ship-it/universal-auth` v1.0.4
**Tested:** 93 files, 614 tests, 0 skipped, 0 failures.

</details>

<details>
<summary>📜 v1.0.3 — Scope rename (2026-05-03)</summary>

**Changes:** Package renamed `@bainbridgebuilders/universal-auth` → `@samjonaidi-ship-it/universal-auth`. Repo transferred from `BainbridgeBuilders/universal-auth` → `samjonaidi-ship-it/universal-auth`. Watermarks + workflow files updated. Bit-identical runtime to v1.0.2.

**Package:** `@samjonaidi-ship-it/universal-auth` v1.0.3

</details>

<details>
<summary>📜 v1.0.2 — Rcodex hardening pass (2026-05-02)</summary>

**Changes:** Rcodex v13.14 --auto full review (5 waves, 15 agents). 31 bugs fixed. TypeScript: 0 errors. 80 files / 535 tests / 0 failures (3-zero verified). Key fixes: token-manager invalidate, settings-sync changed_keys, storage clearAllSessionState, ConsentVersionWatcher focus trap, 5 test body correctness fixes.

**Package:** `@samjonaidi-ship-it/universal-auth` v1.0.2

</details>

<details>
<summary>📜 v1.0.1 — Security hardening (2026-05-01)</summary>

**Changes:** v1.0.1 audit closure — 12 critical/high findings fixed. D20 + D21 propagation: `cookieDomain` defaults to `.buildwithbainbridge.com`, `apiBaseUrl` defaults to `https://api.buildwithbainbridge.com`. Non-extractable AES-256-GCM CryptoKey for at-rest encryption. Cross-tab refresh via `navigator.locks`. `setSession` moved to `/internal` subpath. Demo URL retired.

**Package:** `@samjonaidi-ship-it/universal-auth` v1.0.1

</details>

<details>
<summary>📜 v1.0.0 — Initial GA (2026-04-30)</summary>

**Changes:** First stable release. A5 audit gate #1 cleared. 541 tests, coverage 93.97/86.00/92.43/93.97. Demo at `auth-sdk-demo.bainbridgebuilders.com` (later retired in v1.0.1).

</details>

---

## Cross-Reference Checklist

When bumping a version, update ALL of these:

- [ ] `package.json` version bumped
- [ ] `docs/CHANGELOG.md` entry added
- [ ] `docs/RELEASE_NOTES.md` updated (GA milestones only — patches go in CHANGELOG)
- [ ] `docs/VERSION_MATRIX.md` updated (this file)
- [ ] Affected source watermarks bumped
- [ ] Build verified: `pnpm run build`
- [ ] Tests pass: `pnpm run test:unit`

---

## File Location Index

```
BB_Universal_Auth/
├── src/
│   ├── index.ts               # Core entry point
│   ├── config.ts              # Config
│   ├── errors.ts              # Error types
│   ├── core/                  # Token, session, crypto, storage
│   ├── flows/                 # Auth flows (code, passkey, consent…)
│   ├── react/                 # React hooks + components
│   ├── offline/               # Offline queue + reconciler
│   ├── profile/               # Profile management
│   ├── extendability/         # Plugin/extension points
│   ├── types/                 # Shared type definitions
│   └── sw/                    # Service worker
├── test/                      # Test suites (unit, integration, security…)
├── demo/                      # Demo Vite app (local-only post-v1.0.1)
├── docs/                      # SDK documentation
└── docs/VERSION_MATRIX.md     # This file
```

---

*Updated: 2026-05-04 | Lane 2 ships | BB*
