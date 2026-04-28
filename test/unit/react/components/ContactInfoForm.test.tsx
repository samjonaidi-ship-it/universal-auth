// @bb/universal-auth | test/unit/react/components/ContactInfoForm.test.tsx | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { ContactInfoForm } from '../../../../src/react/components/ContactInfoForm.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../../src/core/event-reporter.js';

function makeSession(personaType: string): Session {
  return {
    identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
    primary_persona: personaType,
    personas: [
      {
        persona_type: personaType,
        party_id: 'p',
        party_name: 'BB',
        role_in_party: 'r',
        ct_role: null,
        plan_slug: 's',
        subscription_status: 'active',
        landing_route: `/${personaType}`,
      },
    ],
    aggregate: { features: [], app_access: [] },
    session_meta: {
      session_id: 's',
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const PROFILE = {
  identity_id: 'sam',
  display_name: '',
  email: '',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 0,
  missing_required_fields: [],
  last_updated_at: '2026-04-25T00:00:00Z',
  profile_version: 1,
};

describe('ContactInfoForm', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetProfileStoreForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResp(200, PROFILE));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders display_name + email + phone fields', async () => {
    render(
      <AuthProvider initialSession={makeSession('crew')}>
        <ContactInfoForm />
      </AuthProvider>
    );
    expect(screen.getByLabelText(/display name/i)).toBeTruthy();
    // Disambiguate by id since emergency-contact has its own Phone field
    expect(document.getElementById('bb-auth-email')).toBeTruthy();
    expect(document.getElementById('bb-auth-phone')).toBeTruthy();
  });

  it('shows emergency contact fields for crew persona', async () => {
    render(
      <AuthProvider initialSession={makeSession('crew')}>
        <ContactInfoForm />
      </AuthProvider>
    );
    expect(screen.getByText(/emergency contact/i)).toBeTruthy();
  });

  it('hides emergency contact for client persona', async () => {
    render(
      <AuthProvider initialSession={makeSession('client')}>
        <ContactInfoForm />
      </AuthProvider>
    );
    expect(screen.queryByText(/emergency contact/i)).toBeNull();
  });

  it('rejects empty submit with inline validation errors', async () => {
    render(
      <AuthProvider initialSession={makeSession('client')}>
        <ContactInfoForm />
      </AuthProvider>
    );
    fireEvent.submit(screen.getByRole('form', { name: /contact info/i }));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });
  });
});
