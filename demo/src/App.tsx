// @bb/universal-auth | demo/src/App.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Demo root — Block 5 minimal scaffold. Block 7 expands kitchen-sink coverage.

import {
  useAuth,
  useEntitlements,
  SignInForm,
  PersonaChooser,
  ConsentScreen,
  OfflineIndicator,
  ImpersonationBanner,
  AgentStatusBanner,
  ProfileSetupScreen,
} from '@bainbridgebuilders/universal-auth/react';

export default function App(): JSX.Element {
  const { status, identity, personas, activePersona, signOut } = useAuth();
  const { hasFeature } = useEntitlements();

  if (status === 'loading') return <main>Loading…</main>;

  if (status === 'anonymous') {
    return (
      <main>
        <h1>BB Universal Auth — Demo</h1>
        <SignInForm passkeyEnabled />
      </main>
    );
  }

  return (
    <main>
      <ImpersonationBanner />
      <OfflineIndicator />
      <AgentStatusBanner />

      <header>
        <h1>BB Universal Auth — Demo</h1>
        <p>
          Signed in as <strong>{identity?.display_name}</strong>
        </p>
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      {personas.length > 1 && activePersona === null ? (
        <PersonaChooser
          onSelect={(p) => {
            window.location.assign(p.landing_route);
          }}
        />
      ) : null}

      <section>
        <h2>Profile</h2>
        <ProfileSetupScreen mode="automatic" />
      </section>

      <section>
        <h2>Feature gates (demo)</h2>
        <ul>
          <li>bid_packages: {String(hasFeature('bid_packages'))}</li>
          <li>crew.gps: {String(hasFeature('crew.gps'))}</li>
          <li>admin.impersonate: {String(hasFeature('admin.impersonate'))}</li>
        </ul>
      </section>

      <section>
        <h2>Consent (post-enrollment review)</h2>
        <ConsentScreen
          audience={(activePersona?.persona_type as 'crew') ?? 'crew'}
          onAccept={async (c) => {
            // Demo only — real apps POST via flows/consent.bulkAcceptConsents
            console.log('Demo would record consents:', c);
          }}
        />
      </section>
    </main>
  );
}
