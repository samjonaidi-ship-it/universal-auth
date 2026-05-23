// @samjonaidi-ship-it/universal-auth | test/unit/react/components/ContactInfoForm.test.tsx | v1.0.1 | 2026-05-22 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { ContactInfoForm } from '../../../../src/react/components/ContactInfoForm.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
import { validatePhone } from '../../../../src/profile/validators.js';
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
    // Pre-warm libphonenumber-js. ContactInfoForm.handleSubmit() awaits
    // validatePhone() which dynamic-imports libphonenumber-js (~34 KB gzip,
    // P1-F lazy load) on first call. Under full-suite CPU contention the
    // cold import takes longer than waitFor's 1 s default, so the test
    // asserts on the onSubmit spy before validatePhone resolves and the
    // submit handler reaches onSubmit(patch). Warming here on the real
    // module loader memoises the import so every later validatePhone() is a
    // straight Node module-cache hit.
    await validatePhone('+12125551234');
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

  // Coverage push 2026-04-30 — handler branches (rc.4 → 1.0 GA gate #1)

  it('valid submit calls onSubmit prop when provided', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthProvider initialSession={makeSession('client')}>
        <ContactInfoForm onSubmit={onSubmit} />
      </AuthProvider>
    );
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(document.getElementById('bb-auth-email')!, {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(document.getElementById('bb-auth-phone')!, {
      target: { value: '+12125551234' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /contact info/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
    const patch = onSubmit.mock.calls[0][0];
    expect(patch.display_name).toBe('Jane Doe');
    expect(patch.email).toBe('jane@example.com');
    expect(patch.phone_e164).toMatch(/^\+12125551234$/);
  });

  it('valid crew submit includes emergency_contact in patch', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AuthProvider initialSession={makeSession('crew')}>
        <ContactInfoForm onSubmit={onSubmit} />
      </AuthProvider>
    );
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Mike R.' },
    });
    fireEvent.change(document.getElementById('bb-auth-email')!, {
      target: { value: 'mike@bb.com' },
    });
    fireEvent.change(document.getElementById('bb-auth-phone')!, {
      target: { value: '+12125551235' },
    });
    fireEvent.change(document.getElementById('bb-auth-ec-name')!, {
      target: { value: 'Susan R.' },
    });
    fireEvent.change(document.getElementById('bb-auth-ec-phone')!, {
      target: { value: '+12125551236' },
    });
    fireEvent.change(document.getElementById('bb-auth-ec-rel')!, {
      target: { value: 'spouse' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /contact info/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
    const patch = onSubmit.mock.calls[0][0];
    expect(patch.emergency_contact).toBeDefined();
    expect(patch.emergency_contact.name).toBe('Susan R.');
    expect(patch.emergency_contact.relationship).toBe('spouse');
  });

  it('catches onSubmit error and surfaces it as form-level alert', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server hiccup'));
    render(
      <AuthProvider initialSession={makeSession('client')}>
        <ContactInfoForm onSubmit={onSubmit} />
      </AuthProvider>
    );
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Jane' },
    });
    fireEvent.change(document.getElementById('bb-auth-email')!, {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(document.getElementById('bb-auth-phone')!, {
      target: { value: '+12125551234' },
    });
    fireEvent.submit(screen.getByRole('form', { name: /contact info/i }));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      const found = alerts.find((a) => /server hiccup/i.test(a.textContent ?? ''));
      expect(found).toBeDefined();
    });
  });

  it('crew with missing emergency-contact fields shows EC errors', async () => {
    render(
      <AuthProvider initialSession={makeSession('crew')}>
        <ContactInfoForm />
      </AuthProvider>
    );
    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Mike' },
    });
    fireEvent.change(document.getElementById('bb-auth-email')!, {
      target: { value: 'mike@bb.com' },
    });
    fireEvent.change(document.getElementById('bb-auth-phone')!, {
      target: { value: '+12125551235' },
    });
    // Leave EC fields blank
    fireEvent.submit(screen.getByRole('form', { name: /contact info/i }));
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      // Should have at least 3 EC errors (name, phone, relationship)
      expect(alerts.length).toBeGreaterThanOrEqual(3);
    });
  });
});
