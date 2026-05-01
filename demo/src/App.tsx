// @bainbridgebuilders/universal-auth | demo/src/App.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Block 7 demo expansion — actually exercises the SDK end-to-end against the
// production CT BFF.
//
// What this proves:
//   1. Tarball install: `@bainbridgebuilders/universal-auth` resolves correctly
//   2. Bundle works: AuthProvider + SignInForm + useAuth all import + render
//   3. Network path: requestCode hits ct-bff.bainbridgebuilders.com (CORS + CSP)
//   4. Cookie domain: session cookie is shared across .bainbridgebuilders.com
//   5. Real round-trip: sign-in → /me → identity display
//
// Mode: 'production' because the demo lives on .bainbridgebuilders.com and
// talks to the real BFF. Mode-safety assertion (§10.6) would throw on any
// non-production mode at this hostname.

import { useEffect, useState, type ReactNode } from 'react';
import {
  initUniversalAuth,
  SDK_VERSION,
} from '@bainbridgebuilders/universal-auth';
import {
  AuthProvider,
  useAuth,
  useEntitlements,
  SignInForm,
  OfflineIndicator,
  ImpersonationBanner,
  AgentStatusBanner,
} from '@bainbridgebuilders/universal-auth/react';
import '@bainbridgebuilders/universal-auth/react/styles.css';

// ── SDK init (once at module load) ───────────────────────────────────────

let initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (initPromise === null) {
    initPromise = initUniversalAuth({
      apiBaseUrl: 'https://ct-bff.bainbridgebuilders.com',
      appId: 'bb_demo',
      mode: 'production',
    });
  }
  return initPromise;
}

// ── Demo shell ───────────────────────────────────────────────────────────

export default function App(): ReactNode {
  const [initState, setInitState] = useState<'pending' | 'ready' | 'failed'>(
    'pending'
  );
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    ensureInit()
      .then(() => setInitState('ready'))
      .catch((e: unknown) => {
        setInitError(e instanceof Error ? e.message : String(e));
        setInitState('failed');
      });
  }, []);

  if (initState === 'pending') {
    return (
      <Shell>
        <p>Initializing SDK…</p>
      </Shell>
    );
  }

  if (initState === 'failed') {
    return (
      <Shell>
        <h2 style={{ color: '#C8102E' }}>SDK init failed</h2>
        <pre style={{ background: '#fff5f5', padding: 12, fontSize: 12 }}>
          {initError}
        </pre>
        <p>
          This usually means CT BFF is unreachable from the browser. Check
          network tab.
        </p>
      </Shell>
    );
  }

  return (
    <AuthProvider>
      <Shell>
        <OfflineIndicator />
        <ImpersonationBanner />
        <AgentStatusBanner />
        <DemoBody />
      </Shell>
    </AuthProvider>
  );
}

// ── Authenticated body — switches between sign-in form and signed-in state ──

function DemoBody(): ReactNode {
  const { status, identity, activePersona, personas, signOut } = useAuth();
  const entitlements = useEntitlements();

  if (status === 'loading') {
    return <p>Resolving session…</p>;
  }

  if (status === 'anonymous' || identity === null) {
    return (
      <section>
        <p style={{ color: '#666' }}>
          Real CT BFF — uses your actual BB account. Code arrives via SMS or
          email. Passkey works on supported devices.
        </p>
        <SignInForm passkeyEnabled />
      </section>
    );
  }

  return (
    <section>
      <h2>Signed in</h2>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px' }}>
        <dt><strong>identity_id</strong></dt>
        <dd><code>{identity.identity_id}</code></dd>

        <dt><strong>display_name</strong></dt>
        <dd>{identity.display_name ?? '—'}</dd>

        <dt><strong>identity_kind</strong></dt>
        <dd>{identity.identity_kind}</dd>

        <dt><strong>active persona</strong></dt>
        <dd>
          {activePersona !== null ? (
            <>
              <code>{activePersona.persona_type}</code> @{' '}
              {activePersona.party_name}
            </>
          ) : (
            '—'
          )}
        </dd>

        <dt><strong>all personas</strong></dt>
        <dd>
          {personas.length > 0
            ? personas.map((p) => p.persona_type).join(', ')
            : '—'}
        </dd>

        <dt><strong>features</strong></dt>
        <dd>
          {entitlements.features.length > 0
            ? entitlements.features.slice(0, 5).join(', ')
            : '—'}
          {entitlements.features.length > 5
            ? ` +${entitlements.features.length - 5} more`
            : ''}
        </dd>

        <dt><strong>app_access</strong></dt>
        <dd>{entitlements.app_access.join(', ') || '—'}</dd>
      </dl>

      <button
        type="button"
        onClick={() => void signOut()}
        style={{
          marginTop: 24,
          padding: '8px 16px',
          background: '#1A1A1A',
          color: '#fff',
          border: 0,
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </section>
  );
}

// ── Layout ───────────────────────────────────────────────────────────────

function Shell({ children }: { children: ReactNode }): ReactNode {
  return (
    <main
      style={{
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        maxWidth: 720,
        margin: '40px auto',
        padding: '0 20px',
        color: '#1A1A1A',
      }}
    >
      <h1 style={{ color: '#C8102E', marginBottom: 8 }}>
        BB Universal Auth — Demo
      </h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        <code>@bainbridgebuilders/universal-auth@{SDK_VERSION}</code> · live
        against{' '}
        <code>ct-bff.bainbridgebuilders.com</code>
      </p>

      <hr style={{ border: 0, borderTop: '1px solid #e0e0e0', margin: '24px 0' }} />

      {children}

      <footer
        style={{
          marginTop: 48,
          paddingTop: 16,
          borderTop: '1px solid #d0d0d0',
          color: '#999',
          fontSize: 14,
        }}
      >
        © Bainbridge Builders Inc. · BB Universal Auth Demo · See{' '}
        <a href="https://github.com/BainbridgeBuilders/universal-auth">
          repo
        </a>
        {' '}+ <a href="https://github.com/BainbridgeBuilders/universal-auth/blob/main/docs/INTEGRATION_GUIDE.md">
          docs
        </a>
      </footer>
    </main>
  );
}
