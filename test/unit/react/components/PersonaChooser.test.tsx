// @samjonaidi-ship-it/universal-auth | test/unit/react/components/PersonaChooser.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Smoke — renders one card per persona, calls onSelect with full persona object.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { PersonaChooser } from '../../../../src/react/components/PersonaChooser.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
  personas: [
    {
      persona_type: 'crew',
      party_id: 'bb_inc',
      party_name: 'Bainbridge Builders',
      role_in_party: 'crew',
      ct_role: null,
      plan_slug: 'crew_basic',
      subscription_status: 'active',
      landing_route: '/crew',
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
};

describe('PersonaChooser', () => {
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

  it('renders one card per persona with party_name subtitle', () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaChooser onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.getByRole('button', { name: /crew/i })).toBeTruthy();
    expect(screen.getByText(/bainbridge builders/i)).toBeTruthy();
    expect(screen.getByText(/jonaidi household/i)).toBeTruthy();
  });

  it('calls onSelect with the full persona object', () => {
    const onSelect = vi.fn();
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaChooser onSelect={onSelect} />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /homeowner|client/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]![0].persona_type).toBe('client');
    expect(onSelect.mock.calls[0]![0].landing_route).toBe('/home');
  });

  it('renders nothing when there are no personas', () => {
    render(
      <AuthProvider
        initialSession={{
          ...SESSION,
          personas: [],
        }}
      >
        <PersonaChooser onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.queryByRole('region')).toBeNull();
  });
});
