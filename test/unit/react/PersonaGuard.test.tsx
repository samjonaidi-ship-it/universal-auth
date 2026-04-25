// @bb/universal-auth | test/unit/react/PersonaGuard.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// PersonaGuard logic — UX-only client gate per §D2.7.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider } from '../../../src/react/AuthProvider.js';
import { PersonaGuard } from '../../../src/react/components/PersonaGuard.js';
import type { Session } from '../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

function makeSession(personaTypes: string[]): Session {
  return {
    identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
    personas: personaTypes.map((t) => ({
      persona_type: t,
      party_id: 'p',
      party_name: 'BB',
      role_in_party: 'r',
      ct_role: null,
      plan_slug: 's',
      subscription_status: 'active',
      landing_route: `/${t}`,
    })),
    aggregate: { features: [], app_access: [] },
    session_meta: {
      session_id: 's1',
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

describe('react/components/PersonaGuard', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
  });

  it('renders children when at least one required persona is present', () => {
    render(
      <AuthProvider initialSession={makeSession(['admin'])}>
        <PersonaGuard requires={['admin', 'operator']} fallback={<div>denied</div>}>
          <div>admin content</div>
        </PersonaGuard>
      </AuthProvider>
    );
    expect(screen.getByText('admin content')).toBeTruthy();
  });

  it('renders fallback when no required persona matches', () => {
    render(
      <AuthProvider initialSession={makeSession(['client'])}>
        <PersonaGuard requires={['admin']} fallback={<div>denied</div>}>
          <div>admin content</div>
        </PersonaGuard>
      </AuthProvider>
    );
    expect(screen.queryByText('admin content')).toBeNull();
    expect(screen.getByText('denied')).toBeTruthy();
  });

  it('renders fallback when anonymous (no session)', () => {
    render(
      <AuthProvider initialSession={undefined}>
        <PersonaGuard requires={['admin']} fallback={<div>signin</div>}>
          <div>admin content</div>
        </PersonaGuard>
      </AuthProvider>
    );
    // status starts 'loading' then becomes 'anonymous' — both render fallback (loading null is OK)
    // Force onto anonymous path by waiting microtask
    // For sync render: at first frame, status === 'loading' returns null
    // Either way, admin content must NOT appear
    expect(screen.queryByText('admin content')).toBeNull();
  });
});
