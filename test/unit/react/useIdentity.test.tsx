// @samjonaidi-ship-it/universal-auth | test/unit/react/useIdentity.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '../../../src/react/AuthProvider.js';
import { useIdentity } from '../../../src/react/useIdentity.js';
import type { Session } from '../../../src/types/api.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../src/profile/profile-store.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
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
  aggregate: { features: ['bb_home:read'], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

const PROFILE_ENVELOPE = {
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
  addresses: [
    {
      id: 'addr-1',
      address_type: 'residence',
      line1: '123 Main',
      city: 'Bainbridge',
      state_region: 'WA',
      postal_code: '98110',
      country: 'US',
      is_primary: true,
    },
  ],
  resources: [
    {
      id: 'res-1',
      resource_type: 'property',
      status: 'active',
      name: 'Main house',
      attributes: {},
      verified: false,
      external_refs: {},
    },
    {
      id: 'res-2',
      resource_type: 'vehicle',
      status: 'active',
      name: 'F150',
      attributes: { make: 'Ford' },
      verified: false,
      external_refs: {},
    },
  ],
  media: [
    {
      id: 'm-1',
      resource_id: 'res-2',
      attached_to: 'vehicle',
      media_type: 'image',
      mime_type: 'image/jpeg',
      url: 'https://r2.test/m1.jpg',
      sort_order: 0,
      is_primary: false,
      visibility: 'private',
      uploaded_at: '2026-04-30T00:00:00Z',
      uploaded_by: 'sam',
    },
  ],
  property_assets: [],
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function Probe(): ReactNode {
  const id = useIdentity();
  return (
    <div>
      <span data-testid="state">{id.state}</span>
      <span data-testid="addresses">{id.addresses.length}</span>
      <span data-testid="resources">{id.resources.length}</span>
      <span data-testid="media">{id.media.length}</span>
      <span data-testid="vehicles">{id.resourcesOfType('vehicle').length}</span>
      <span data-testid="properties">{id.resourcesOfType('property').length}</span>
      <span data-testid="cap">{id.hasCapability('bb_home:read') ? 'yes' : 'no'}</span>
      <button
        type="button"
        onClick={() => {
          void id.archiveResource('res-2');
        }}
      >
        archive
      </button>
    </div>
  );
}

describe('useIdentity', () => {
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
      sdkVersion: '1.0.0-rc.4',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches profile + parses extended PCP shape', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, PROFILE_ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready'));
    expect(screen.getByTestId('addresses').textContent).toBe('1');
    expect(screen.getByTestId('resources').textContent).toBe('2');
    expect(screen.getByTestId('vehicles').textContent).toBe('1');
    expect(screen.getByTestId('properties').textContent).toBe('1');
    expect(screen.getByTestId('media').textContent).toBe('1');
    expect(screen.getByTestId('cap').textContent).toBe('yes');
  });

  it('reports error state when fetch fails', async () => {
    fetchSpy.mockResolvedValue(jsonResp(500, { error: { code: 'X', message: 'boom' } }));
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('error'));
  });

  it('archiveResource removes resource locally', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResp(200, PROFILE_ENVELOPE))
      .mockResolvedValueOnce(jsonResp(204, {}));
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('vehicles').textContent).toBe('1'));
    await act(async () => {
      screen.getByText('archive').click();
    });
    await waitFor(() => expect(screen.getByTestId('vehicles').textContent).toBe('0'));
  });
});
