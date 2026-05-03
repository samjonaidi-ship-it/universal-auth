// @vitest-environment happy-dom
// @samjonaidi-ship-it/universal-auth | test/unit/react/components/PropertySection.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { PropertySection } from '../../../../src/react/components/PropertySection.js';
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
  identity: { identity_id: 'hong', identity_kind: 'human', display_name: 'Hong' },
  primary_persona: 'homeowner',
  personas: [
    {
      persona_type: 'homeowner',
      party_id: 'p',
      party_name: 'BB',
      role_in_party: 'r',
      ct_role: null,
      plan_slug: 'home_basic',
      subscription_status: 'active',
      landing_route: '/home',
    },
  ],
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

const ENVELOPE = {
  identity_id: 'hong',
  display_name: 'Hong',
  email: 'hong@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 80,
  missing_required_fields: [],
  last_updated_at: '2026-04-30T00:00:00Z',
  profile_version: 1,
  addresses: [],
  resources: [
    {
      id: 'prop-1',
      resource_type: 'property',
      status: 'active',
      name: 'Main residence',
      attributes: {
        property_type: 'single_family',
        year_built: 1995,
        sqft: 2400,
        line1: '789 Bay St',
        city: 'Bainbridge Island',
        state_region: 'WA',
        postal_code: '98110',
        country: 'US',
      },
      verified: false,
      external_refs: {},
    },
  ],
  media: [],
  property_assets: [
    {
      id: 'asset-1',
      property_id: 'prop-1',
      asset_type: 'hvac',
      status: 'active',
      name: 'Trane heat pump',
      attributes: {},
      warranty_until: '2030-06-01T00:00:00Z',
    },
  ],
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PropertySection', () => {
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

  it('renders without crashing + lists property + nested asset', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Main residence')).toBeTruthy());
    expect(screen.getByText('single_family')).toBeTruthy();
    expect(screen.getByText('1995')).toBeTruthy();
    expect(screen.getByText('Trane heat pump')).toBeTruthy();
  });

  it('shows empty state when no properties', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...ENVELOPE, resources: [], property_assets: [] }));
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText(/No properties on file/i)).toBeTruthy());
  });

  it('opens add form, validates required address', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...ENVELOPE, resources: [], property_assets: [] }));
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add property')).toBeTruthy());
    fireEvent.click(screen.getByText('Add property'));
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add property'));
    });
    expect(screen.getByRole('alert').textContent).toMatch(/Address is required/i);
  });

  it('hides add+archive buttons when readonly', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection readonly />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Main residence')).toBeTruthy());
    expect(screen.queryByText('Add property')).toBeNull();
    expect(screen.queryByLabelText(/Archive Main residence/i)).toBeNull();
  });

  it('reveals add-asset form for an existing property', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Main residence')).toBeTruthy());
    fireEvent.click(screen.getByText('Add asset'));
    expect(screen.getByLabelText('Add property asset')).toBeTruthy();
  });

  // Coverage push 2026-04-30 — handler branches (rc.4 → 1.0 GA gate #1)

  it('successful add-property submission POSTs resource with full address attrs', async () => {
    fetchSpy.mockImplementation((url, init) => {
      const u = String(url);
      const m = (init as RequestInit | undefined)?.method ?? 'GET';
      if (u.includes('/profile/resources') && m === 'POST') {
        return Promise.resolve(jsonResp(200, { id: 'prop-2' }));
      }
      return Promise.resolve(jsonResp(200, { ...ENVELOPE, resources: [], property_assets: [] }));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add property')).toBeTruthy());
    fireEvent.click(screen.getByText('Add property'));
    // Fill required fields
    fireEvent.change(screen.getByLabelText(/Street address/i), {
      target: { value: '123 Main St' },
    });
    fireEvent.change(screen.getByLabelText(/^City/i), {
      target: { value: 'Seattle' },
    });
    fireEvent.change(screen.getByLabelText(/Postal code/i), {
      target: { value: '98101' },
    });
    fireEvent.change(document.getElementById('bb-prop-name')!, {
      target: { value: 'Lake house' },
    });
    fireEvent.change(document.getElementById('bb-prop-type')!, {
      target: { value: 'single_family' },
    });
    fireEvent.change(document.getElementById('bb-prop-year')!, {
      target: { value: '2010' },
    });
    fireEvent.change(document.getElementById('bb-prop-sqft')!, {
      target: { value: '1800' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add property'));
    });
    // POST should have been issued
    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(
        ([u, init]) =>
          String(u).includes('/profile/resources') &&
          (init as RequestInit | undefined)?.method === 'POST'
      );
      expect(post).toBeDefined();
    });
    const post = fetchSpy.mock.calls.find(
      ([u, init]) =>
        String(u).includes('/profile/resources') &&
        (init as RequestInit | undefined)?.method === 'POST'
    )!;
    const body = JSON.parse(String((post[1] as RequestInit).body));
    expect(body.resource_type).toBe('property');
    expect(body.name).toBe('Lake house');
    expect(body.attributes.line1).toBe('123 Main St');
    expect(body.attributes.city).toBe('Seattle');
    expect(body.attributes.postal_code).toBe('98101');
    expect(body.attributes.property_type).toBe('single_family');
    expect(body.attributes.year_built).toBe('2010');
    expect(body.attributes.sqft).toBe('1800');
  });

  it('add-property catches addResource error and surfaces it as alert', async () => {
    fetchSpy.mockImplementation((url, init) => {
      const u = String(url);
      const m = (init as RequestInit | undefined)?.method ?? 'GET';
      if (u.includes('/profile/resources') && m === 'POST') {
        return Promise.resolve(jsonResp(500, { code: 'INTERNAL', message: 'Save failed' }));
      }
      return Promise.resolve(jsonResp(200, { ...ENVELOPE, resources: [], property_assets: [] }));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add property')).toBeTruthy());
    fireEvent.click(screen.getByText('Add property'));
    fireEvent.change(screen.getByLabelText(/Street address/i), {
      target: { value: '123 Main St' },
    });
    fireEvent.change(screen.getByLabelText(/^City/i), {
      target: { value: 'Seattle' },
    });
    fireEvent.change(screen.getByLabelText(/Postal code/i), {
      target: { value: '98101' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add property'));
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeNull();
    });
  });

  it('archive button on property triggers archiveResource (DELETE/PUT)', async () => {
    fetchSpy.mockImplementation((url, init) => {
      const u = String(url);
      const m = (init as RequestInit | undefined)?.method ?? 'GET';
      if (
        u.match(/\/profile\/resources\/prop-1$/) &&
        ['DELETE', 'PUT', 'PATCH'].includes(m)
      ) {
        return Promise.resolve(jsonResp(200, { ok: true }));
      }
      return Promise.resolve(jsonResp(200, ENVELOPE));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Main residence')).toBeTruthy());
    const archiveBtn = screen.getByLabelText(/Archive Main residence/i);
    await act(async () => {
      fireEvent.click(archiveBtn);
    });
    await waitFor(() => {
      const archiveCall = fetchSpy.mock.calls.find(
        ([u, init]) =>
          String(u).match(/\/profile\/resources\/prop-1$/) &&
          ['DELETE', 'PUT', 'PATCH'].includes(
            String((init as RequestInit | undefined)?.method ?? '')
          )
      );
      expect(archiveCall).toBeDefined();
    });
  });

  it('successful asset add POSTs to /properties/:id/assets', async () => {
    fetchSpy.mockImplementation((url, init) => {
      const u = String(url);
      const m = (init as RequestInit | undefined)?.method ?? 'GET';
      if (u.match(/\/properties\/[^/]+\/assets/) && m === 'POST') {
        return Promise.resolve(jsonResp(200, { id: 'asset-2' }));
      }
      return Promise.resolve(jsonResp(200, ENVELOPE));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Main residence')).toBeTruthy());
    fireEvent.click(screen.getByText('Add asset'));
    fireEvent.change(document.getElementById('bb-asset-name')!, {
      target: { value: 'Roof 2020' },
    });
    fireEvent.change(document.getElementById('bb-asset-type')!, {
      target: { value: 'roof' },
    });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add property asset'));
    });
    await waitFor(() => {
      const post = fetchSpy.mock.calls.find(
        ([u, init]) =>
          String(u).match(/\/properties\/[^/]+\/assets/) &&
          (init as RequestInit | undefined)?.method === 'POST'
      );
      expect(post).toBeDefined();
    });
  });

  it('AssetAddForm cancel returns to list view', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Main residence')).toBeTruthy());
    fireEvent.click(screen.getByText('Add asset'));
    expect(screen.getByLabelText('Add property asset')).toBeTruthy();
    // Cancel buttons (multiple Cancel possible — get the asset form's)
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    expect(screen.queryByLabelText('Add property asset')).toBeNull();
  });

  it('PropertyAddForm cancel returns to list view', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...ENVELOPE, resources: [], property_assets: [] }));
    render(
      <AuthProvider initialSession={SESSION}>
        <PropertySection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add property')).toBeTruthy());
    fireEvent.click(screen.getByText('Add property'));
    expect(screen.getByLabelText('Add property')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Add property')).toBeNull();
    expect(screen.getByText(/No properties on file/i)).toBeTruthy();
  });
});
