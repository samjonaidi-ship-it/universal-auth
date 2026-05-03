// @samjonaidi-ship-it/universal-auth | test/unit/react/ConsentVersionWatcher.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Covers: computeStale unit logic, render gating, accept-flow, fail-open behavior.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../src/flows/consent.js', () => ({
  getConsentDocuments: vi.fn(),
  listConsents: vi.fn(),
  bulkAcceptConsents: vi.fn(),
  // unused — kept so the module barrel resolves cleanly
  listAllConsents: vi.fn(),
  revokeConsent: vi.fn(),
  recordConsent: vi.fn(),
}));

import {
  ConsentVersionWatcher,
  computeStale,
} from '../../../src/react/ConsentVersionWatcher.js';
import {
  getConsentDocuments,
  listConsents,
  bulkAcceptConsents,
  type ListedConsent,
} from '../../../src/flows/consent.js';
import { AuthProvider } from '../../../src/react/AuthProvider.js';
import type { Session } from '../../../src/types/api.js';
import type { ConsentDocumentRef } from '../../../src/flows/enroll-flow.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

// ── computeStale unit tests ────────────────────────────────────────────────

describe('computeStale (pure)', () => {
  const baseDoc: ConsentDocumentRef = {
    consent_type: 'privacy_policy',
    policy_version: '2.0',
    title: 'Privacy Policy',
    body_url: '#',
    required: true,
    group: 'legal',
  };

  it('returns empty when user has accepted current version', () => {
    const accepted: ListedConsent[] = [
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '2.0',
        granted_at: 'x',
        revoked_at: null,
      },
    ];
    expect(computeStale([baseDoc], accepted)).toHaveLength(0);
  });

  it('marks doc stale when user accepted older version', () => {
    const accepted: ListedConsent[] = [
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '1.0',
        granted_at: 'x',
        revoked_at: null,
      },
    ];
    const stale = computeStale([baseDoc], accepted);
    expect(stale).toHaveLength(1);
    expect(stale[0]!.consent_type).toBe('privacy_policy');
  });

  it('marks doc stale when user has never accepted', () => {
    expect(computeStale([baseDoc], [])).toHaveLength(1);
  });

  it('ignores optional documents', () => {
    const optional: ConsentDocumentRef = { ...baseDoc, required: false };
    expect(computeStale([optional], [])).toHaveLength(0);
  });

  it('treats revoked acceptance as no acceptance', () => {
    const accepted: ListedConsent[] = [
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '2.0',
        granted_at: 'x',
        revoked_at: '2026-04-20T00:00:00Z',
      },
    ];
    expect(computeStale([baseDoc], accepted)).toHaveLength(1);
  });

  it('compares semver-style versions correctly (1.0 < 1.1 < 2.0)', () => {
    const v110: ConsentDocumentRef = { ...baseDoc, policy_version: '1.1' };
    const acceptedOld: ListedConsent[] = [
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '1.0',
        granted_at: 'x',
        revoked_at: null,
      },
    ];
    expect(computeStale([v110], acceptedOld)).toHaveLength(1);

    const acceptedNew: ListedConsent[] = [
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '1.2',
        granted_at: 'x',
        revoked_at: null,
      },
    ];
    expect(computeStale([v110], acceptedNew)).toHaveLength(0);
  });

  it('keeps the highest accepted version when duplicates exist', () => {
    const v110: ConsentDocumentRef = { ...baseDoc, policy_version: '1.1' };
    const accepted: ListedConsent[] = [
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '1.0',
        granted_at: 'x',
        revoked_at: null,
      },
      {
        id: 'b',
        consent_type: 'privacy_policy',
        policy_version: '1.2',
        granted_at: 'y',
        revoked_at: null,
      },
    ];
    expect(computeStale([v110], accepted)).toHaveLength(0);
  });
});

// ── Component-level tests ──────────────────────────────────────────────────

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  aggregate: { features: [], app_access: [] },
  primary_persona: 'homeowner',
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
  personas: [
    {
      persona_type: 'homeowner',
      party_id: 'jonaidi',
      party_name: 'Jonaidi Household',
      role_in_party: 'owner',
      ct_role: null,
      plan_slug: 'home_basic',
      subscription_status: 'active',
      landing_route: '/home',
    },
  ],
};

