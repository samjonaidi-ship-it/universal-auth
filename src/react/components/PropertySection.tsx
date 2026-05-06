// @samjonaidi-ship-it/universal-auth | src/react/components/PropertySection.tsx | v1.1.0 | 2026-05-06 | BB
// Homeowner persona property list — address + type/year/sqft + photos +
// nested property_assets (HVAC, roof, etc., per property) with their own photos.
// Implements PERSONA_PCP_DESIGN.md §3.3 (multi-property) +
// SDK_SPEC §5.4.8 (property is a SCOPE ANCHOR; assets hang off each property).
//
// v1.1.0 (P1-A): + className/style

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useIdentity } from '../useIdentity.js';
import { MediaGallery } from './MediaGallery.js';
import { AddressInput } from './AddressInput.js';
import type {
  ProfileResource,
  PropertyAsset,
  PropertyAssetType,
  Address,
} from '../../types/pcp.js';

export interface PropertySectionProps {
  heading?: string;
  readonly?: boolean;
  /** Optional class for the root <section>. */
  className?: string;
  /** Inline style for the root <section>. */
  style?: CSSProperties;
}

interface PropertyAttrs {
  property_type?: string;
  year_built?: string;
  sqft?: string;
}

function readAttrs(r: ProfileResource): PropertyAttrs {
  const a = r.attributes;
  const out: PropertyAttrs = {};
  if (typeof a.property_type === 'string') out.property_type = a.property_type;
  if (typeof a.year_built === 'string' || typeof a.year_built === 'number') {
    out.year_built = String(a.year_built);
  }
  if (typeof a.sqft === 'string' || typeof a.sqft === 'number') {
    out.sqft = String(a.sqft);
  }
  return out;
}

function readAddressFromAttrs(a: ProfileResource['attributes']): Partial<Address> {
  const out: Partial<Address> = {};
  if (typeof a.line1 === 'string') out.line1 = a.line1;
  if (typeof a.city === 'string') out.city = a.city;
  if (typeof a.state_region === 'string') out.state_region = a.state_region;
  if (typeof a.postal_code === 'string') out.postal_code = a.postal_code;
  if (typeof a.country === 'string') out.country = a.country;
  return out;
}

export function PropertySection({
  heading = 'Properties',
  readonly = false,
  className,
  style,
}: PropertySectionProps): ReactNode {
  const {
    resourcesOfType,
    addResource,
    archiveResource,
    mediaForResource,
    uploadMedia,
    deleteMedia,
  } = useIdentity();

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const properties = resourcesOfType('property');

  async function handleAddProperty(
    address: Address,
    attrs: PropertyAttrs,
    name: string
  ): Promise<void> {
    setError(null);
    try {
      await addResource({
        resource_type: 'property',
        status: 'active',
        name: name.length > 0 ? name : address.line1,
        attributes: {
          ...attrs,
          line1: address.line1,
          ...(address.line2 !== undefined ? { line2: address.line2 } : {}),
          city: address.city,
          state_region: address.state_region,
          postal_code: address.postal_code,
          country: address.country,
        },
        verified: false,
        external_refs: {},
      });
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add property');
    }
  }

  return (
    <section
      className={className ?? 'bb-auth-resource-section'}
      style={style}
      aria-label={heading}
    >
      <header className="bb-auth-resource-section-header">
        <h3 className="bb-auth-heading">{heading}</h3>
        {!readonly ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-secondary"
            onClick={() => setAdding(true)}
            disabled={adding}
          >
            Add property
          </button>
        ) : null}
      </header>

      {properties.length === 0 && !adding ? (
        <p className="bb-auth-description">No properties on file.</p>
      ) : null}

      <ul role="list" className="bb-auth-resource-list">
        {properties.map((p) => (
          <li key={p.id} className="bb-auth-resource-card">
            <PropertyCard
              property={p}
              attrs={readAttrs(p)}
              media={mediaForResource(p.id)}
              readonly={readonly}
              onArchive={() => void archiveResource(p.id)}
              onUploadMedia={(file) =>
                uploadMedia(file, {
                  attached_to: 'property',
                  resource_id: p.id,
                }).then(() => undefined)
              }
              onDeleteMedia={(id) => deleteMedia(id)}
            />
          </li>
        ))}
      </ul>

      {adding ? (
        <PropertyAddForm
          onCancel={() => setAdding(false)}
          onSubmit={(addr, attrs, name) =>
            void handleAddProperty(addr, attrs, name)
          }
        />
      ) : null}

      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

interface PropertyCardProps {
  property: ProfileResource;
  attrs: PropertyAttrs;
  media: ReturnType<ReturnType<typeof useIdentity>['mediaForResource']>;
  readonly: boolean;
  onArchive: () => void;
  onUploadMedia: (file: File) => Promise<void>;
  onDeleteMedia: (id: string) => Promise<void>;
}

function PropertyCard({
  property,
  attrs,
  media,
  readonly,
  onArchive,
  onUploadMedia,
  onDeleteMedia,
}: PropertyCardProps): ReactNode {
  const address = readAddressFromAttrs(property.attributes);

  return (
    <article>
      <header className="bb-auth-resource-card-header">
        <h4>{property.name ?? address.line1 ?? 'Property'}</h4>
        {!readonly ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={onArchive}
            aria-label={`Archive ${property.name ?? 'property'}`}
          >
            Archive
          </button>
        ) : null}
      </header>

      {address.line1 !== undefined ? (
        <AddressInput
          addressType="property"
          address={address as Partial<Address>}
          onChange={() => undefined}
          readonly
        />
      ) : null}

      <dl className="bb-auth-resource-attrs">
        {attrs.property_type !== undefined ? (
          <>
            <dt>Type</dt>
            <dd>{attrs.property_type}</dd>
          </>
        ) : null}
        {attrs.year_built !== undefined ? (
          <>
            <dt>Year built</dt>
            <dd>{attrs.year_built}</dd>
          </>
        ) : null}
        {attrs.sqft !== undefined ? (
          <>
            <dt>Sq ft</dt>
            <dd>{attrs.sqft}</dd>
          </>
        ) : null}
      </dl>

      <MediaGallery
        media={media}
        onUpload={onUploadMedia}
        onDelete={onDeleteMedia}
        readonly={readonly}
        label={`Photos for ${property.name ?? 'property'}`}
      />

      <PropertyAssetsList propertyId={property.id} propertyName={property.name ?? address.line1 ?? 'property'} readonly={readonly} />
    </article>
  );
}

