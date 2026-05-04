// @samjonaidi-ship-it/universal-auth | test/unit/react/components/CompletenessBar.test.tsx | v1.0.4 | 2026-05-04 | BB
// v1.0.4 (Lane 2a): switched from fetch-mock + waitFor (which races against
// the v1.0.1 hydrate generation guard in jsdom/happy-dom) to deterministic
// pre-seed via __seedProfileForTests. Tests now assert synchronously on
// first render.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { CompletenessBar } from '../../../../src/react/components/CompletenessBar.js';
import type { Session } from '../../../../src/types/api.js';
import type { UniversalProfile } from '../../../../src/types/profile.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import {
  __resetProfileStoreForTests,
  __seedProfileForTests,
} from '../../../../src/profile/profile-store.js';
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

function profile(score: number, missing: string[]): UniversalProfile {
  return {
    identity_id: 'sam',
    display_name: 'Sam',
    email: 'sam@x.com',
    locale: 'en-US',
    timezone: 'America/Los_Angeles',
    initials_color: '#C8102E',
    persona_extensions: {},
    completeness_score: score,
    missing_required_fields: missing,
    last_updated_at: '2026-04-30T00:00:00Z',
    profile_version: 1,
  };
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CompletenessBar', () => {
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

  it('renders without crashing + sets aria attributes', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, profile(85, [])));
    render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar />
      </AuthProvider>
    );
    await waitFor(() => {
      const bar = screen.getByRole('progressbar');
      expect(bar.getAttribute('aria-valuenow')).toBe('85');
    });
  });

  it('uses green band for ≥80', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, profile(82, [])));
    const { container } = render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(container.querySelector('[data-band="green"]')).not.toBeNull()
    );
  });

  it('uses yellow band for 50-79', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, profile(60, ['phone_e164'])));
    const { container } = render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(container.querySelector('[data-band="yellow"]')).not.toBeNull()
    );
  });

  it('uses red band for <50', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, profile(30, ['phone_e164', 'emergency_contact'])));
    const { container } = render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(container.querySelector('[data-band="red"]')).not.toBeNull()
    );
  });

  // v1.0.4 (Lane 2a): pre-seed; deterministic synchronous assertion.
  it('lists missing required fields with human labels', () => {
    __seedProfileForTests(profile(40, ['phone_e164', 'emergency_contact']));
    render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar />
      </AuthProvider>
    );
    expect(screen.getByText('Phone number')).toBeTruthy();
    expect(screen.getByText('Emergency contact')).toBeTruthy();
  });

  // v1.0.4 (Lane 2a): pre-seed; deterministic synchronous assertion.
  it('invokes onFieldClick when missing-field button clicked', () => {
    __seedProfileForTests(profile(40, ['phone_e164']));
    const onFieldClick = vi.fn();
    render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar onFieldClick={onFieldClick} />
      </AuthProvider>
    );
    fireEvent.click(screen.getByText('Phone number'));
    expect(onFieldClick).toHaveBeenCalledWith('phone_e164');
  });

  // v1.0.4 (Lane 2a): pre-seed; deterministic synchronous assertion.
  it('honors fieldLabels override', () => {
    __seedProfileForTests(profile(40, ['custom_key']));
    render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar fieldLabels={{ custom_key: 'Custom thing' }} />
      </AuthProvider>
    );
    expect(screen.getByText('Custom thing')).toBeTruthy();
  });

  it('hides missing list when hideMissing=true', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, profile(40, ['phone_e164'])));
    render(
      <AuthProvider initialSession={SESSION}>
        <CompletenessBar hideMissing />
      </AuthProvider>
    );
    await waitFor(() => screen.getByRole('progressbar'));
    expect(screen.queryByText('Phone number')).toBeNull();
  });
});
