// @bainbridgebuilders/universal-auth | test/unit/react/useProfile.test.tsx | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider } from '../../../src/react/AuthProvider.js';
import { useProfile } from '../../../src/react/useProfile.js';
import type { Session } from '../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../src/profile/profile-store.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

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

const PROFILE = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  phone_e164: '+12065550000',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  emergency_contact: { name: 'Mom', phone_e164: '+12065550999', relationship: 'parent' },
  avatar_preset: 'crew-01',
  persona_extensions: {},
  completeness_score: 100,
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

function Probe({ onProfile }: { onProfile: (p: ReturnType<typeof useProfile>) => void }): ReactNode {
  const profile = useProfile();
  onProfile(profile);
  return <div data-testid="probe" />;
}

describe('react/useProfile', () => {
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
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(jsonResp(200, PROFILE))
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('exposes the canonical hook surface', () => {
    let captured: ReturnType<typeof useProfile> | null = null;
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe onProfile={(p) => (captured = p)} />
      </AuthProvider>
    );
    expect(captured).not.toBeNull();
    const p = captured as unknown as ReturnType<typeof useProfile>;
    expect(typeof p.save).toBe('function');
    expect(typeof p.uploadAvatar).toBe('function');
    expect(typeof p.selectPreset).toBe('function');
    expect(typeof p.clearAvatar).toBe('function');
    expect(typeof p.refresh).toBe('function');
  });

  it('hydrates profile from server on mount', async () => {
    let captured: ReturnType<typeof useProfile> | null = null;
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe onProfile={(p) => (captured = p)} />
      </AuthProvider>
    );
    await waitFor(() => {
      const p = captured as unknown as ReturnType<typeof useProfile>;
      expect(p.profile?.display_name).toBe('Sam');
    });
  });

  it('completeness reflects profile.completeness_score', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...PROFILE, completeness_score: 42 }));
    let captured: ReturnType<typeof useProfile> | null = null;
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe onProfile={(p) => (captured = p)} />
      </AuthProvider>
    );
    await waitFor(() => {
      const p = captured as unknown as ReturnType<typeof useProfile>;
      expect(p.completeness).toBe(42);
    });
  });

  it('needsSetup is true when crew completeness < 60', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...PROFILE, completeness_score: 30 }));
    let captured: ReturnType<typeof useProfile> | null = null;
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe onProfile={(p) => (captured = p)} />
      </AuthProvider>
    );
    await waitFor(() => {
      const p = captured as unknown as ReturnType<typeof useProfile>;
      expect(p.needsSetup).toBe(true);
    });
  });
});
