// @samjonaidi-ship-it/universal-auth | src/react/useIdentity.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// Convenience facade over the v1.5.0 PCP contract.
// Implements PERSONA_PCP_DESIGN.md §7 (single hook, three layers) + SDK_SPEC §5.4.2.
//
// Reads /identity/v1/profile in one call (server returns the v1.5.0 shape:
// addresses[], resources[], media[], property_assets[]). Mutation methods wrap
// the matching CT BFF endpoints documented in SDK_SPEC §5.4.2.
//
// State is held in a module-level store (mirrors src/profile/profile-store.ts
// pattern) so multiple components that call useIdentity() share the same data
// — required when, e.g., <PropertySection> renders nested
// <PropertyAssetsList> children that also need the asset list.
//
// This hook is purposely separate from useProfile(): useProfile remains
// bound to the legacy UniversalProfile contract in src/types/profile.ts;
// useIdentity owns the extended PCP shape so we don't breaking-change a
// production hook used by existing apps.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { get, post, put, del } from '../core/client.js';
import { useAuth } from './useAuth.js';
import { usePermissionGrants } from './usePermissionGrants.js';
import { useEntitlements } from './useEntitlements.js';
import type {
  Address,
  AddressType,
  ProfileResource,
  ResourceType,
  ProfileMedia,
  MediaAttachment,
  PropertyAsset,
} from '../types/pcp.js';
import type { UniversalProfile } from '../types/profile.js';

// Server response shape for GET /identity/v1/profile (extended v1.5.0).
// Mirrors PERSONA_PCP_DESIGN.md §3 + SDK_SPEC §5.4.1.
interface ProfileEnvelope extends UniversalProfile {
  addresses?: Address[];
  resources?: ProfileResource[];
  media?: ProfileMedia[];
  property_assets?: PropertyAsset[];
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  raw_attributes?: Record<string, unknown>;
}

export type IdentityState = 'loading' | 'ready' | 'saving' | 'error';

interface IdentityStoreSnapshot {
  profile: UniversalProfile | null;
  addresses: readonly Address[];
  resources: readonly ProfileResource[];
  media: readonly ProfileMedia[];
  propertyAssets: readonly PropertyAsset[];
  state: IdentityState;
  errorMessage: string | null;
}

// Empty-array singletons keep snapshot equality stable across renders so
// useSyncExternalStore doesn't trigger spurious re-renders.
const EMPTY_ADDRESSES: readonly Address[] = [];
const EMPTY_RESOURCES: readonly ProfileResource[] = [];
const EMPTY_MEDIA: readonly ProfileMedia[] = [];
const EMPTY_PROPERTY_ASSETS: readonly PropertyAsset[] = [];

let snapshot: IdentityStoreSnapshot = {
  profile: null,
  addresses: EMPTY_ADDRESSES,
  resources: EMPTY_RESOURCES,
  media: EMPTY_MEDIA,
  propertyAssets: EMPTY_PROPERTY_ASSETS,
  state: 'loading',
  errorMessage: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // listener bugs can't crash the store
    }
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): IdentityStoreSnapshot {
  return snapshot;
}

function applyEnvelope(env: ProfileEnvelope): void {
  snapshot = {
    profile: env,
    addresses: env.addresses ?? EMPTY_ADDRESSES,
    resources: env.resources ?? EMPTY_RESOURCES,
    media: env.media ?? EMPTY_MEDIA,
    propertyAssets: env.property_assets ?? EMPTY_PROPERTY_ASSETS,
    state: 'ready',
    errorMessage: null,
  };
  notify();
}

function setState(next: IdentityState, errorMessage: string | null = null): void {
  snapshot = { ...snapshot, state: next, errorMessage };
  notify();
}

let inFlightRefresh: Promise<void> | null = null;

