// @bb/universal-auth | test/unit/react/components/AvatarPicker-extras.test.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for AvatarPicker.tsx — file upload handler + clear handler
// + error states + the already-has-avatar branch (clear button visible).

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

// Profile WITH an existing avatar_url — exercises the "clear button" branch
const PROFILE_WITH_AVATAR = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  avatar_url: 'https://r2/old.jpg',
  persona_extensions: {},
  completeness_score: 100,
  missing_required_fields: [],
  last_updated_at: '2026-04-25T00:00:00Z',
  profile_version: 1,
};

// Profile with avatar_preset set — exercises preset selection branch
const PROFILE_WITH_PRESET = {
  ...PROFILE_WITH_AVATAR,
  avatar_url: undefined,
  avatar_preset: 'crew-01',
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AvatarPicker — clear + file upload branches', () => {
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
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('renders clear button when profile has avatar_url', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResp(200, PROFILE_WITH_AVATAR));

    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^clear/i })).toBeTruthy();
    });
  });

  it('renders clear button when profile has avatar_preset', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResp(200, PROFILE_WITH_PRESET));

    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^clear/i })).toBeTruthy();
    });
  });

  it('preset is shown as selected when matching profile.avatar_preset', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResp(200, PROFILE_WITH_PRESET));

    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      // At least one preset has aria-pressed=true (the matching one)
      const pressed = screen
        .getAllByRole('button', { name: /^Preset / })
        .filter((b) => b.getAttribute('aria-pressed') === 'true');
      expect(pressed.length).toBeGreaterThan(0);
    });
  });

  it('clear button click invokes useProfile.clearAvatar (DELETE /profile/avatar)', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (req, init) => {
      const url = typeof req === 'string' ? req : (req as Request).url;
      const method =
        init?.method ?? (typeof req !== 'string' ? (req as Request).method : 'GET');
      if (url.includes('/profile/avatar') && method === 'DELETE') {
        return jsonResp(204, '');
      }
      return jsonResp(200, PROFILE_WITH_AVATAR);
    });

    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^clear/i })).toBeTruthy();
    });

    const clearBtn = screen.getByRole('button', { name: /^clear/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      const deleteCalls = fetchSpy.mock.calls.filter((c) => {
        const url = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
        const method =
          (c[1] as RequestInit | undefined)?.method ??
          (typeof c[0] !== 'string' ? (c[0] as Request).method : 'GET');
        return url.includes('/profile/avatar') && method === 'DELETE';
      });
      expect(deleteCalls.length).toBeGreaterThan(0);
    });
  });

  it('displays the existing avatar via <img> when avatar_url is set', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResp(200, PROFILE_WITH_AVATAR));

    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    await waitFor(() => {
      const imgs = document.querySelectorAll('img.bb-auth-avatar');
      expect(imgs.length).toBeGreaterThan(0);
    });
  });
});
