// @samjonaidi-ship-it/universal-auth | src/types/pcp.ts | v1.0.0-rc.4 | 2026-04-30 | BB
// PCP (Profile · Consent · Permissions) v1.5.0 supporting types.
// Implements PERSONA_PCP_DESIGN.md §3 + SDK_SPEC §5.4.1 (Address, ProfileResource,
// ProfileMedia, PropertyAsset). Kept in a separate module from
// types/profile.ts so the legacy UniversalProfile contract used by
// useProfile() is not breaking-changed.

export type AddressType =
  | 'residence'
  | 'mailing'
  | 'billing'
  | 'business'
  | 'property'
  | 'jobsite_pref';

export interface Address {
  id: string;
  address_type: AddressType;
  line1: string;
  line2?: string;
  city: string;
  state_region: string;
  postal_code: string;
  country: string; // ISO-3166 alpha-2; default 'US'
  lat?: number;
  lng?: number;
  is_primary: boolean;
  notes?: string;
}

export type ResourceType =
  | 'vehicle'
  | 'gear'
  | 'subscription'
  | 'property'
  | 'compliance_doc'
  | 'license'
  | 'insurance';

export type ResourceStatus =
  | 'active'
  | 'archived'
  | 'expired'
  | 'pending_verification'
  | 'rejected';

export interface ProfileResource {
  id: string;
  resource_type: ResourceType;
  status: ResourceStatus;
  name?: string;
  description?: string;
  attributes: Record<string, unknown>;
  verified: boolean;
  verified_by?: string;
  verified_at?: string;
  external_refs: Record<string, unknown>;
  effective_from?: string;
  effective_until?: string;
}

export type MediaAttachment =
  | 'avatar'
  | 'vehicle'
  | 'tool'
  | 'gear'
  | 'property'
  | 'compliance_doc'
  | 'license'
  | 'insurance'
  | 'signature';

export type MediaKind = 'image' | 'video' | 'document' | 'audio';

export type MediaVisibility = 'private' | 'team' | 'party' | 'public';

export interface ProfileMedia {
  id: string;
  resource_id?: string;
  property_asset_id?: string;
  attached_to: MediaAttachment;
  media_type: MediaKind;
  mime_type: string;
  file_name?: string;
  size_bytes?: number;
  url: string;
  thumb_url?: string;
  sort_order: number;
  is_primary: boolean;
  caption?: string;
  visibility: MediaVisibility;
  uploaded_at: string;
  uploaded_by: string;
}

export type PropertyAssetType =
  | 'hvac'
  | 'roof'
  | 'water_heater'
  | 'plumbing'
  | 'electrical'
  | 'foundation'
  | 'appliance'
  | 'smart_device'
  | 'service_contract'
  | 'warranty'
  | 'inspection_report'
  | 'other';

export type PropertyAssetStatus =
  | 'active'
  | 'archived'
  | 'expired'
  | 'needs_attention';

export interface PropertyAsset {
  id: string;
  property_id: string;
  asset_type: PropertyAssetType;
  status: PropertyAssetStatus;
  name?: string;
  description?: string;
  attributes: Record<string, unknown>;
  install_date?: string;
  warranty_until?: string;
  next_service_at?: string;
  installed_by_party_id?: string;
  serviced_by_party_id?: string;
}
