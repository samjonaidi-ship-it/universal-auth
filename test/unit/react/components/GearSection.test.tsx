// @vitest-environment happy-dom
// @samjonaidi-ship-it/universal-auth | test/unit/react/components/GearSection.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { GearSection } from '../../../../src/react/components/GearSection.js';
import type { Session } from '../../../../src/types/api.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
import { __resetIdentityStoreForTests } from '../../../../src/react/useIdentity.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../../src/core/event-reporter.js';

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

const BASE = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 80,
  missing_required_fields: [],
  last_updated_at: '2026-04-30T00:00:00Z',
  profile_version: 1,
  addresses: [],
  media: [],
  property_assets: [],
};

const WITH_GEAR = {
  ...BASE,
  resources: [
    {
      id: 'g-1',
      resource_type: 'gear',
      status: 'active',
      name: 'Personal drill',
      attributes: {},
      verified: false,
      external_refs: {},
    },
  ],
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GearSection', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetProfileStoreForTests();
    __resetIdentityStoreForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.4',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders without crashing + lists existing gear', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, WITH_GEAR));
    render(
      <AuthProvider initialSession={SESSION}>
        <GearSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Personal drill')).toBeTruthy());
  });

  it('rejects empty add submit with error', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...BASE, resources: [] }));
    render(
      <AuthProvider initialSession={SESSION}>
        <GearSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add gear')).toBeTruthy());
    fireEvent.click(screen.getByText('Add gear'));
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add personal gear'));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/required/i);
  });

  it('cancels add form back to list view', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...BASE, resources: [] }));
    render(
      <AuthProvider initialSession={SESSION}>
        <GearSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add gear')).toBeTruthy());
    fireEvent.click(screen.getByText('Add gear'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Add personal gear')).toBeNull();
    expect(screen.getByText(/No personal gear on file/i)).toBeTruthy();
  });

  it('hides controls when readonly', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, WITH_GEAR));
    render(
      <AuthProvider initialSession={SESSION}>
        <GearSection readonly />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Personal drill')).toBeTruthy());
    expect(screen.queryByText('Add gear')).toBeNull();
    expect(screen.queryByLabelText(/Remove Personal drill/i)).toBeNull();
  });

  // Coverage push 2026-04-30 — handler branches (rc.4 → 1.0 GA gate #1)

  it('successful add invokes addResource with trimmed name + clears form', async () => {
    // First fetch: profile load. Subsequent: addResource POST + reload.
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/identity/v1/profile/resources') && !u.match(/\/$/)) {
        return Promise.resolve(jsonResp(200, { id: 'g-new', name: 'Hammer' }));
      }
      return Promise.resolve(jsonResp(200, { ...BASE, resources: [] }));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <GearSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add gear')).toBeTruthy());
    fireEvent.click(screen.getByText('Add gear'));
    fireEvent.change(screen.getByLabelText(/Item name/i), {
      target: { value: '  Hammer  ' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add personal gear'));
    });
    await waitFor(() => {
      // Form should close (no longer shows "Add personal gear" form)
      expect(screen.queryByLabelText('Add personal gear')).toBeNull();
    });
    // The POST should have been made with trimmed name
    const postCall = fetchSpy.mock.calls.find(
      ([u, opts]) =>
        String(u).includes('/identity/v1/profile/resources') &&
        (opts as RequestInit | undefined)?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse(String((postCall![1] as RequestInit).body));
    expect(body.name).toBe('Hammer');
    expect(body.resource_type).toBe('gear');
  });

  it('add error from addResource surfaces as alert', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/identity/v1/profile/resources') && !u.match(/\/$/)) {
        return Promise.resolve(
          jsonResp(500, { code: 'INTERNAL', message: 'Disk full' })
        );
      }
      return Promise.resolve(jsonResp(200, { ...BASE, resources: [] }));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <GearSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add gear')).toBeTruthy());
    fireEvent.click(screen.getByText('Add gear'));
    fireEvent.change(screen.getByLabelText(/Item name/i), {
      target: { value: 'Wrench' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add personal gear'));
    });
    await waitFor(() => {
      // Alert appears (error caught + setError called)
      const alert = screen.queryByRole('alert');
      expect(alert).not.toBeNull();
    });
  });

  it('Remove button on gear item triggers archiveResource', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      if (
        u.includes('/identity/v1/profile/resources/g-1') &&
        !u.endsWith('/profile/resources/g-1')
      ) {
        // archive sub-route
        return Promise.resolve(jsonResp(200, { ok: true }));
      }
      if (u.match(/\/identity\/v1\/profile\/resources\/g-1$/)) {
        // PUT to archive (status: archived)
        return Promise.resolve(jsonResp(200, { ok: true }));
      }
      return Promise.resolve(jsonResp(200, WITH_GEAR));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <GearSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Personal drill')).toBeTruthy());
    const removeBtn = screen.getByLabelText(/Remove Personal drill/i);
    await act(async () => {
      fireEvent.click(removeBtn);
    });
    // Archive request fires (DELETE or PUT depending on impl)
    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(
        ([u, opts]) =>
          String(u).includes('/profile/resources/g-1') &&
          ['DELETE', 'PUT', 'PATCH'].includes(
            String((opts as RequestInit | undefined)?.method ?? '')
          )
      );
      expect(call).toBeDefined();
    });
  });
});
