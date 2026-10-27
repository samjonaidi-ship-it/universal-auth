// @samjonaidi-ship-it/universal-auth | test/unit/react/useIdentity.test.tsx | v1.0.0-rc.5 | 2026-10-26 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, renderHook, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '../../../src/react/AuthProvider.js';
import { useIdentity, __resetIdentityStoreForTests } from '../../../src/react/useIdentity.js';
import type { Session } from '../../../src/types/api.js';
import {
  configureClient,
  __resetClientForTests,
} from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import { __resetProfileStoreForTests } from '../../../src/profile/profile-store.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  primary_persona: 'homeowner',
  personas: [
    {
      persona_type: 'homeowner',
      party_id: 'p',
      party_name: 'BB',
      role_in_party: 'r',
      ct_role: null,
      plan_slug: 'home_basic',
      subscription_status: 'active',
      landing_route: '/home',
    },
  ],
  aggregate: { features: ['bb_home:read'], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

const PROFILE_ENVELOPE = {
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
  addresses: [
    {
      id: 'addr-1',
      address_type: 'residence',
      line1: '123 Main',
      city: 'Bainbridge',
      state_region: 'WA',
      postal_code: '98110',
      country: 'US',
      is_primary: true,
    },
  ],
  resources: [
    {
      id: 'res-1',
      resource_type: 'property',
      status: 'active',
      name: 'Main house',
      attributes: {},
      verified: false,
      external_refs: {},
    },
    {
      id: 'res-2',
      resource_type: 'vehicle',
      status: 'active',
      name: 'F150',
      attributes: { make: 'Ford' },
      verified: false,
      external_refs: {},
    },
  ],
  media: [
    {
      id: 'm-1',
      resource_id: 'res-2',
      attached_to: 'vehicle',
      media_type: 'image',
      mime_type: 'image/jpeg',
      url: 'https://r2.test/m1.jpg',
      sort_order: 0,
      is_primary: false,
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

function Probe(): ReactNode {
  const id = useIdentity();
  return (
    <div>
      <span data-testid="state">{id.state}</span>
      <span data-testid="addresses">{id.addresses.length}</span>
      <span data-testid="resources">{id.resources.length}</span>
      <span data-testid="media">{id.media.length}</span>
      <span data-testid="vehicles">{id.resourcesOfType('vehicle').length}</span>
      <span data-testid="properties">{id.resourcesOfType('property').length}</span>
      <span data-testid="cap">{id.hasCapability('bb_home:read') ? 'yes' : 'no'}</span>
      <button
        type="button"
        onClick={() => {
          void id.archiveResource('res-2');
        }}
      >
        archive
      </button>
    </div>
  );
}

describe('useIdentity', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetProfileStoreForTests();
    __resetIdentityStoreForTests();
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

  it('fetches profile + parses extended PCP shape', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, PROFILE_ENVELOPE));
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('ready'));
    expect(screen.getByTestId('addresses').textContent).toBe('1');
    expect(screen.getByTestId('resources').textContent).toBe('2');
    expect(screen.getByTestId('vehicles').textContent).toBe('1');
    expect(screen.getByTestId('properties').textContent).toBe('1');
    expect(screen.getByTestId('media').textContent).toBe('1');
    expect(screen.getByTestId('cap').textContent).toBe('yes');
  });

  it('reports error state when fetch fails', async () => {
    fetchSpy.mockResolvedValue(jsonResp(500, { error: { code: 'X', message: 'boom' } }));
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('error'));
  });

  it('archiveResource removes resource locally', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResp(200, PROFILE_ENVELOPE))
      .mockResolvedValueOnce(jsonResp(204, {}));
    render(
      <AuthProvider initialSession={SESSION}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('vehicles').textContent).toBe('1'));
    await act(async () => {
      screen.getByText('archive').click();
    });
    await waitFor(() => expect(screen.getByTestId('vehicles').textContent).toBe('0'));
  });

  async function readyIdentity() {
    fetchSpy.mockResolvedValue(jsonResp(200, PROFILE_ENVELOPE));
    const hook = renderHook(() => useIdentity(), {
      wrapper: ({ children }) => <AuthProvider initialSession={SESSION}>{children}</AuthProvider>,
    });
    await waitFor(() => expect(hook.result.current.state).toBe('ready'));
    return hook;
  }

  it('adds, updates and archives an address without replacing its neighbours', async () => {
    const { result } = await readyIdentity();
    const added = { ...PROFILE_ENVELOPE.addresses[0], id: 'addr /2', address_type: 'residence' as const };
    fetchSpy.mockImplementation(async () => jsonResp(200, added));
    await act(async () => {
      expect(await result.current.addAddress(added)).toEqual(added);
    });
    expect(result.current.addresses).toHaveLength(2);
    const updated = { ...added, city: 'Los Gatos' };
    fetchSpy.mockImplementation(async () => jsonResp(200, updated));
    await act(async () => {
      expect(await result.current.updateAddress(added.id, { city: updated.city })).toEqual(updated);
    });
    expect(result.current.addresses).toEqual([PROFILE_ENVELOPE.addresses[0], updated]);
    expect(result.current.addressesOfType('residence')).toHaveLength(2);
    expect(result.current.addressesOfType('mailing')).toEqual([]);
    await act(async () => result.current.archiveAddress(added.id));
    expect(result.current.addresses).toEqual(PROFILE_ENVELOPE.addresses);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain('/addresses/addr%20%2F2');
  });

  it('updates resources by ID and excludes archived or other resource types', async () => {
    const { result } = await readyIdentity();
    const added = { ...PROFILE_ENVELOPE.resources[1], id: 'res /3', resource_type: 'vehicle' as const, status: 'active' as const };
    fetchSpy.mockImplementation(async () => jsonResp(200, added));
    await act(async () => {
      expect(await result.current.addResource(added)).toEqual(added);
    });
    expect(result.current.resourcesOfType('vehicle')).toHaveLength(2);
    const archived = { ...added, status: 'archived' as const };
    fetchSpy.mockImplementation(async () => jsonResp(200, archived));
    await act(async () => {
      expect(await result.current.updateResource(added.id, { status: 'archived' })).toEqual(archived);
    });
    expect(result.current.resources).toEqual([...PROFILE_ENVELOPE.resources, archived]);
    expect(result.current.resourcesOfType('vehicle')).toEqual([PROFILE_ENVELOPE.resources[1]]);
    await act(async () => result.current.archiveResource(added.id));
    expect(result.current.resources).toEqual(PROFILE_ENVELOPE.resources);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain('/resources/res%20%2F3');
  });

  it('serializes all optional media fields, filters attachments and deletes only the selected item', async () => {
    const { result } = await readyIdentity();
    const added = { ...PROFILE_ENVELOPE.media[0], id: 'media /2', resource_id: 'other', property_asset_id: 'asset-1' };
    fetchSpy.mockImplementation(async () => jsonResp(200, added));
    await act(async () => {
      expect(await result.current.uploadMedia(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }), {
        attached_to: 'vehicle', resource_id: 'other', property_asset_id: 'asset-1', caption: '',
      })).toEqual(added);
    });
    const options = fetchSpy.mock.calls.at(-1)?.[1] as RequestInit;
    const form = options.body as FormData;
    expect(form.get('attached_to')).toBe('vehicle');
    expect(form.get('resource_id')).toBe('other');
    expect(form.get('property_asset_id')).toBe('asset-1');
    expect(form.get('caption')).toBe('');
    expect(form.get('file')).toBeInstanceOf(Blob);
    expect(result.current.mediaForResource('res-2')).toEqual(PROFILE_ENVELOPE.media);
    expect(result.current.mediaForPropertyAsset('asset-1')).toEqual([added]);
    await act(async () => result.current.deleteMedia(added.id));
    expect(result.current.media).toEqual(PROFILE_ENVELOPE.media);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain('/media/media%20%2F2');
  });

  it('does not invent optional upload fields when they are absent', async () => {
    const { result } = await readyIdentity();
    fetchSpy.mockResolvedValue(jsonResp(200, PROFILE_ENVELOPE.media[0]));
    await act(async () => {
      await result.current.uploadMedia(new Blob(['image']), { attached_to: 'vehicle' });
    });
    const form = (fetchSpy.mock.calls.at(-1)?.[1] as RequestInit).body as FormData;
    expect(form.has('resource_id')).toBe(false);
    expect(form.has('property_asset_id')).toBe(false);
    expect(form.has('caption')).toBe(false);
  });

  it('isolates property-asset mutations and excludes archived assets from property views', async () => {
    const { result } = await readyIdentity();
    const input = { asset_type: 'hvac' as const, status: 'active' as const, attributes: {}, name: 'Heat pump' };
    const first = { ...input, id: 'asset /1', property_id: 'property /1' };
    fetchSpy.mockImplementation(async () => jsonResp(200, first));
    await act(async () => {
      expect(await result.current.addPropertyAsset(first.property_id, input)).toEqual(first);
    });
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain('/properties/property%20%2F1/assets');
    const second = { ...first, id: 'asset-2', property_id: 'other' };
    fetchSpy.mockImplementation(async () => jsonResp(200, second));
    await act(async () => { await result.current.addPropertyAsset(second.property_id, input); });
    expect(result.current.propertyAssetsForProperty(first.property_id)).toEqual([first]);
    const archived = { ...first, status: 'archived' as const };
    fetchSpy.mockImplementation(async () => jsonResp(200, archived));
    await act(async () => {
      expect(await result.current.updatePropertyAsset(first.id, { status: 'archived' })).toEqual(archived);
    });
    expect(result.current.propertyAssets).toEqual([archived, second]);
    expect(result.current.propertyAssetsForProperty(first.property_id)).toEqual([]);
    expect(result.current.propertyAssetsForProperty(second.property_id)).toEqual([second]);
    await act(async () => result.current.archivePropertyAsset(first.id));
    expect(result.current.propertyAssets).toEqual([second]);
    expect(String(fetchSpy.mock.calls.at(-1)?.[0])).toContain('/property-assets/asset%20%2F1');
  });

  it('deduplicates overlapping refresh calls', async () => {
    const { result } = await readyIdentity();
    fetchSpy.mockImplementation(async () => jsonResp(200, PROFILE_ENVELOPE));
    const before = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/identity/v1/profile')).length;
    await act(async () => { await Promise.all([result.current.refresh(), result.current.refresh()]); });
    const after = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/identity/v1/profile')).length;
    expect(after - before).toBe(1);
    expect(result.current.state).toBe('ready');
  });

  it('preserves every collection when a mutation is rejected', async () => {
    const { result } = await readyIdentity();
    fetchSpy.mockResolvedValue(jsonResp(400, { error: { code: 'INVALID', message: 'invalid address' } }));
    await act(async () => {
      await expect(result.current.updateAddress('addr-1', { city: '' })).rejects.toBeInstanceOf(Error);
    });
    expect(result.current.addresses).toEqual(PROFILE_ENVELOPE.addresses);
    expect(result.current.resources).toEqual(PROFILE_ENVELOPE.resources);
    expect(result.current.media).toEqual(PROFILE_ENVELOPE.media);
  });

  it('refresh replaces an old envelope and defaults omitted collections to empty arrays', async () => {
    const { result } = await readyIdentity();
    const { addresses, resources, media, property_assets, ...core } = PROFILE_ENVELOPE;
    fetchSpy.mockResolvedValue(jsonResp(200, { ...core, display_name: 'Updated' }));
    await act(async () => result.current.refresh());
    expect(result.current.profile?.display_name).toBe('Updated');
    expect(result.current.addresses).toEqual([]);
    expect(result.current.resources).toEqual([]);
    expect(result.current.media).toEqual([]);
    expect(result.current.propertyAssets).toEqual([]);
  });
});
