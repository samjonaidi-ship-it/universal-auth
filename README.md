# @samjonaidi-ship-it/universal-auth

**Bainbridge Builders universal authentication SDK.** One package; every BB consumer app uses it for login, session, enrollment, profile, offline queue, and entitlements.

- **Spec:** `BB_UNIVERSAL_AUTH_SDK_SPEC.md` v1.6.1 (internal repo)
- **Status:** **v1.1.0-rc.1 — Lane 3 release candidate** (published 2026-05-06)
- **Registry:** GitHub Packages, `@samjonaidi-ship-it` scope (restricted access)
- **Tests:** 614/614 pass; coverage 92.67% lines / 85.32% branches / 92.09% functions
- **Bundle:** core 11.93 KB / passkey 7.95 KB / sw 488 B (gzip-brotli)

## Install

```bash
npm install @samjonaidi-ship-it/universal-auth
```

Requires `.npmrc` configured for GitHub Packages — see `docs/INTEGRATION_GUIDE.md`.

## Quick start

```tsx
import { initUniversalAuth } from '@samjonaidi-ship-it/universal-auth';
import { AuthProvider, useAuth } from '@samjonaidi-ship-it/universal-auth/react';
import '@samjonaidi-ship-it/universal-auth/react/styles.css';

await initUniversalAuth({
  apiBaseUrl: 'https://api.buildwithbainbridge.com',
  appId: 'bb_express',
  mode: 'production',
  cookieDomain: '.buildwithbainbridge.com',
});

function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
```

`AuthProvider` and all React hooks/components live on the `/react` subpath so that imperative consumers (Node, non-React frameworks) don't pull React into their bundle.

## Package layout

- `@samjonaidi-ship-it/universal-auth` — core: `initUniversalAuth`, imperative `getAuth()`, flows (`requestCode`, `verifyCode`, …), errors, ABAC, entitlements, settings sync.
- `@samjonaidi-ship-it/universal-auth/react` — React `<AuthProvider>`, hooks (`useAuth`, `useEntitlements`, `useProfile`, …), and components (`<SignInForm>`, `<CodeEntry>`, `<DelegationCenter>`, …).
- `@samjonaidi-ship-it/universal-auth/sw` — service worker bundle for background-sync flush of the offline mutation queue.
- `@samjonaidi-ship-it/universal-auth/profile` — profile primitives (`uploadAvatar`, presets, validators); kept off the core barrel so libphonenumber stays out of the core bundle.
- `@samjonaidi-ship-it/universal-auth/extendability` — adapter interfaces (`NotificationChannelAdapter`).
- `@samjonaidi-ship-it/universal-auth/internal` — unstable / non-public surface (e.g. `setSession`); subject to change between minor versions.

## Development

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:unit
pnpm build
pnpm size-check
```

## Docs

- `docs/INTEGRATION_GUIDE.md` — for new consumer apps
- `docs/QA_RUNBOOK.md` — manual QA scenarios
- `docs/THREAT_MODEL.md` — security threat matrix
- `docs/CHANGELOG.md` — release history
- `audits/` — look-back audit reports (A1 through A6)

## License

Proprietary — Bainbridge Builders Inc. Not for redistribution.
