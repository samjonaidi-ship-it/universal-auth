// @bb/universal-auth | demo/src/App.tsx | v1.0.0-rc.1 | 2026-04-25 | BB
// Block 5 minimal placeholder. Proves the demo deploy pipeline works.
// Block 7 expands to a full SDK kitchen-sink (provider + sign-in + profile + ...).

import type { ReactNode } from 'react';

export default function App(): ReactNode {
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
        <code>@bainbridgebuilders/universal-auth@1.0.0-rc.1</code> · Block 5 scaffold ·
        Full demo lands in Block 7.
      </p>

      <section style={{ marginTop: 32 }}>
        <h2>Status</h2>
        <ul>
          <li>
            <strong>SDK package:</strong> built &amp; live —{' '}
            <a href="https://github.com/BainbridgeBuilders/universal-auth">
              github.com/BainbridgeBuilders/universal-auth
            </a>
          </li>
          <li>
            <strong>R2 avatar bucket:</strong> live — public URL{' '}
            <code>pub-5e92f2b6589145168f4ef37309e12fee.r2.dev</code>
          </li>
          <li>
            <strong>CT BFF migrations 046–058:</strong> applied (HWM 058)
          </li>
          <li>
            <strong>9 crew consents:</strong> seeded
          </li>
        </ul>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Block 7 will add</h2>
        <ul>
          <li>
            <code>&lt;AuthProvider&gt;</code> wiring + cookie-based session
            hydration
          </li>
          <li>Sign-in (code-first + passkey + Conditional UI)</li>
          <li>9-consent crew hard-gate at enrollment</li>
          <li>
            <code>&lt;ProfileSetupScreen&gt;</code> with avatar upload (R2
            round-trip)
          </li>
          <li>Multi-tab session sync via BroadcastChannel</li>
          <li>Offline queue + service worker flush</li>
          <li>Impersonation banner that persists across nav</li>
          <li>Persona switcher + entitlement gating</li>
        </ul>
      </section>

      <footer style={{ marginTop: 48, paddingTop: 16, borderTop: '1px solid #d0d0d0', color: '#999', fontSize: 14 }}>
        © Bainbridge Builders Inc. · BB Universal Auth Demo
      </footer>
    </main>
  );
}
