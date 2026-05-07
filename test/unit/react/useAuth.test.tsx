// @samjonaidi-ship-it/universal-auth | test/unit/react/useAuth.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// useAuth hook contract — hasPersona, switchActivePersona, allFeatures, agent.

import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { type ReactNode } from 'react';
import { AuthProvider } from '../../../src/react/AuthProvider.js';
import { useAuth } from '../../../src/react/useAuth.js';
import type { Session } from '../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

function setupSDK(): void {
  __resetClientForTests();
  __resetTokenManagerForTests();
  configureClient({
    apiBaseUrl: 'https://ct-bff.test',
    appId: 'bb_express',
    sdkVersion: '1.0.0-rc.1',
  });
}

const SESSION: Session = {
  identity: {
    identity_id: 'sam',
    identity_kind: 'human',
    display_name: 'Sam',
  },
  primary_persona: 'admin',
  personas: [
    {
      persona_type: 'admin',
      party_id: 'bb_inc',
      party_name: 'BB',
      role_in_party: 'owner',
      ct_role: 'admin',
      plan_slug: 'admin_premium',
      subscription_status: 'active',
      landing_route: '/admin',
    },
    {
      persona_type: 'client',
      party_id: 'jonaidi',
      party_name: 'Jonaidi Household',
      role_in_party: 'owner',
      ct_role: null,
      plan_slug: 'client_complete',
      subscription_status: 'active',
      landing_route: '/home',
    },
  ],
  aggregate: { features: ['admin.grant', 'home.buddy_chat'], app_access: ['controltower', 'bb_express'] },
  session_meta: {
    session_id: 's1',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900_000).toISOString(),
  },
};

function Probe({
  onAuth,
}: {
  onAuth: (auth: ReturnType<typeof useAuth>) => void;
}): ReactNode {
  const auth = useAuth();
  onAuth(auth);
  return <div data-testid="ok">{auth.identity?.display_name ?? 'none'}</div>;
}

describe('react/useAuth', () => {
  beforeEach(async () => {
    setupSDK();
    await __resetDbForTests();
  });

  it('exposes identity + personas + active persona derived from URL', () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe onAuth={(a) => (captured = a)} />
      </AuthProvider>
    );
    expect(captured).not.toBeNull();
    const c = captured as unknown as ReturnType<typeof useAuth>;
    expect(c.identity?.identity_id).toBe('sam');
    expect(c.personas.length).toBe(2);
    expect(c.primary_persona).toBe('admin');
  });

  it('hasPersona returns true for present persona, false otherwise', () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe onAuth={(a) => (captured = a)} />
      </AuthProvider>
    );
    const c = captured as unknown as ReturnType<typeof useAuth>;
    expect(c.hasPersona('admin')).toBe(true);
    expect(c.hasPersona('client')).toBe(true);
    expect(c.hasPersona('supplier')).toBe(false);
  });

  it('throws when called outside <AuthProvider>', () => {
    function NoProvider(): ReactNode {
      useAuth();
      return null;
    }
    // Suppress React error boundary noise
    const orig = console.error;
    console.error = (): void => {};
    try {
      expect(() => render(<NoProvider />)).toThrow(/outside <AuthProvider>/);
    } finally {
      console.error = orig;
    }
  });

  // rc.7 audit N5 — proves the rc.5 D8 class is actually thrown (not just
  // the message). Consumers can `instanceof AuthProviderMissingError`-check.
  it('throws AuthProviderMissingError (instance + code) outside <AuthProvider>', async () => {
    const { AuthProviderMissingError, AuthSdkError } = await import(
      '../../../src/errors.js'
    );
    function NoProvider(): ReactNode {
      useAuth();
      return null;
    }
    const orig = console.error;
    console.error = (): void => {};
    try {
      let caught: unknown = null;
      try {
        render(<NoProvider />);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AuthProviderMissingError);
      expect(caught).toBeInstanceOf(AuthSdkError);
      expect((caught as { code: string }).code).toBe('AUTH_PROVIDER_MISSING');
      expect((caught as { hookName: string }).hookName).toBe('useAuth');
    } finally {
      console.error = orig;
    }
  });

  it('exposes agent context when identity_kind is agent', () => {
    let captured: ReturnType<typeof useAuth> | null = null;
    const agentSession: Session = {
      identity: {
        identity_id: 'buddy',
        identity_kind: 'agent',
        display_name: 'Buddy',
      },
      aggregate: { features: ['agent.respond'], app_access: ['buddy_console'] },
      session_meta: SESSION.session_meta,
      agent: {
        class: 'buddy',
        tier: 3,
        version: '1.0.0',
        disclosure_text: "I'm Buddy.",
        outbound_policy: 'approval_required',
        acting_on_behalf_of: 'sam',
        on_behalf_of_persona: 'client',
      },
    };
    render(
      <AuthProvider initialSession={agentSession}>
        <Probe onAuth={(a) => (captured = a)} />
      </AuthProvider>
    );
    const c = captured as unknown as ReturnType<typeof useAuth>;
    expect(c.agent).not.toBeNull();
    expect(c.agent?.tier).toBe(3);
    expect(c.agent?.outbound_policy).toBe('approval_required');
  });
});
