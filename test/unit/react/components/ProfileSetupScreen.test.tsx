// @samjonaidi-ship-it/universal-auth | test/unit/react/components/ProfileSetupScreen.test.tsx | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { ProfileSetupScreen } from '../../../../src/react/components/ProfileSetupScreen.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
import { __resetPersonaFieldsForTests } from '../../../../src/profile/persona-fields.js';
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

const PROFILE = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 50,
  missing_required_fields: [],
  last_updated_at: '2026-04-25T00:00:00Z',
  profile_version: 1,
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProfileSetupScreen — 3 modes (§5.5.1)', () => {
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
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    // Default fetch mock — return profile for /profile, empty registry for
    // /persona-fields-registry, generic 200 otherwise.
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('/identity/v1/persona-fields-registry')) {
        return Promise.resolve(jsonResp(200, { version: 1, personas: {} }));
      }
      if (u.includes('/identity/v1/profile')) {
        return Promise.resolve(jsonResp(200, PROFILE));
      }
      return Promise.resolve(jsonResp(200, { ok: true }));
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('mode=deferred renders nothing', () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <ProfileSetupScreen mode="deferred" />
      </AuthProvider>
    );
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('shows loading skeleton before profile hydrates', () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <ProfileSetupScreen mode="automatic" />
      </AuthProvider>
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('mode=automatic renders all sub-components after hydrate', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <ProfileSetupScreen mode="automatic" />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /complete your profile/i })).toBeTruthy();
    });
    // Has avatar picker + contact form + completeness bar
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByRole('region', { name: /avatar/i })).toBeTruthy();
    // Drain any in-flight fetches (PersonaFieldsForm registry call) so vitest
    // teardown doesn't abort them and surface as unhandled rejections.
    await new Promise((r) => setTimeout(r, 50));
  });

  it('mode=guided renders shell + progress bar + children', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <ProfileSetupScreen mode="guided">
          <div data-testid="custom-child">my custom UI</div>
        </ProfileSetupScreen>
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('custom-child')).toBeTruthy();
    });
    expect(screen.getByRole('progressbar')).toBeTruthy();
    // Should NOT render the AvatarPicker (guided mode doesn't auto-include sub-components)
    expect(screen.queryByRole('region', { name: /avatar/i })).toBeNull();
  });
});
