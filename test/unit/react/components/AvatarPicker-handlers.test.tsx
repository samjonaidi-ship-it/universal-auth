// @samjonaidi-ship-it/universal-auth | test/unit/react/components/AvatarPicker-handlers.test.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for AvatarPicker.tsx click handlers (preset / clear) and
// useProfile.ts save / selectPreset / clearAvatar / uploadAvatar paths.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { AvatarPicker } from '../../../../src/react/components/AvatarPicker.js';
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

const PROFILE_BASE = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
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

describe('AvatarPicker click handlers + useProfile mutations', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetProfileStoreForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (req, init) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      const method = init?.method ?? (typeof req !== 'string' ? (req as Request).method : 'GET');
      // Profile fetch + save
      if (url.includes('/profile') && method === 'GET') {
        return jsonResp(200, PROFILE_BASE);
      }
      if (url.includes('/profile') && (method === 'PUT' || method === 'POST')) {
        return jsonResp(200, { ...PROFILE_BASE, profile_version: 2, avatar_preset: 'compass' });
      }
      if (url.includes('/profile/avatar') && method === 'DELETE') {
        return jsonResp(204, '');
      }
      return jsonResp(200, PROFILE_BASE);
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('clicking a preset button calls selectPreset → saveProfile', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /avatar/i })).toBeTruthy();
    });
    const presetButtons = screen.getAllByRole('button', { name: /^Preset / });
    fireEvent.click(presetButtons[0]!);

    await waitFor(() => {
      // The save endpoint should be hit (PUT or POST to /profile)
      const saveCalls = fetchSpy.mock.calls.filter((c) => {
        const url = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
        const method =
          (c[1] as RequestInit | undefined)?.method ??
          (typeof c[0] !== 'string' ? (c[0] as Request).method : 'GET');
        return url.includes('/profile') && (method === 'PUT' || method === 'POST');
      });
      expect(saveCalls.length).toBeGreaterThan(0);
    });
  });

  it('upload button shown; file input present in DOM', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload photo/i })).toBeTruthy();
    });
    // The hidden file input exists
    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBeGreaterThan(0);
  });

  it('clear button only renders when an avatar exists', async () => {
    // First test: no avatar — no clear button
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /avatar/i })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /^clear/i })).toBeNull();
  });

  it('upload button click forwards to hidden file input (verified via click spy)', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upload photo/i })).toBeTruthy();
    });
    const uploadBtn = screen.getByRole('button', { name: /upload photo/i });

    // Capture the hidden file input + spy its click()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const clickSpy = vi.spyOn(fileInput, 'click');

    fireEvent.click(uploadBtn);
    // The visible button's onClick must forward to the hidden input
    expect(clickSpy).toHaveBeenCalledOnce();

    clickSpy.mockRestore();
  });

  it('renders custom heading + custom labels', async () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker
          heading="Profile photo"
          labels={{ upload: 'Pick image', size: 'Max 2 MB' }}
        />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /profile photo/i })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /pick image/i })).toBeTruthy();
    expect(screen.getByText('Max 2 MB')).toBeTruthy();
  });
});
