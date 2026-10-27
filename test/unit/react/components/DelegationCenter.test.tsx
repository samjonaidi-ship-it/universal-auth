// @samjonaidi-ship-it/universal-auth | test/unit/react/components/DelegationCenter.test.tsx | v0.1.1 | 2026-10-26 | BB
// Coverage for <DelegationCenter>: empty states, list rendering, tab switching,
// revoke confirm flow, GDPR export trigger, danger-scope styling.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { useAccessBulk } from '../../../../src/react/useAccessBulk.js';

vi.mock('../../../../src/react/useAccessBulk.js', () => ({ useAccessBulk: vi.fn() }));

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
    vi.mocked(useAccessBulk).mockReset().mockReturnValue({ allowed: null, loading: false, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('Effective access tab is hidden by default and shows ABAC checks when opt-in', async () => {
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
    // v0.2: tab now wires useAccessBulk against grants_to_me. Since the test
    // hook returns no grants_to_me by default, the tab renders the empty
    // state — NOT the prior 'Available in v1.1.x' stub text.
    expect(
      screen.queryByText(/Available in v1\.1\.x/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/haven't been granted any active delegations/i)
    ).toBeInTheDocument();
  });

  it.each([null, [true, false]])('flattens valid incoming scopes with safe metadata and decision fallbacks: %j', (allowed) => {
    const grants = [null, {}, { id: 'receipt-9' }, { id: 7 }].map((resource_match, i) => ({
      ...TO_ME, id: `incoming-${i}`, resource_match,
      scopes: ['profile:read', 'agent:act_on_behalf', 'unknown:do:extra', 'bad', ':read', 'profile:'],
    }));
    setHook({ grants_to_me: grants });
    vi.mocked(useAccessBulk).mockReturnValue({ allowed, loading: false, error: null });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} showEffectiveAccess />);
    fireEvent.click(screen.getByRole('tab', { name: /Effective access/i }));
    expect(useAccessBulk).toHaveBeenLastCalledWith(grants.flatMap((g, i) => [
      { resource_type: 'profile', resource_id: i === 2 ? 'receipt-9' : '*', action: 'read' },
      { resource_type: 'agent', resource_id: i === 2 ? 'receipt-9' : '*', action: 'act_on_behalf' },
      { resource_type: 'unknown', resource_id: i === 2 ? 'receipt-9' : '*', action: 'do:extra' },
    ]));
    const list = screen.getByRole('list', { name: 'Effective access' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(12);
    expect(within(list).getAllByText('unknown:do:extra')).toHaveLength(4);
    expect(list.querySelectorAll('.bb-delegation-effective-row--danger')).toHaveLength(4);
    expect(list.querySelectorAll('.bb-delegation-effective-row--permit')).toHaveLength(allowed === null ? 0 : 1);
    expect(list).toHaveTextContent('profile #receipt-9');
  });

  it.each(['loading', 'error'] as const)('renders effective-access %s without inventing permits', (state) => {
    setHook({ grants_to_me: [TO_ME] });
    vi.mocked(useAccessBulk).mockReturnValue({
      allowed: null, loading: state === 'loading',
      error: state === 'error' ? { message: 'policy service offline' } as never : null,
    });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} showEffectiveAccess />);
    fireEvent.click(screen.getByRole('tab', { name: /Effective access/i }));
    if (state === 'loading') expect(screen.getByRole('status')).toHaveTextContent('Checking access');
    else expect(screen.getByRole('alert')).toHaveTextContent('Could not verify access: policy service offline');
    expect(screen.queryByRole('list', { name: 'Effective access' })).toBeNull();
  });

  it('ignores malformed-only scopes and revoked incoming grants', () => {
    setHook({ grants_to_me: [
      { ...TO_ME, scopes: ['malformed', ':missing', 'missing:'] },
      { ...REVOKED, id: 'revoked-incoming' },
    ] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} showEffectiveAccess />);
    fireEvent.click(screen.getByRole('tab', { name: /Effective access/i }));
    expect(useAccessBulk).toHaveBeenLastCalledWith([]);
    expect(screen.getByText(/haven't been granted any active delegations/i)).toBeInTheDocument();
  });

  it('renders all grantee kinds, provenance values, unknown scopes and expiration states', () => {
    const kinds = ['identity', 'agent', 'iot_device', 'app', 'api_key', 'external_email'] as const;
    const sources = ['user_consent', 'admin_provision', 'contract', 'automation'] as const;
    const dates = ['invalid', '2000-01-01', new Date(Date.now() + 30_000).toISOString(), '2099-01-01'];
    setHook({ grants_from_me: kinds.map((grantee_kind, i) => ({
      ...FROM_ME, id: `grant-${i}`, grantee_id: `grantee-${i}`, grantee_kind,
      granted_via: sources[i % sources.length], effective_until: dates[i % dates.length], scopes: ['unknown:scope'],
    })) });
    render(<DelegationCenter identity={SAM} scopeCatalog={{}} className="custom-delegations" heading="Shared access" />);
    for (const label of ['Person', 'Agent', 'IoT device', 'App', 'API key', 'External email']) {
      expect(screen.getByText(new RegExp(`^${label} · via`))).toBeInTheDocument();
    }
    expect(screen.getAllByText('unknown:scope')).toHaveLength(6);
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
    expect(screen.getByText('Expires in 1 day')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shared access' })).toHaveClass('custom-delegations');
  });

  it('renders empty and malformed historical dates without crashing and sorts multiple revoked grants', () => {
    setHook({ grants_from_me: [
      REVOKED, { ...REVOKED, id: 'bad-date', revoked_at: 'invalid-date' },
      { ...REVOKED, id: 'empty-date', revoked_at: '' },
    ] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    fireEvent.click(screen.getByRole('tab', { name: /History/i }));
    expect(screen.getByText('Revoked invalid-date')).toBeInTheDocument();
    expect(screen.getByText('Revoked', { exact: true })).toBeInTheDocument();
    expect(document.querySelectorAll('.bb-delegation-card')).toHaveLength(3);
  });

  it.each([new Error('revoke denied'), 'offline'])('keeps the confirmation after a failed revoke: %s', async (failure) => {
    const revoke = vi.fn().mockRejectedValue(failure);
    setHook({ grants_from_me: [FROM_ME], revoke });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    fireEvent.click(screen.getByRole('button', { name: /Revoke grant to alice/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      failure instanceof Error ? failure.message : 'Could not revoke grant.'
    ));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' })).toBeEnabled();
  });

  it('blocks Escape and buttons during revoke, then calls the consumer and closes the dialog', async () => {
    let finish!: () => void;
    const revoke = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const onGrantRevoked = vi.fn();
    setHook({ grants_from_me: [FROM_ME_DANGER], revoke });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} onGrantRevoked={onGrantRevoked} />);
    fireEvent.click(screen.getByRole('button', { name: /Revoke grant to auto-bot/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => { finish(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onGrantRevoked).toHaveBeenCalledWith(expect.objectContaining({ id: FROM_ME_DANGER.id, revoked_at: expect.any(String) }));
  });

  it('Escape closes a non-busy confirmation', () => {
    setHook({ grants_from_me: [FROM_ME] });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    fireEvent.click(screen.getByRole('button', { name: /Revoke grant to alice/i }));
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([new Error('export denied'), 'offline'])('reports export errors and re-enables export: %s', async (failure) => {
    setHook({ exportJson: vi.fn().mockRejectedValue(failure) });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    fireEvent.click(screen.getByRole('tab', { name: /History/i }));
    fireEvent.click(screen.getByRole('button', { name: /Export delegated grants/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(
      failure instanceof Error ? failure.message : 'Could not export grants.'
    ));
    expect(screen.getByRole('button', { name: /Export delegated grants/i })).toBeEnabled();
  });

  it('exports JSON with a real download lifecycle and explicitly warns on CSV fallback', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:delegation-test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    setHook();
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} exportFormat="csv" />);
    fireEvent.click(screen.getByRole('tab', { name: /History/i }));
    fireEvent.click(screen.getByRole('button', { name: /Export delegated grants/i }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('alert')).toHaveTextContent('CSV export is not yet implemented');
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:delegation-test');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('shows error from hook in alert', () => {
    setHook({ error: 'Network down' });
    render(<DelegationCenter identity={SAM} scopeCatalog={CATALOG} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
  });
});
