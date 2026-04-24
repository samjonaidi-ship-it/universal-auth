# @bb/universal-auth

**Bainbridge Builders universal authentication SDK.** One package; every BB consumer app uses it for login, session, enrollment, profile, offline queue, and entitlements.

- **Spec:** `C:\Users\samjo\Desktop\BB_Platform_Specs\BB_UNIVERSAL_AUTH_SDK_SPEC.md` v1.4.0
- **Status:** Under active development (v1.0.0-rc.1 target)
- **Registry:** GitHub Packages private, `@bb` scope

## Install

```bash
npm install @bb/universal-auth
```

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
