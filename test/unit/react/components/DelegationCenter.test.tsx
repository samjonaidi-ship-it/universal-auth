// @samjonaidi-ship-it/universal-auth | test/unit/react/components/DelegationCenter.test.tsx | v0.1.0 | 2026-05-06 | BB
// Coverage for <DelegationCenter>: empty states, list rendering, tab switching,
// revoke confirm flow, GDPR export trigger, danger-scope styling.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the hook so the component is unit-tested in isolation.
vi.mock('../../../../src/react/useDelegatedGrants.js', () => ({
  useDelegatedGrants: vi.fn(),
  __resetDelegatedGrantsCacheForTests: vi.fn(),
}));

import { useDelegatedGrants } from '../../../../src/react/useDelegatedGrants.js';
import { DelegationCenter } from '../../../../src/react/components/DelegationCenter.js';
import type { DelegatedGrant, ScopeMeta } from '../../../../src/flows/delegation.js';
import type { Identity } from '../../../../src/types/api.js';

const SAM: Identity = {
  identity_id: 'sam',
  identity_kind: 'human',
  display_name: 'Sam',
};

const CATALOG: Record<string, ScopeMeta> = {
  'profile:read': { label: 'Read your profile' },
  'agent:act_on_behalf': {
    label: 'Act on your behalf',
    danger: true,
    explanation: 'High-impact.',
  },
};

const FROM_ME: DelegatedGrant = {
  id: 'g1',
  grantor_id: 'sam',
  grantee_kind: 'identity',
  grantee_id: 'alice',
  scopes: ['profile:read'],
  resource_match: null,
  effective_from: '2026-05-01T00:00:00Z',
  effective_until: '2099-08-01T00:00:00Z',
  revoked_at: null,
  revoked_by: null,
  revoked_reason: null,
  granted_via: 'user_consent',
  audit_metadata: null,
  created_at: '2026-05-01T00:00:00Z',
};

const FROM_ME_DANGER: DelegatedGrant = {
  ...FROM_ME,
  id: 'g3',
  grantee_id: 'auto-bot',
  grantee_kind: 'agent',
  scopes: ['profile:read', 'agent:act_on_behalf'],
};

const TO_ME: DelegatedGrant = {
  ...FROM_ME,
  id: 'g2',
  grantor_id: 'bob',
  grantee_id: 'sam',
};

const REVOKED: DelegatedGrant = {
  ...FROM_ME,
  id: 'g_old',
  revoked_at: '2026-04-15T00:00:00Z',
  revoked_by: 'sam',
  revoked_reason: 'no longer needed',
};

const mockHook = useDelegatedGrants as unknown as ReturnType<typeof vi.fn>;

function setHook(overrides: Partial<ReturnType<typeof useDelegatedGrants>> = {}): {
  grant: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
  exportJson: ReturnType<typeof vi.fn>;
  refetch: ReturnType<typeof vi.fn>;
} {
  const grant = vi.fn().mockResolvedValue(FROM_ME);
  const revoke = vi.fn().mockResolvedValue(undefined);
  const refetch = vi.fn().mockResolvedValue(undefined);
  const exportJson = vi
    .fn()
    .mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));

  mockHook.mockReturnValue({
    grants_from_me: [],
    grants_to_me: [],
    loading: false,
    error: null,
    grant,
    revoke,
    refetch,
    exportJson,
    ...overrides,
  });

  return { grant, revoke, exportJson, refetch };
}

describe('<DelegationCenter>', () => {
  beforeEach(() => {
    mockHook.mockReset();
  });

  it('renders empty state in Active tab when no grants', () => {
    setHook();
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    expect(
      screen.getByText(/haven't granted access to anyone/i)
    ).toBeInTheDocument();
  });

  it('renders Active grants and the scope label from catalog', () => {
    setHook({ grants_from_me: [FROM_ME, FROM_ME_DANGER] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getAllByText('Read your profile').length).toBeGreaterThan(0);
    // Danger scope label visible
    expect(screen.getByText('Act on your behalf')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    setHook({ loading: true });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('switches to Granted-to-me tab', () => {
    setHook({ grants_to_me: [TO_ME] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    fireEvent.click(screen.getByRole('tab', { name: /Granted to me/i }));
    expect(screen.getByText(/sam/)).toBeInTheDocument();
  });

  it('History tab shows revoked grants and an export button', async () => {
    const { exportJson } = setHook({ grants_from_me: [REVOKED] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    fireEvent.click(screen.getByRole('tab', { name: /History/i }));
    const exportBtn = screen.getByRole('button', {
      name: /export delegated grants as json/i,
    });
    expect(exportBtn).toBeInTheDocument();

    fireEvent.click(exportBtn);
    await waitFor(() => {
      expect(exportJson).toHaveBeenCalledTimes(1);
    });
  });

  it('revoke flow: opens confirm dialog → confirm → calls revoke()', async () => {
    const { revoke } = setHook({ grants_from_me: [FROM_ME] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);

    fireEvent.click(screen.getByRole('button', { name: /Revoke grant to alice/i }));
    // Dialog should be open
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Click the Revoke button inside the dialog (second one, primary action)
    const dialogButtons = dialog.querySelectorAll('button');
    const confirmBtn = Array.from(dialogButtons).find(
      (b) => b.textContent?.trim() === 'Revoke'
    );
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn!);

    await waitFor(() => {
      expect(revoke).toHaveBeenCalledWith('g1');
    });
  });

  it('revoke confirm dialog: Cancel closes without calling revoke', async () => {
    const { revoke } = setHook({ grants_from_me: [FROM_ME] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);

    fireEvent.click(screen.getByRole('button', { name: /Revoke grant to alice/i }));
    const dialog = await screen.findByRole('dialog');
    const cancelBtn = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel'
    );
    fireEvent.click(cancelBtn!);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(revoke).not.toHaveBeenCalled();
  });

  it('danger-scope grant: confirm dialog gets danger class', async () => {
    setHook({ grants_from_me: [FROM_ME_DANGER] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Revoke grant to auto-bot/i })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      dialog.querySelector('.bb-delegation-confirm-dialog-danger')
    ).not.toBeNull();
  });

  it('Effective access tab is hidden by default and rendered as stub when opt-in', () => {
    setHook();
    const { rerender } = render(
      <DelegationCenter identity={SAM} scopeCatalog={CATALOG} />
    );
    expect(
      screen.queryByRole('tab', { name: /Effective access/i })
    ).toBeNull();

    rerender(
      <DelegationCenter
        identity={SAM}
        scopeCatalog={CATALOG}
        showEffectiveAccess
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: /Effective access/i }));
    expect(screen.getByText(/Available in v1\.1\.x/i)).toBeInTheDocument();
  });

  it('shows error from hook in alert', () => {
    setHook({ error: 'Network down' });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
  });
});
