// @vitest-environment happy-dom
// @bainbridgebuilders/universal-auth | test/unit/react/components/PropertySection.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

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
});
