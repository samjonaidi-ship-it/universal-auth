# VERSION MATRIX | BB_Universal_Auth | v1.1 | 2026-05-02 | BB

## Current Active Versions

| Component | Version | File | Last Modified |
|-----------|---------|------|---------------|
| SDK Core | v1.0.2 | `src/index.ts` | 2026-05-02 |
| Config | v1.0.2 | `src/config.ts` | 2026-05-02 |
| React Subpath | v1.0.1 | `src/react/index.ts` | 2026-05-02 |
| SW Subpath | v1.0.1 | `src/sw/index.ts` | 2026-05-02 |
| Profile Subpath | v1.0.1 | `src/profile/index.ts` | 2026-05-02 |
| Extendability | v1.0.1 | `src/extendability/index.ts` | 2026-05-02 |
| Demo App | v1.0.1 | `demo/src/App.tsx` | 2026-05-02 |

---

## Compatibility Matrix

| SDK Core | React | SW | Profile | Status | Notes |
|----------|-------|----|---------|--------|-------|
| v1.0.2 | v1.0.1 | v1.0.1 | v1.0.1 | ✅ STABLE | Current release — Rcodex hardening pass |
| v1.0.1 | v1.0.1 | v1.0.1 | v1.0.1 | ✅ STABLE | Previous release — security hardening branch |

---

## Version History

<details>
<summary>📜 v1.0.2 - Rcodex Hardening Pass (2026-05-02)</summary>

**Changes:**
- Rcodex v13.14 --auto full review pass (5 waves, 15 agents)
- 31 bugs fixed across core, UI, tests, playwright config
- TypeScript: 0 errors (fixed crypto-worker.ts TS2339 + VehicleSection exactOptionalPropertyTypes)
- Tests: 80 files / 535 tests / 0 failures (3-zero verified)

**Key fixes:**
- `token-manager.ts`: invalidateAccessToken() added
- `settings-sync.ts`: changed_keys fix
- `storage.ts`: clearAllSessionState includes DEAD_LETTER_QUEUE
- `ConsentVersionWatcher.tsx`: WCAG 2.1 SC 2.1.2 focus trap
- 5 test body correctness fixes (enroll-flow, client, settings-conflict, sw-bridge, config-init)

**Package:** `@samjonaidi-ship-it/universal-auth` v1.0.2
**Tested:** 80/80 files, 535/535 tests, 0 failures (3 consecutive passes)

</details>

<details>
<summary>📜 v1.0.1 - Security Hardening (2026-05-02)</summary>

**Changes:**
- Security hardening pass (v1.0.1-hardening branch)
- Rcodex --auto review pass

**Files Reviewed:**
- All 81 src files (see .rcodex/AGENT_HANDOFF.md)

**Package:** `@samjonaidi-ship-it/universal-auth` v1.0.1
**Tested:** See TEST_LOG.md

</details>

<details>
<summary>📜 v1.0.0 - Initial Release</summary>

**Changes:**
- Initial SDK implementation
- Core auth flows, React hooks, offline queue, passkey support

</details>

---

## Cross-Reference Checklist

When bumping a version, update ALL of these:

- [ ] `package.json` version bumped
- [ ] `CHANGELOG.md` entry added
- [ ] `docs/RELEASE_NOTES.md` updated
- [ ] `VERSION_MATRIX.md` updated (this file)
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
├── demo/                      # Demo Vite app
├── docs/                      # SDK documentation
└── docs/VERSION_MATRIX.md     # This file
```

---

*Updated: 2026-05-02 | Rcodex v13.14 | BB*
