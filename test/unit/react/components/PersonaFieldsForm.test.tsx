// @bb/universal-auth | test/unit/react/components/PersonaFieldsForm.test.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push — PersonaFieldsForm.tsx (was 29% lines).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { PersonaFieldsForm } from '../../../../src/react/components/PersonaFieldsForm.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../../src/core/event-reporter.js';
import { __resetPersonaFieldsForTests } from '../../../../src/profile/persona-fields.js';

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  primary_persona: 'crew',
  personas: [
    {
      persona_type: 'crew',
      party_id: 'p',
      party_name: 'BB',
      role_in_party: 'r',
      ct_role: null,
      plan_slug: 'crew_basic',
      subscription_status: 'active',
      landing_route: '/crew',
    },
  ],
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

const PROFILE = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: { crew: { trade: 'electrical' } },
  completeness_score: 100,
  missing_required_fields: [],
  last_updated_at: '2026-04-25T00:00:00Z',
  profile_version: 1,
};

const REGISTRY = {
  version: 1,
  personas: {
    crew: {
      required: ['persona_extensions.crew.trade'],
      recommended: ['persona_extensions.crew.osha_card'],
      optional: ['persona_extensions.crew.notes'],
      fields: {
        'persona_extensions.crew.trade': {
          type: 'select' as const,
          label: 'Trade',
          options: ['electrical', 'plumbing', 'framing'],
        },
        'persona_extensions.crew.osha_card': {
          type: 'text' as const,
          label: 'OSHA card #',
          hint: 'last-6-digits',
        },
        'persona_extensions.crew.notes': {
          type: 'textarea' as const,
          label: 'Notes',
        },
      },
    },
  },
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PersonaFieldsForm', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetProfileStoreForTests();
    __resetPersonaFieldsForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });

    // Default mock: profile fetch returns PROFILE; registry returns REGISTRY
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (req) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      if (url.includes('/persona-fields-registry')) {
        return jsonResp(200, REGISTRY);
      }
      return jsonResp(200, PROFILE);
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns null while roster is loading', () => {
    const { container } = render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    // Pre-fetch: form not rendered yet
    expect(container.querySelector('form')).toBeNull();
  });

  it('renders required + recommended + optional groups after hydrate', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" heading="Crew Fields" />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('form', { name: /crew fields/i })).toBeTruthy();
    });

    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.getByText('Recommended')).toBeTruthy();
    expect(screen.getByText('Optional')).toBeTruthy();
  });

  it('renders default heading when none provided (uses persona)', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('form', { name: /crew details/i })).toBeTruthy();
    });
  });

  it('hideOptional=true skips optional group', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" hideOptional />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText('Required')).toBeTruthy();
    });
    expect(screen.queryByText('Optional')).toBeNull();
  });

  it('seeds value from existing profile (trade=electrical)', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      const select = screen.getByLabelText(/trade/i) as HTMLSelectElement;
      expect(select.value).toBe('electrical');
    });
  });

  it('select renders all options + the placeholder', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      const select = screen.getByLabelText(/trade/i) as HTMLSelectElement;
      expect(select.querySelectorAll('option')).toHaveLength(4); // 3 options + placeholder
    });
  });

  it('text input + hint render', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/osha card/i)).toBeTruthy();
    });
    expect(screen.getByText(/last-6-digits/i)).toBeTruthy();
  });

  it('textarea renders for notes field', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      const notes = screen.getByLabelText(/notes/i);
      expect(notes.tagName.toLowerCase()).toBe('textarea');
    });
  });

  it('returns null for unknown persona', async () => {
    const { container } = render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="unknown_persona" />
      </AuthProvider>
    );
    // Wait for fetch to settle
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    // No form rendered for unknown persona
    expect(container.querySelector('form')).toBeNull();
  });

  it('user types into text input — value updates', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByLabelText(/osha card/i)).toBeTruthy();
    });
    const input = screen.getByLabelText(/osha card/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '123456' } });
    expect(input.value).toBe('123456');
  });

  it('submit button uses default label "Save"', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
    });
  });

  it('submit button uses custom label when provided', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" submitLabel="Update profile" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /update profile/i })).toBeTruthy();
    });
  });

  it('humanize is used when field def has no label', async () => {
    // Override the registry to give a field WITHOUT a label
    fetchSpy.mockImplementation(async (req) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      if (url.includes('/persona-fields-registry')) {
        return jsonResp(200, {
          version: 1,
          personas: {
            crew: {
              required: ['persona_extensions.crew.bg_check_status'],
              recommended: [],
              optional: [],
              fields: {
                'persona_extensions.crew.bg_check_status': {
                  type: 'text' as const,
                  // no label → humanize() is called
                },
              },
            },
          },
        });
      }
      return jsonResp(200, PROFILE);
    });

    render(
      <AuthProvider initialSession={SESSION}>
        <PersonaFieldsForm persona="crew" />
      </AuthProvider>
    );
    await waitFor(() => {
      // humanize('bg_check_status') => 'Bg Check Status'
      expect(screen.getByText('Bg Check Status')).toBeTruthy();
    });
  });
});
