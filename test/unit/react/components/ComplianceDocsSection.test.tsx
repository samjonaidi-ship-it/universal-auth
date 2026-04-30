// @bainbridgebuilders/universal-auth | test/unit/react/components/ComplianceDocsSection.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { ComplianceDocsSection } from '../../../../src/react/components/ComplianceDocsSection.js';
import type { Session } from '../../../../src/types/api.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../../src/profile/profile-store.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../../src/core/event-reporter.js';

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  primary_persona: 'subcontractor',
  personas: [
    {
      persona_type: 'subcontractor',
      party_id: 'p',
      party_name: 'BB',
      role_in_party: 'r',
      ct_role: null,
      plan_slug: 'sub_basic',
      subscription_status: 'active',
      landing_route: '/sub',
    },
  ],
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

const ENVELOPE = {
  identity_id: 'sam',
  display_name: 'Sam',
  email: 'sam@x.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 80,
  missing_required_fields: [],
  last_updated_at: '2026-04-30T00:00:00Z',
  profile_version: 1,
  addresses: [],
  resources: [
    {
      id: 'doc-1',
      resource_type: 'license',
      status: 'active',
      name: 'WA Contractor License',
      attributes: { license_type: 'GC', license_number: 'WA-12345' },
      verified: true,
      external_refs: {},
      effective_until: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'doc-2',
      resource_type: 'insurance',
      status: 'active',
      name: 'COI 2026',
      attributes: { doc_type: 'general_liability' },
      verified: false,
      external_refs: {},
      effective_until: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'doc-3',
      resource_type: 'compliance_doc',
      status: 'pending_verification',
      name: 'OSHA 30',
      attributes: { doc_type: 'osha_30' },
      verified: false,
      external_refs: {},
    },
  ],
  media: [
    {
      id: 'm-1',
      resource_id: 'doc-1',
      attached_to: 'license',
      media_type: 'document',
      mime_type: 'application/pdf',
      file_name: 'license.pdf',
      url: 'https://r2.test/license.pdf',
      sort_order: 0,
      is_primary: true,
      visibility: 'private',
      uploaded_at: '2026-04-30T00:00:00Z',
      uploaded_by: 'sam',
    },
  ],
  property_assets: [],
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ComplianceDocsSection', () => {
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

  it('renders without crashing + lists 3 docs', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <ComplianceDocsSection />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByText('WA Contractor License')).toBeTruthy()
    );
    expect(screen.getByText('OSHA 30')).toBeTruthy();
    expect(screen.getByText('COI 2026')).toBeTruthy();
  });

  it('classifies status: verified, expired, pending', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <ComplianceDocsSection />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Status: Verified')).toBeTruthy();
      expect(screen.getByLabelText('Status: Expired')).toBeTruthy();
      expect(screen.getByLabelText('Status: Pending review')).toBeTruthy();
    });
  });

  it('renders download link when media is attached', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <ComplianceDocsSection />
      </AuthProvider>
    );
    await waitFor(() => {
      const link = screen.getByText('license.pdf');
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('https://r2.test/license.pdf');
    });
  });

  it('shows empty state when no docs', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { ...ENVELOPE, resources: [] }));
    render(
      <AuthProvider initialSession={SESSION}>
        <ComplianceDocsSection />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByText(/No documents on file/i)).toBeTruthy()
    );
  });

  it('honors resourceTypes filter', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <ComplianceDocsSection resourceTypes={['license']} />
      </AuthProvider>
    );
    await waitFor(() =>
      expect(screen.getByText('WA Contractor License')).toBeTruthy()
    );
    expect(screen.queryByText('OSHA 30')).toBeNull();
    expect(screen.queryByText('COI 2026')).toBeNull();
  });

  it('hides archive when readonly', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <ComplianceDocsSection readonly />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('WA Contractor License')).toBeTruthy());
    expect(screen.queryByLabelText(/Archive WA Contractor License/i)).toBeNull();
  });
});
