# @bb/universal-auth

**Bainbridge Builders universal authentication SDK.** One package; every BB consumer app uses it for login, session, enrollment, profile, offline queue, and entitlements.

- **Spec:** `BB_UNIVERSAL_AUTH_SDK_SPEC.md` v1.5.0 (internal repo)
- **Status:** **v1.0.0 — General Availability** (published 2026-04-30)
- **Registry:** GitHub Packages, `@bainbridgebuilders` scope (restricted access)
- **Tests:** 541/541 pass; coverage 93.97% lines / 86.00% branches / 92.43% functions
- **Bundle:** core 11.93 KB / passkey 7.95 KB / sw 488 B (gzip-brotli)

## Install

```bash
npm install @samjonaidi-ship-it/universal-auth
```

> Note: the package is published as `@samjonaidi-ship-it/universal-auth` on GitHub Packages (the npm scope must match the GitHub org that owns the registry). Internal code + watermarks still refer to the short form `@bb/universal-auth` as a brand identifier — both refer to the same thing.

Requires `.npmrc` configured for GitHub Packages — see `docs/INTEGRATION_GUIDE.md`.

## Quick start

```tsx
import { initUniversalAuth, AuthProvider, useAuth } from '@bb/universal-auth';

await initUniversalAuth({
  apiBaseUrl: 'https://ct-bff.bainbridgebuilders.com',
  appId: 'bb_express',
  mode: 'production',
  cookieDomain: '.bainbridgebuilders.com',
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

- `@bb/universal-auth` — core (token management, offline queue, events, config)
- `@bb/universal-auth/react` — React hooks + components
- `@bb/universal-auth/sw` — service worker helper for background sync

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
