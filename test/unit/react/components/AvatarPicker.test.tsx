// @samjonaidi-ship-it/universal-auth | test/unit/react/components/AvatarPicker.test.tsx | v1.0.5 | 2026-10-26 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import * as profileHooks from '../../../../src/react/useProfile.js';
import { AuthSdkError } from '../../../../src/errors.js';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { AvatarPicker } from '../../../../src/react/components/AvatarPicker.js';
import type { Session } from '../../../../src/types/api.js';
import type { UniversalProfile } from '../../../../src/types/profile.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
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

const PROFILE: UniversalProfile = {
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

describe('AvatarPicker', () => {
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
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResp(200, PROFILE));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing while profile is loading', () => {
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    // initially profile is null → AvatarPicker returns null
    expect(screen.queryByRole('region', { name: /avatar/i })).toBeNull();
  });

  // v1.0.4 (Lane 2a): pre-seed the profile store via __seedProfileForTests
  // so the component sees data on first render — no fetch-mock race.
  it('renders Avatar heading + 20 preset buttons after hydrate', () => {
    __seedProfileForTests(PROFILE);
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    expect(screen.getByRole('region', { name: /avatar/i })).toBeTruthy();
    // 20 preset cards rendered via buttons with aria-label "Preset ..."
    const presetButtons = screen.getAllByRole('button', { name: /^Preset / });
    expect(presetButtons).toHaveLength(20);
  });

  // v1.0.4 (Lane 2a): pre-seed; deterministic synchronous assertion.
  it('shows the upload button + size hint', () => {
    __seedProfileForTests(PROFILE);
    render(
      <AuthProvider initialSession={SESSION}>
        <AvatarPicker />
      </AuthProvider>
    );
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeTruthy();
    expect(screen.getByText(/jpeg up to 5 mb/i)).toBeTruthy();
  });

  function mockActions() {
    const uploadAvatar = vi.fn().mockResolvedValue(undefined);
    const selectPreset = vi.fn().mockResolvedValue(undefined);
    const clearAvatar = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(profileHooks, 'useProfile').mockReturnValue({
      profile: { ...PROFILE, avatar_url: 'https://images.test/avatar.jpg' },
      uploadAvatar, selectPreset, clearAvatar,
    } as unknown as ReturnType<typeof profileHooks.useProfile>);
    return { uploadAvatar, selectPreset, clearAvatar };
  }

  it.each([
    [new AuthSdkError('AVATAR_UNSUPPORTED_FORMAT', 'unsupported'), 'Photo must be a JPEG, PNG, or WebP image.'],
    [new AuthSdkError('AVATAR_TOO_LARGE', 'too large'), 'Photo is too large. Please choose a file under 5 MB.'],
    [new AuthSdkError('UNKNOWN', 'server rejected photo'), 'server rejected photo'],
    [new Error('connection failed'), 'connection failed'],
    ['offline', 'Upload failed'],
  ])('maps upload errors and re-enables controls: %s', async (failure, message) => {
    const { uploadAvatar } = mockActions();
    uploadAvatar.mockRejectedValue(failure);
    render(<AvatarPicker />);
    const input = screen.getByLabelText('Upload photo', { selector: 'input' }) as HTMLInputElement;
    const file = new File(['image'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(String(message)));
    expect(uploadAvatar).toHaveBeenCalledWith(file);
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeEnabled();
    expect(input.value).toBe('');
  });

  it('does not upload an empty file selection', () => {
    const { uploadAvatar } = mockActions();
    render(<AvatarPicker />);
    fireEvent.change(screen.getByLabelText('Upload photo', { selector: 'input' }), { target: { files: [] } });
    expect(uploadAvatar).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables mutation buttons during upload and clears an earlier error on retry', async () => {
    const { uploadAvatar } = mockActions();
    uploadAvatar.mockRejectedValueOnce(new Error('try again'));
    render(<AvatarPicker />);
    const input = screen.getByLabelText('Upload photo', { selector: 'input' });
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('try again'));
    let finish!: () => void;
    uploadAvatar.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.queryByRole('alert')).toBeNull();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    await act(async () => { finish(); });
    for (const button of screen.getAllByRole('button')) expect(button).toBeEnabled();
    expect(uploadAvatar).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['preset', new Error('preset rejected'), 'preset rejected'],
    ['preset', 'offline', 'Could not save preset'],
    ['clear', new Error('clear rejected'), 'clear rejected'],
    ['clear', 'offline', 'Could not clear'],
  ])('reports a failed %s and leaves controls usable', async (operation, failure, message) => {
    const { selectPreset, clearAvatar } = mockActions();
    const action = operation === 'preset' ? selectPreset : clearAvatar;
    action.mockRejectedValueOnce(failure);
    render(<AvatarPicker />);
    const button = operation === 'preset'
      ? screen.getAllByRole('button', { name: /^Preset / })[0]!
      : screen.getByRole('button', { name: 'Clear' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(String(message)));
    expect(action).toHaveBeenCalledTimes(1);
    expect(button).toBeEnabled();
  });

  it('restores controls after a successful clear', async () => {
    const { clearAvatar } = mockActions();
    render(<AvatarPicker />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Clear' })); });
    expect(clearAvatar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