async function refreshSnapshot(): Promise<void> {
  if (inFlightRefresh !== null) return inFlightRefresh;
  inFlightRefresh = (async () => {
    setState('loading');
    try {
      const { data } = await get<ProfileEnvelope>('/identity/v1/profile');
      applyEnvelope(data);
    } catch (err) {
      setState('error', err instanceof Error ? err.message : String(err));
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

/** Test-only reset hook — mirrors __resetProfileStoreForTests pattern. */
export function __resetIdentityStoreForTests(): void {
  snapshot = {
    profile: null,
    addresses: EMPTY_ADDRESSES,
    resources: EMPTY_RESOURCES,
    media: EMPTY_MEDIA,
    propertyAssets: EMPTY_PROPERTY_ASSETS,
    state: 'loading',
    errorMessage: null,
  };
  inFlightRefresh = null;
  listeners.clear();
}

export interface UseIdentityReturn {
  // Layer 1 — Profile core
  profile: UniversalProfile | null;
  state: IdentityState;
  errorMessage: string | null;

  // Layer 1 — extended (v1.5.0)
  addresses: readonly Address[];
  resources: readonly ProfileResource[];
  media: readonly ProfileMedia[];
  propertyAssets: readonly PropertyAsset[];

  // Layer 3 — Permissions
  hasCapability: (key: string) => boolean;

  // Mutations — addresses
  addAddress: (a: Omit<Address, 'id'>) => Promise<Address>;
  updateAddress: (id: string, patch: Partial<Address>) => Promise<Address>;
  archiveAddress: (id: string) => Promise<void>;

  // Mutations — resources
  addResource: (r: Omit<ProfileResource, 'id'>) => Promise<ProfileResource>;
  updateResource: (
    id: string,
    patch: Partial<ProfileResource>
  ) => Promise<ProfileResource>;
  archiveResource: (id: string) => Promise<void>;

  // Mutations — media
  uploadMedia: (
    file: Blob | File,
    opts: {
      attached_to: MediaAttachment;
      resource_id?: string;
      property_asset_id?: string;
      caption?: string;
    }
  ) => Promise<ProfileMedia>;
  deleteMedia: (id: string) => Promise<void>;

  // Mutations — property assets (homeowner persona)
  addPropertyAsset: (
    propertyId: string,
    a: Omit<PropertyAsset, 'id' | 'property_id'>
  ) => Promise<PropertyAsset>;
  updatePropertyAsset: (
    id: string,
    patch: Partial<PropertyAsset>
  ) => Promise<PropertyAsset>;
  archivePropertyAsset: (id: string) => Promise<void>;
  propertyAssetsForProperty: (propertyId: string) => readonly PropertyAsset[];

  // Helpers
  refresh: () => Promise<void>;
  resourcesOfType: (t: ResourceType) => readonly ProfileResource[];
  addressesOfType: (t: AddressType) => readonly Address[];
  mediaForResource: (resourceId: string) => readonly ProfileMedia[];
  mediaForPropertyAsset: (assetId: string) => readonly ProfileMedia[];

  // Re-exposed permission grants facade (Layer 3a) so apps don't need
  // a second hook for the common "show what the user can do" surface.
  recordPermissionGrant: ReturnType<typeof usePermissionGrants>['record'];
}

export function useIdentity(): UseIdentityReturn {
  const { identity } = useAuth();
  const { hasFeature } = useEntitlements();
  const { record: recordPermissionGrant } = usePermissionGrants();

  // Subscribe to module-level store — guarantees every component that calls
  // useIdentity() sees the same snapshot (fixes the per-instance bug found in
  // PropertySection ↔ PropertyAssetsList nested rendering).
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Auto-hydrate once per identity. Multiple useIdentity() callers share the
  // same in-flight refresh via the inFlightRefresh promise dedup.
  // useState carries the last identity_id we triggered for so we don't
  // re-fetch on every render — only when identity changes.
  const [lastIdentityId, setLastIdentityId] = useState<string | null>(null);
  useEffect(() => {
    if (identity === null) return;
    if (identity.identity_id === lastIdentityId && snap.profile !== null) return;
    setLastIdentityId(identity.identity_id);
    void refreshSnapshot();
  }, [identity, lastIdentityId, snap.profile]);

  // ── Address mutations ──────────────────────────────────────────────────

  const addAddress = useCallback(
    async (a: Omit<Address, 'id'>): Promise<Address> => {
      const { data } = await post<Address>(
        '/identity/v1/profile/addresses',
        a
      );
      snapshot = {
        ...snapshot,
        addresses: [...snapshot.addresses, data],
      };
      notify();
      return data;
    },
    []
  );

  const updateAddress = useCallback(
    async (id: string, patch: Partial<Address>): Promise<Address> => {
      const { data } = await put<Address>(
        `/identity/v1/profile/addresses/${encodeURIComponent(id)}`,
        patch
      );
      snapshot = {
        ...snapshot,
        addresses: snapshot.addresses.map((x) => (x.id === id ? data : x)),
      };
      notify();
      return data;
    },
    []
  );

  const archiveAddress = useCallback(async (id: string): Promise<void> => {
    await del(`/identity/v1/profile/addresses/${encodeURIComponent(id)}`);
    snapshot = {
      ...snapshot,
      addresses: snapshot.addresses.filter((x) => x.id !== id),
    };
    notify();
  }, []);

  // ── Resource mutations ─────────────────────────────────────────────────

  const addResource = useCallback(
    async (r: Omit<ProfileResource, 'id'>): Promise<ProfileResource> => {
      const { data } = await post<ProfileResource>(
        '/identity/v1/profile/resources',
        r
      );
      snapshot = {
        ...snapshot,
        resources: [...snapshot.resources, data],
      };
      notify();
      return data;
    },
    []
  );

  const updateResource = useCallback(
    async (
      id: string,
      patch: Partial<ProfileResource>
    ): Promise<ProfileResource> => {
      const { data } = await put<ProfileResource>(
        `/identity/v1/profile/resources/${encodeURIComponent(id)}`,
        patch
      );
      snapshot = {
        ...snapshot,
        resources: snapshot.resources.map((x) => (x.id === id ? data : x)),
      };
      notify();
      return data;
    },
    []
  );

  const archiveResource = useCallback(async (id: string): Promise<void> => {
    await del(`/identity/v1/profile/resources/${encodeURIComponent(id)}`);
    snapshot = {
      ...snapshot,
      resources: snapshot.resources.filter((x) => x.id !== id),
    };
    notify();
  }, []);

  // ── Media mutations ────────────────────────────────────────────────────

  const uploadMedia = useCallback(
    async (
      file: Blob | File,
      opts: {
        attached_to: MediaAttachment;
        resource_id?: string;
        property_asset_id?: string;
        caption?: string;
      }
    ): Promise<ProfileMedia> => {
      const form = new FormData();
      form.append('file', file);
      form.append('attached_to', opts.attached_to);
      if (opts.resource_id !== undefined)
        form.append('resource_id', opts.resource_id);
      if (opts.property_asset_id !== undefined)
        form.append('property_asset_id', opts.property_asset_id);
      if (opts.caption !== undefined) form.append('caption', opts.caption);
      const { data } = await post<ProfileMedia>(
        '/identity/v1/profile/media',
        form
      );
      snapshot = { ...snapshot, media: [...snapshot.media, data] };
      notify();
      return data;
    },
    []
  );

  const deleteMedia = useCallback(async (id: string): Promise<void> => {
    await del(`/identity/v1/profile/media/${encodeURIComponent(id)}`);
    snapshot = {
      ...snapshot,
      media: snapshot.media.filter((x) => x.id !== id),
    };
    notify();
  }, []);

  // ── Property-asset mutations ──────────────────────────────────────────

  const addPropertyAsset = useCallback(
    async (
      propertyId: string,
      a: Omit<PropertyAsset, 'id' | 'property_id'>
    ): Promise<PropertyAsset> => {
      const { data } = await post<PropertyAsset>(
        `/identity/v1/profile/properties/${encodeURIComponent(propertyId)}/assets`,
        a
      );
      snapshot = {
        ...snapshot,
        propertyAssets: [...snapshot.propertyAssets, data],
      };
      notify();
      return data;
    },
    []
  );

  const updatePropertyAsset = useCallback(
    async (
      id: string,
      patch: Partial<PropertyAsset>
    ): Promise<PropertyAsset> => {
      const { data } = await put<PropertyAsset>(
        `/identity/v1/profile/property-assets/${encodeURIComponent(id)}`,
        patch
      );
      snapshot = {
        ...snapshot,
        propertyAssets: snapshot.propertyAssets.map((x) =>
          x.id === id ? data : x
        ),
      };
      notify();
      return data;
    },
    []
  );

  const archivePropertyAsset = useCallback(
    async (id: string): Promise<void> => {
      await del(`/identity/v1/profile/property-assets/${encodeURIComponent(id)}`);
      snapshot = {
        ...snapshot,
        propertyAssets: snapshot.propertyAssets.filter((x) => x.id !== id),
      };
      notify();
    },
    []
  );

  // ── Helpers ────────────────────────────────────────────────────────────

  const resourcesOfType = useCallback(
    (t: ResourceType): readonly ProfileResource[] =>
      snap.resources.filter(
        (r) => r.resource_type === t && r.status !== 'archived'
      ),
    [snap.resources]
  );

  const addressesOfType = useCallback(
    (t: AddressType): readonly Address[] =>
      snap.addresses.filter((a) => a.address_type === t),
    [snap.addresses]
  );

  const mediaForResource = useCallback(
    (resourceId: string): readonly ProfileMedia[] =>
      snap.media.filter((m) => m.resource_id === resourceId),
    [snap.media]
  );

  const mediaForPropertyAsset = useCallback(
    (assetId: string): readonly ProfileMedia[] =>
      snap.media.filter((m) => m.property_asset_id === assetId),
    [snap.media]
  );

  const propertyAssetsForProperty = useCallback(
    (propertyId: string): readonly PropertyAsset[] =>
      snap.propertyAssets.filter(
        (a) => a.property_id === propertyId && a.status !== 'archived'
      ),
    [snap.propertyAssets]
  );

  const refresh = useCallback(async (): Promise<void> => {
    await refreshSnapshot();
  }, []);

  return {
    profile: snap.profile,
    state: snap.state,
    errorMessage: snap.errorMessage,
    addresses: snap.addresses,
    resources: snap.resources,
    media: snap.media,
    propertyAssets: snap.propertyAssets,
    hasCapability: hasFeature,
    addAddress,
    updateAddress,
    archiveAddress,
    addResource,
    updateResource,
    archiveResource,
    uploadMedia,
    deleteMedia,
    addPropertyAsset,
    updatePropertyAsset,
    archivePropertyAsset,
    propertyAssetsForProperty,
    refresh,
    resourcesOfType,
    addressesOfType,
    mediaForResource,
    mediaForPropertyAsset,
    recordPermissionGrant,
  };
}
