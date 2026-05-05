# @samjonaidi-ship-it/universal-auth

**Bainbridge Builders universal authentication SDK.** One package; every BB consumer app uses it for login, session, enrollment, profile, offline queue, and entitlements.

- **Spec:** `BB_UNIVERSAL_AUTH_SDK_SPEC.md` v1.6.1 (internal repo)
- **Status:** **v1.0.4 — Maintenance release** (published 2026-05-04)
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
import { initUniversalAuth, AuthProvider, useAuth } from '@samjonaidi-ship-it/universal-auth';

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

## Package layout

- `@samjonaidi-ship-it/universal-auth` — core (token management, offline queue, events, config)
- `@samjonaidi-ship-it/universal-auth/react` — React hooks + components
- `@samjonaidi-ship-it/universal-auth/sw` — service worker helper for background sync

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
