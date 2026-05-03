// @samjonaidi-ship-it/universal-auth | test/unit/react/components/PermissionCenter.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Covers: render (loading + loaded), revoke-flow, re-request, dedupe, filter, error.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../../src/flows/permission-grants.js', async () => {
  return {
    listPermissionGrants: vi.fn(),
    revokePermissionGrant: vi.fn(),
    // re-export real types not needed at runtime — vi keeps them as undefined
    recordPermissionGrant: vi.fn(),
    requestAndRecord: vi.fn(),
  };
});

import {
  listPermissionGrants,
  revokePermissionGrant,
  type ListedPermissionGrant,
  type PermissionState,
} from '../../../../src/flows/permission-grants.js';
import { PermissionCenter } from '../../../../src/react/components/PermissionCenter.js';

function makeGrant(over: Partial<ListedPermissionGrant>): ListedPermissionGrant {
  return {
    id: 'g1',
    permission_key: 'geolocation',
    state: 'granted',
    prompted: true,
    device_id: null,
    user_agent: null,
    recorded_at: '2026-04-15T12:00:00Z',
    scope: null,
    expires_at: null,
    revoked_at: null,
    revoked_reason: null,
    ...over,
  };
}

const GRANTS: readonly ListedPermissionGrant[] = [
  makeGrant({ id: 'g1', permission_key: 'geolocation', state: 'granted' }),
  // Older record for the same key — must be deduped out
  makeGrant({
    id: 'g1-old',
    permission_key: 'geolocation',
    state: 'denied',
    recorded_at: '2026-04-01T12:00:00Z',
  }),
  makeGrant({ id: 'g2', permission_key: 'camera', state: 'denied' }),
  makeGrant({
    id: 'g3',
    permission_key: 'notifications',
    state: 'granted',
    expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  }),
  makeGrant({
    id: 'g4',
    permission_key: 'microphone',
    state: 'granted',
    revoked_at: '2026-04-20T12:00:00Z',
  }),
];

describe('<PermissionCenter>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPermissionGrants).mockResolvedValue(GRANTS);
    vi.mocked(revokePermissionGrant).mockResolvedValue(undefined);
  });

  it('shows loading state then renders one row per permission_key (deduped)', async () => {
    render(<PermissionCenter />);
    expect(screen.getByLabelText(/device permissions/i)).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await waitFor(() => screen.getByText(/^location$/i));
    // 4 unique keys: geolocation, camera, notifications, microphone
    expect(screen.getAllByRole('listitem').length).toBe(4);
  });

  it('renders human label for known keys (camera → Camera)', async () => {
    render(<PermissionCenter />);
    await waitFor(() => screen.getByText(/^camera$/i));
    expect(screen.getByText(/^camera$/i)).toBeTruthy();
    expect(screen.getByText(/^notifications$/i)).toBeTruthy();
  });

  it('shows Revoke button only for granted (non-revoked) entries', async () => {
    render(<PermissionCenter />);
    await waitFor(() => screen.getByText(/^location$/i));
    // geolocation (granted) + notifications (granted)  → 2 revoke buttons
    expect(screen.getAllByRole('button', { name: /^revoke /i }).length).toBe(2);
    // microphone is revoked → no revoke button for it
    expect(screen.queryByRole('button', { name: /revoke microphone/i })).toBeNull();
    // camera is denied → no revoke
    expect(screen.queryByRole('button', { name: /revoke camera/i })).toBeNull();
  });

  it('revoke-flow: clicking Revoke calls revokePermissionGrant and onRevoked', async () => {
    const onRevoked = vi.fn();
    render(<PermissionCenter onRevoked={onRevoked} />);
    await waitFor(() => screen.getByRole('button', { name: /revoke location/i }));

    fireEvent.click(screen.getByRole('button', { name: /revoke location/i }));

    await waitFor(() => expect(revokePermissionGrant).toHaveBeenCalledWith('g1'));
    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(onRevoked.mock.calls[0]![0].id).toBe('g1');
    // Reload triggers a second list call
    expect(listPermissionGrants).toHaveBeenCalledTimes(2);
  });

  it('re-request-flow: shows Re-request for denied/revoked when onRequest provided', async () => {
    const onRequest = vi.fn().mockResolvedValue('granted' as PermissionState);
    render(<PermissionCenter onRequest={onRequest} />);
    await waitFor(() => screen.getByText(/^camera$/i));

    // camera is denied → re-request available
    const camRequestBtn = screen.getByRole('button', { name: /re-request camera/i });
    expect(camRequestBtn).toBeTruthy();
    // microphone is revoked → re-request available
    expect(screen.getByRole('button', { name: /re-request microphone/i })).toBeTruthy();

    fireEvent.click(camRequestBtn);
    await waitFor(() => expect(onRequest).toHaveBeenCalledWith('camera'));
  });

  it('does not show Re-request when onRequest not provided', async () => {
    render(<PermissionCenter />);
    await waitFor(() => screen.getByText(/^camera$/i));
    expect(screen.queryByRole('button', { name: /re-request/i })).toBeNull();
  });

  it('filter prop limits visible rows', async () => {
    render(<PermissionCenter filter={['geolocation', 'camera']} />);
    await waitFor(() => screen.getByText(/^location$/i));
    expect(screen.getAllByRole('listitem').length).toBe(2);
    expect(screen.queryByText(/^notifications$/i)).toBeNull();
    expect(screen.queryByText(/^microphone$/i)).toBeNull();
  });

  it('shows expiration countdown when expires_at is set', async () => {
    render(<PermissionCenter />);
    await waitFor(() => screen.getByText(/^notifications$/i));
    // ~5 days from now (with rounding tolerance)
    expect(screen.getByText(/expires in [4-6] days/i)).toBeTruthy();
  });

  it('renders state pills for each row', async () => {
    render(<PermissionCenter />);
    await waitFor(() => screen.getByText(/^location$/i));
    // Granted, Denied, Revoked pills should all appear
    expect(screen.getAllByText(/granted/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/denied/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/revoked/i).length).toBeGreaterThan(0);
  });

  it('shows error state on load failure', async () => {
    vi.mocked(listPermissionGrants).mockRejectedValueOnce(new Error('Network err'));
    render(<PermissionCenter />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/network err/i);
  });

  it('shows empty state when no records', async () => {
    vi.mocked(listPermissionGrants).mockResolvedValueOnce([]);
    render(<PermissionCenter />);
    await waitFor(() =>
      expect(screen.getByText(/no permission records yet/i)).toBeTruthy()
    );
  });

  it('a11y: section has aria-label matching heading', async () => {
    render(<PermissionCenter heading="My permissions" />);
    await waitFor(() => screen.getByText(/^location$/i));
    expect(screen.getByLabelText('My permissions')).toBeTruthy();
  });
});
