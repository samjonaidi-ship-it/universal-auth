// @vitest-environment happy-dom
// @samjonaidi-ship-it/universal-auth | test/unit/react/components/VehicleSection.test.tsx | v1.0.4 | 2026-05-04 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { VehicleSection } from '../../../../src/react/components/VehicleSection.js';
import type { Session } from '../../../../src/types/api.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
import {
  __resetIdentityStoreForTests,
  __seedIdentityStoreForTests,
} from '../../../../src/react/useIdentity.js';
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

const ENVELOPE = {
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
  resources: [
    {
      id: 'v-1',
      resource_type: 'vehicle',
      status: 'active',
      name: 'Work truck',
      attributes: { make: 'Ford', model: 'F150', year: 2018, plate: 'ABC123' },
      verified: false,
      external_refs: {},
    },
  ],
  media: [],
  property_assets: [],
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('VehicleSection', () => {
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

  it('renders without crashing + shows existing vehicle', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <VehicleSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Work truck')).toBeTruthy());
    expect(screen.getByText('Ford')).toBeTruthy();
    expect(screen.getByText('F150')).toBeTruthy();
    expect(screen.getByText('ABC123')).toBeTruthy();
  });

  it('shows empty-state copy when no vehicles', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...ENVELOPE, resources: [] }));
    render(
      <AuthProvider initialSession={SESSION}>
        <VehicleSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText(/No vehicles on file/i)).toBeTruthy());
  });

  it('opens add form, submits to addResource endpoint', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResp(200, { ...ENVELOPE, resources: [] }))
      .mockResolvedValueOnce(
        jsonResp(200, {
          id: 'v-2',
          resource_type: 'vehicle',
          status: 'active',
          name: 'Toyota Tundra',
          attributes: { make: 'Toyota', model: 'Tundra' },
          verified: false,
          external_refs: {},
        })
      );
    render(
      <AuthProvider initialSession={SESSION}>
        <VehicleSection />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('Add vehicle')).toBeTruthy());
    fireEvent.click(screen.getByText('Add vehicle'));
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Toyota' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Tundra' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add vehicle'));
    });
    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.endsWith('/identity/v1/profile/resources'))).toBe(true);
    });
  });

  // v1.0.4 (Lane 2a): pre-seed via __seedIdentityStoreForTests so the
  // component sees the envelope on first render — no fetch-mock race.
  it('hides add/archive buttons when readonly', () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    __seedIdentityStoreForTests(ENVELOPE);
    render(
      <AuthProvider initialSession={SESSION}>
        <VehicleSection readonly />
      </AuthProvider>
    );
    expect(screen.getByText('Work truck')).toBeTruthy();
    expect(screen.queryByText('Add vehicle')).toBeNull();
    expect(screen.queryByLabelText(/Archive Work truck/i)).toBeNull();
  });

  // v1.0.4 (Lane 2a): pre-seed empty resources, then mock the addResource
  // POST to reject. Synchronous initial render — no waitFor on hydrate.
  it('renders error state when add fails', async () => {
    const emptyEnvelope = { ...ENVELOPE, resources: [] };
    __seedIdentityStoreForTests(emptyEnvelope);
    fetchSpy.mockImplementation((req, init) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      const method =
        init?.method ?? (typeof req !== 'string' ? (req as Request).method : 'GET');
      if (url.includes('/profile/resources') && method === 'POST') {
        return Promise.reject(new Error('server boom'));
      }
      return Promise.resolve(jsonResp(200, emptyEnvelope));
    });
    render(
      <AuthProvider initialSession={SESSION}>
        <VehicleSection />
      </AuthProvider>
    );
    fireEvent.click(screen.getByText('Add vehicle'));
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Y' } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText('Add vehicle'));
    });
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toMatch(/server boom/i);
    });
  });
});
