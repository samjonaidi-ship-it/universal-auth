// @bainbridgebuilders/universal-auth | test/unit/react/components/ConsentCenter.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Covers: render (loading + loaded), accept-flow, withdraw-flow, history, error state.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock flows/consent.ts so we don't hit the network. Use factory pattern so
// each test can stub return values via the imported references.
vi.mock('../../../../src/flows/consent.js', () => ({
  getConsentDocuments: vi.fn(),
  listAllConsents: vi.fn(),
  bulkAcceptConsents: vi.fn(),
  revokeConsent: vi.fn(),
  // re-exports needed by component (types only — no runtime use here)
  listConsents: vi.fn(),
  recordConsent: vi.fn(),
}));

import {
  bulkAcceptConsents,
  getConsentDocuments,
  listAllConsents,
  revokeConsent,
} from '../../../../src/flows/consent.js';
import { ConsentCenter } from '../../../../src/react/components/ConsentCenter.js';
import type { ConsentDocumentRef } from '../../../../src/flows/enroll-flow.js';
import type { ListedConsent } from '../../../../src/flows/consent.js';

const DOCS: readonly ConsentDocumentRef[] = [
  {
    consent_type: 'privacy_policy',
    policy_version: '1.0',
    title: 'Privacy Policy',
    body_url: 'https://example.test/privacy',
    required: true,
    group: 'legal',
  },
  {
    consent_type: 'marketing_communications',
    policy_version: '1.0',
    title: 'Marketing communications',
    body_url: 'https://example.test/marketing',
    required: false,
    group: 'optional',
  },
  {
    consent_type: 'smart_home_integration',
    policy_version: '1.0',
    title: 'Smart Home Device Integration',
    body_url: 'https://example.test/smart-home',
    required: false,
    group: 'optional',
  },
];

const ALL_CONSENTS: readonly ListedConsent[] = [
  {
    id: 'c1',
    consent_type: 'privacy_policy',
    policy_version: '1.0',
    granted_at: '2026-04-01T12:00:00Z',
    revoked_at: null,
  },
  {
    id: 'c2',
    consent_type: 'marketing_communications',
    policy_version: '1.0',
    granted_at: '2026-04-02T12:00:00Z',
    revoked_at: null,
  },
  {
    id: 'c3',
    consent_type: 'old_optional_consent',
    policy_version: '0.9',
    granted_at: '2026-03-01T12:00:00Z',
    revoked_at: '2026-03-15T12:00:00Z',
  },
];

describe('<ConsentCenter>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getConsentDocuments).mockResolvedValue(DOCS);
    vi.mocked(listAllConsents).mockResolvedValue(ALL_CONSENTS);
    vi.mocked(bulkAcceptConsents).mockResolvedValue(undefined);
    vi.mocked(revokeConsent).mockResolvedValue(undefined);
  });

  it('shows loading state, then renders the three sections', async () => {
    render(<ConsentCenter audience="homeowner" />);
    expect(screen.getByLabelText(/consents/i)).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /active consents/i })).toBeTruthy();
    });
    expect(screen.getByRole('heading', { name: /optional consents/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /history/i })).toBeTruthy();
  });

  it('passes audience to getConsentDocuments', async () => {
    render(<ConsentCenter audience="crew" />);
    await waitFor(() => expect(getConsentDocuments).toHaveBeenCalledWith('crew'));
  });

  it('renders required consents WITHOUT a Withdraw button', async () => {
    render(<ConsentCenter audience="homeowner" />);
    await waitFor(() => screen.getByText(/privacy policy/i));
    expect(screen.queryByRole('button', { name: /withdraw privacy/i })).toBeNull();
    // The "Required" badge should appear instead
    expect(screen.getByText(/^required$/i)).toBeTruthy();
  });

  it('lists optional consents that have not yet been accepted (Smart Home)', async () => {
    render(<ConsentCenter audience="homeowner" />);
    await waitFor(() => screen.getByText(/smart home/i));
    expect(screen.getByRole('button', { name: /accept smart home/i })).toBeTruthy();
    // Marketing is already accepted — should appear in Active, not Optional
    expect(screen.queryByRole('button', { name: /accept marketing/i })).toBeNull();
  });

  it('accept-flow: clicking Accept on optional calls bulkAcceptConsents and reloads', async () => {
    const onChanged = vi.fn();
    render(<ConsentCenter audience="homeowner" onConsentChanged={onChanged} />);
    await waitFor(() => screen.getByRole('button', { name: /accept smart home/i }));

    fireEvent.click(screen.getByRole('button', { name: /accept smart home/i }));

    await waitFor(() => {
      expect(bulkAcceptConsents).toHaveBeenCalledWith([
        { consent_type: 'smart_home_integration', policy_version: '1.0' },
      ]);
    });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged.mock.calls[0]![0].consent_type).toBe('smart_home_integration');
    // Reload triggers a second call to listAllConsents
    expect(listAllConsents).toHaveBeenCalledTimes(2);
  });

  it('withdraw-flow: clicking Withdraw on optional active consent calls revokeConsent', async () => {
    const onChanged = vi.fn();
    render(<ConsentCenter audience="homeowner" onConsentChanged={onChanged} />);
    await waitFor(() => screen.getByRole('button', { name: /withdraw marketing/i }));

    fireEvent.click(screen.getByRole('button', { name: /withdraw marketing/i }));

    await waitFor(() => expect(revokeConsent).toHaveBeenCalledWith('c2'));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(onChanged.mock.calls[0]![0].id).toBe('c2');
  });

  it('renders History section with revoked consent', async () => {
    render(<ConsentCenter audience="homeowner" />);
    await waitFor(() => screen.getByRole('heading', { name: /history/i }));
    // The withdrawn entry should be visible
    expect(screen.getByText(/old optional consent/i)).toBeTruthy();
    expect(screen.getByText(/withdrawn/i)).toBeTruthy();
  });

  it('shows error state when initial load fails', async () => {
    vi.mocked(getConsentDocuments).mockRejectedValueOnce(new Error('Network down'));
    render(<ConsentCenter audience="homeowner" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toMatch(/network down/i);
  });

  it('shows empty-state when no active consents and no optional docs', async () => {
    vi.mocked(getConsentDocuments).mockResolvedValueOnce([]);
    vi.mocked(listAllConsents).mockResolvedValueOnce([]);
    render(<ConsentCenter audience="homeowner" />);
    await waitFor(() =>
      expect(screen.getByText(/haven't accepted any consents yet/i)).toBeTruthy()
    );
    expect(screen.getByText(/no optional consents available/i)).toBeTruthy();
  });

  it('renders View policy link for documents with body_url', async () => {
    render(<ConsentCenter audience="homeowner" />);
    await waitFor(() => screen.getByText(/privacy policy/i));
    const links = screen.getAllByRole('link', { name: /view policy/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute('href')).toBe('https://example.test/privacy');
    expect(links[0]!.getAttribute('rel')).toContain('noopener');
  });

  it('a11y: section has aria-label matching heading', async () => {
    render(<ConsentCenter audience="homeowner" heading="My consents" />);
    await waitFor(() => screen.getByRole('heading', { name: /active consents/i }));
    expect(screen.getByLabelText('My consents')).toBeTruthy();
  });
});
