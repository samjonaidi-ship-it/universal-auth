// @bb/universal-auth | test/unit/react/components/PersonaChooser-extras.test.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Branch-coverage push — show-remember + custom labels + identity-without-name.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { PersonaChooser } from '../../../../src/react/components/PersonaChooser.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';

const baseSession = (display: string | undefined): Session => ({
  identity: {
    identity_id: 'sam',
    identity_kind: 'human',
    ...(display !== undefined ? { display_name: display } : {}),
  },
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
  personas: [
    {
      persona_type: 'crew',
      party_id: 'bb',
      party_name: 'BB',
      role_in_party: 'r',
      ct_role: null,
      plan_slug: 'crew_basic',
      subscription_status: 'active',
      landing_route: '/crew',
    },
  ],
});

describe('PersonaChooser — branch coverage', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.1',
    });
  });

  it('renders welcome line when identity has display_name', () => {
    render(
      <AuthProvider initialSession={baseSession('Sam')}>
        <PersonaChooser onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.getByText(/welcome back, sam/i)).toBeTruthy();
  });

  it('omits welcome line when display_name absent', () => {
    render(
      <AuthProvider initialSession={baseSession(undefined)}>
        <PersonaChooser onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.queryByText(/welcome back/i)).toBeNull();
  });

  it('renders custom personaLabels override', () => {
    render(
      <AuthProvider initialSession={baseSession('Sam')}>
        <PersonaChooser
          onSelect={vi.fn()}
          personaLabels={{ crew: 'My Crew Title' }}
        />
      </AuthProvider>
    );
    expect(screen.getByText('My Crew Title')).toBeTruthy();
  });

  it('renders Remember-checkbox when showRememberOption + onRememberChange given', () => {
    const onRemember = vi.fn();
    render(
      <AuthProvider initialSession={baseSession('Sam')}>
        <PersonaChooser
          onSelect={vi.fn()}
          showRememberOption
          onRememberChange={onRemember}
        />
      </AuthProvider>
    );
    const cb = screen.getByLabelText(/remember my choice/i) as HTMLInputElement;
    fireEvent.click(cb);
    expect(onRemember).toHaveBeenCalledWith(true);
  });

  it('does not render Remember-checkbox when showRememberOption is false', () => {
    render(
      <AuthProvider initialSession={baseSession('Sam')}>
        <PersonaChooser onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.queryByLabelText(/remember my choice/i)).toBeNull();
  });

  it('does not render Remember-checkbox when onRememberChange is undefined', () => {
    render(
      <AuthProvider initialSession={baseSession('Sam')}>
        <PersonaChooser onSelect={vi.fn()} showRememberOption />
      </AuthProvider>
    );
    expect(screen.queryByLabelText(/remember my choice/i)).toBeNull();
  });

  it('uses custom heading when provided', () => {
    render(
      <AuthProvider initialSession={baseSession('Sam')}>
        <PersonaChooser onSelect={vi.fn()} heading="Pick your role" />
      </AuthProvider>
    );
    expect(screen.getByRole('heading', { name: /pick your role/i })).toBeTruthy();
  });
});