interface PropertyAssetsListProps {
  propertyId: string;
  propertyName: string;
  readonly: boolean;
}

function PropertyAssetsList({
  propertyId,
  propertyName,
  readonly,
}: PropertyAssetsListProps): ReactNode {
  const {
    propertyAssetsForProperty,
    addPropertyAsset,
    archivePropertyAsset,
    mediaForPropertyAsset,
    uploadMedia,
    deleteMedia,
  } = useIdentity();

  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assets = propertyAssetsForProperty(propertyId);

  async function handleAdd(
    type: PropertyAssetType,
    name: string
  ): Promise<void> {
    setError(null);
    try {
      await addPropertyAsset(propertyId, {
        asset_type: type,
        status: 'active',
        name,
        attributes: {},
      });
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add asset');
    }
  }

  return (
    <section className="bb-auth-property-assets" aria-label={`Assets for ${propertyName}`}>
      <header className="bb-auth-resource-section-header">
        <h5>Property assets</h5>
        {!readonly ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={() => setAdding(true)}
            disabled={adding}
          >
            Add asset
          </button>
        ) : null}
      </header>
      {assets.length === 0 && !adding ? (
        <p className="bb-auth-description">No assets recorded.</p>
      ) : null}
      <ul role="list" className="bb-auth-property-assets-list">
        {assets.map((asset) => (
          <li key={asset.id} className="bb-auth-property-asset-card">
            <article>
              <header className="bb-auth-resource-card-header">
                <h6>{asset.name ?? asset.asset_type}</h6>
                {!readonly ? (
                  <button
                    type="button"
                    className="bb-auth-button bb-auth-button-link"
                    onClick={() => void archivePropertyAsset(asset.id)}
                    aria-label={`Archive ${asset.name ?? asset.asset_type}`}
                  >
                    Archive
                  </button>
                ) : null}
              </header>
              <dl className="bb-auth-resource-attrs">
                <dt>Type</dt>
                <dd>{asset.asset_type}</dd>
                {asset.warranty_until !== undefined ? (
                  <>
                    <dt>Warranty until</dt>
                    <dd>
                      <time dateTime={asset.warranty_until}>
                        {new Date(asset.warranty_until).toLocaleDateString()}
                      </time>
                    </dd>
                  </>
                ) : null}
              </dl>
              <MediaGallery
                media={mediaForPropertyAsset(asset.id)}
                onUpload={(file) =>
                  uploadMedia(file, {
                    attached_to: 'property',
                    property_asset_id: asset.id,
                  }).then(() => undefined)
                }
                onDelete={(id) => deleteMedia(id)}
                readonly={readonly}
                label={`Photos for ${asset.name ?? asset.asset_type}`}
              />
            </article>
          </li>
        ))}
      </ul>
      {adding ? (
        <AssetAddForm
          onCancel={() => setAdding(false)}
          onSubmit={(type, name) => void handleAdd(type, name)}
        />
      ) : null}
      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

const ASSET_TYPES: ReadonlyArray<PropertyAssetType> = [
  'hvac',
  'roof',
  'water_heater',
  'plumbing',
  'electrical',
  'foundation',
  'appliance',
  'smart_device',
  'service_contract',
  'warranty',
  'inspection_report',
  'other',
];

interface AssetAddFormProps {
  onCancel: () => void;
  onSubmit: (type: PropertyAssetType, name: string) => void;
}

function AssetAddForm({ onCancel, onSubmit }: AssetAddFormProps): ReactNode {
  const [type, setType] = useState<PropertyAssetType>('hvac');
  const [name, setName] = useState('');

  return (
    <form
      className="bb-auth-resource-add-form"
      aria-label="Add property asset"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(type, name);
      }}
    >
      <label className="bb-auth-field" htmlFor="bb-asset-type">
        <span className="bb-auth-field-label">Asset type</span>
        <select
          id="bb-asset-type"
          value={type}
          onChange={(e) => setType(e.target.value as PropertyAssetType)}
        >
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="bb-auth-field" htmlFor="bb-asset-name">
        <span className="bb-auth-field-label">Name (optional)</span>
        <input
          id="bb-asset-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="bb-auth-actions">
        <button type="submit" className="bb-auth-button bb-auth-button-primary">
          Save asset
        </button>
        <button
          type="button"
          className="bb-auth-button bb-auth-button-link"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface PropertyAddFormProps {
  onCancel: () => void;
  onSubmit: (address: Address, attrs: PropertyAttrs, name: string) => void;
}

function PropertyAddForm({
  onCancel,
  onSubmit,
}: PropertyAddFormProps): ReactNode {
  const [name, setName] = useState('');
  const [address, setAddress] = useState<Address>({
    id: '',
    address_type: 'property',
    line1: '',
    city: '',
    state_region: '',
    postal_code: '',
    country: 'US',
    is_primary: false,
  });
  const [propertyType, setPropertyType] = useState('');
  const [yearBuilt, setYearBuilt] = useState('');
  const [sqft, setSqft] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="bb-auth-resource-add-form"
      aria-label="Add property"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          address.line1.length === 0 ||
          address.city.length === 0 ||
          address.postal_code.length === 0
        ) {
          setError('Address is required');
          return;
        }
        const attrs: PropertyAttrs = {};
        if (propertyType.length > 0) attrs.property_type = propertyType;
        if (yearBuilt.length > 0) attrs.year_built = yearBuilt;
        if (sqft.length > 0) attrs.sqft = sqft;
        onSubmit(address, attrs, name);
      }}
    >
      <label className="bb-auth-field" htmlFor="bb-prop-name">
        <span className="bb-auth-field-label">Property name (optional)</span>
        <input
          id="bb-prop-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <AddressInput
        addressType="property"
        address={address}
        onChange={setAddress}
        required
      />
      <label className="bb-auth-field" htmlFor="bb-prop-type">
        <span className="bb-auth-field-label">Type</span>
        <input
          id="bb-prop-type"
          type="text"
          placeholder="single_family / condo / multi_family"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
        />
      </label>
      <label className="bb-auth-field" htmlFor="bb-prop-year">
        <span className="bb-auth-field-label">Year built</span>
        <input
          id="bb-prop-year"
          type="text"
          inputMode="numeric"
          value={yearBuilt}
          onChange={(e) => setYearBuilt(e.target.value)}
        />
      </label>
      <label className="bb-auth-field" htmlFor="bb-prop-sqft">
        <span className="bb-auth-field-label">Sq ft</span>
        <input
          id="bb-prop-sqft"
          type="text"
          inputMode="numeric"
          value={sqft}
          onChange={(e) => setSqft(e.target.value)}
        />
      </label>
      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
        </div>
      ) : null}
      <div className="bb-auth-actions">
        <button type="submit" className="bb-auth-button bb-auth-button-primary">
          Save property
        </button>
        <button
          type="button"
          className="bb-auth-button bb-auth-button-link"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Suppress unused import (we keep PropertyAsset typed in section signature
// for documentation of the component's domain, even if not directly named here).
type _PropertyAssetUsage = PropertyAsset;
