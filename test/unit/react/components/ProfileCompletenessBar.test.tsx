// @samjonaidi-ship-it/universal-auth | test/unit/react/components/ProfileCompletenessBar.test.tsx | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { ProfileCompletenessBar } from '../../../../src/react/components/ProfileCompletenessBar.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
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
      plan_slug: 's',
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

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProfileCompletenessBar', () => {
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
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('renders progressbar with role + aria attributes', async () => {
    fetchSpy.mockResolvedValue(
      jsonResp(200, {
        identity_id: 'sam',
        display_name: 'Sam',
        email: 'sam@x.com',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        initials_color: '#C8102E',
        persona_extensions: {},
        completeness_score: 75,
        missing_required_fields: [],
        last_updated_at: '2026-04-25T00:00:00Z',
        profile_version: 1,
      })
    );
    render(
      <AuthProvider initialSession={SESSION}>
        <ProfileCompletenessBar />
      </AuthProvider>
    );
    await waitFor(() => {
      const bar = screen.getByRole('progressbar');
      expect(bar).toBeTruthy();
      expect(bar.getAttribute('aria-valuenow')).toBe('75');
      expect(bar.getAttribute('aria-valuemin')).toBe('0');
      expect(bar.getAttribute('aria-valuemax')).toBe('100');
    });
    expect(screen.getByText(/75% complete/i)).toBeTruthy();
  });

  it('shows missing-required hint when fields are missing', async () => {
    fetchSpy.mockResolvedValue(
      jsonResp(200, {
        identity_id: 'sam',
        display_name: 'Sam',
        email: 'sam@x.com',
        locale: 'en-US',
        timezone: 'America/Los_Angeles',
        initials_color: '#C8102E',
        persona_extensions: {},
        completeness_score: 40,
        missing_required_fields: ['phone_e164', 'emergency_contact'],
        last_updated_at: '2026-04-25T00:00:00Z',
        profile_version: 1,
      })
    );
    render(
      <AuthProvider initialSession={SESSION}>
        <ProfileCompletenessBar />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByText(/2 required fields remaining/i)).toBeTruthy();
    });
  });
});