const STALE_DOC: ConsentDocumentRef = {
  consent_type: 'privacy_policy',
  policy_version: '2.0',
  title: 'Privacy Policy',
  body_url: '#',
  required: true,
  group: 'legal',
};

describe('<ConsentVersionWatcher>', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.4',
    });
  });

  it('renders children when no stale consents', async () => {
    vi.mocked(getConsentDocuments).mockResolvedValue([STALE_DOC]);
    vi.mocked(listConsents).mockResolvedValue([
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '2.0',
        granted_at: 'x',
        revoked_at: null,
      },
    ]);

    render(
      <AuthProvider initialSession={SESSION}>
        <ConsentVersionWatcher>
          <div data-testid="child">App content</div>
        </ConsentVersionWatcher>
      </AuthProvider>
    );

    await waitFor(() => expect(getConsentDocuments).toHaveBeenCalled());
    expect(screen.getByTestId('child')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows re-prompt modal when required consent is stale', async () => {
    vi.mocked(getConsentDocuments).mockResolvedValue([STALE_DOC]);
    vi.mocked(listConsents).mockResolvedValue([
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: '1.0', // older than 2.0
        granted_at: 'x',
        revoked_at: null,
      },
    ]);

    render(
      <AuthProvider initialSession={SESSION}>
        <ConsentVersionWatcher>
          <div data-testid="child">App content</div>
        </ConsentVersionWatcher>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    // Children not rendered while modal is up
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('dismisses overlay after user accepts', async () => {
    let acceptedVersion = '1.0';
    vi.mocked(getConsentDocuments).mockResolvedValue([STALE_DOC]);
    vi.mocked(listConsents).mockImplementation(async () => [
      {
        id: 'a',
        consent_type: 'privacy_policy',
        policy_version: acceptedVersion,
        granted_at: 'x',
        revoked_at: null,
      },
    ]);
    vi.mocked(bulkAcceptConsents).mockImplementation(async () => {
      acceptedVersion = '2.0';
    });

    render(
      <AuthProvider initialSession={SESSION}>
        <ConsentVersionWatcher>
          <div data-testid="child">App content</div>
        </ConsentVersionWatcher>
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    // Tick the consent checkbox in the embedded ConsentScreen and submit
    const checkbox = screen.getAllByRole('checkbox')[0]!;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));

    await waitFor(() => expect(bulkAcceptConsents).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('fails open on network error (renders children, no dialog)', async () => {
    vi.mocked(getConsentDocuments).mockRejectedValue(new Error('boom — not transient'));
    vi.mocked(listConsents).mockResolvedValue([]);

    render(
      <AuthProvider initialSession={SESSION}>
        <ConsentVersionWatcher>
          <div data-testid="child">App content</div>
        </ConsentVersionWatcher>
      </AuthProvider>
    );

    await waitFor(() => expect(getConsentDocuments).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  it('retries once on transient errors before failing open', async () => {
    vi.mocked(getConsentDocuments)
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce([STALE_DOC]);
    vi.mocked(listConsents).mockResolvedValue([]);

    render(
      <AuthProvider initialSession={SESSION}>
        <ConsentVersionWatcher>
          <div data-testid="child">App content</div>
        </ConsentVersionWatcher>
      </AuthProvider>
    );

    await waitFor(() => expect(getConsentDocuments).toHaveBeenCalledTimes(2));
    // After successful retry we should see the dialog (privacy_policy is stale, never accepted)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  });

  it('respects audience prop override', async () => {
    vi.mocked(getConsentDocuments).mockResolvedValue([]);
    vi.mocked(listConsents).mockResolvedValue([]);

    render(
      <AuthProvider initialSession={SESSION}>
        <ConsentVersionWatcher audience="crew">
          <div data-testid="child">App content</div>
        </ConsentVersionWatcher>
      </AuthProvider>
    );

    await waitFor(() => expect(getConsentDocuments).toHaveBeenCalledWith('crew'));
  });
});
