// @vitest-environment happy-dom
// @bainbridgebuilders/universal-auth | test/unit/react/components/GearSection.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

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
});
