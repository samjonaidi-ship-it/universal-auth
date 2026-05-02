// @bainbridgebuilders/universal-auth | src/react/components/VehicleSection.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Crew persona vehicle list — name/make/model/year/plate + per-vehicle media.
// Implements PERSONA_PCP_DESIGN.md §3.3 + §6 (crew persona resources) +
// SDK_SPEC §5.4.7 (resource_type='vehicle' lives in profile_resources, NOT
// cal_assets — those are BB-owned tools).

import { useState, type ReactNode } from 'react';
import { useIdentity } from '../useIdentity.js';
import { MediaGallery } from './MediaGallery.js';
import type { ProfileResource } from '../../types/pcp.js';

export interface VehicleSectionProps {
  /** Section heading (i18n). */
  heading?: string;
  /** Hide add/edit/delete affordances. */
  readonly?: boolean;
}

interface VehicleAttrs {
  make?: string;
  model?: string;
  year?: string;
  plate?: string;
  vin?: string;
}

function readAttrs(r: ProfileResource): VehicleAttrs {
  const a = r.attributes;
  const out: VehicleAttrs = {};
  if (typeof a.make === 'string') out.make = a.make;
  if (typeof a.model === 'string') out.model = a.model;
  if (typeof a.year === 'string' || typeof a.year === 'number') out.year = String(a.year);
  if (typeof a.plate === 'string') out.plate = a.plate;
  if (typeof a.vin === 'string') out.vin = a.vin;
  return out;
}

export function VehicleSection({
  heading = 'Vehicles',
  readonly = false,
}: VehicleSectionProps): ReactNode {
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

  const vehicles = resourcesOfType('vehicle');

  async function handleAdd(attrs: VehicleAttrs, name: string): Promise<void> {
    setError(null);
    try {
      await addResource({
        resource_type: 'vehicle',
        status: 'active',
        name,
        attributes: { ...attrs },
        verified: false,
        external_refs: {},
      });
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add vehicle');
    }
  }

  return (
    <section className="bb-auth-resource-section" aria-label={heading}>
      <header className="bb-auth-resource-section-header">
        <h3 className="bb-auth-heading">{heading}</h3>
        {!readonly ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-secondary"
            onClick={() => setAdding(true)}
            disabled={adding}
          >
            Add vehicle
          </button>
        ) : null}
      </header>

      {vehicles.length === 0 && !adding ? (
        <p className="bb-auth-description">No vehicles on file.</p>
      ) : null}

      <ul role="list" className="bb-auth-resource-list">
        {vehicles.map((v) => (
          <li key={v.id} className="bb-auth-resource-card">
            <VehicleCard
              vehicle={v}
              attrs={readAttrs(v)}
              media={mediaForResource(v.id)}
              readonly={readonly}
              onArchive={() => void archiveResource(v.id)}
              onUploadMedia={(file) =>
                uploadMedia(file, {
                  attached_to: 'vehicle',
                  resource_id: v.id,
                }).then(() => undefined)
              }
              onDeleteMedia={(id) => deleteMedia(id)}
            />
          </li>
        ))}
      </ul>

      {adding ? (
        <VehicleAddForm
          onCancel={() => setAdding(false)}
          onSubmit={(attrs, name) => void handleAdd(attrs, name)}
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

interface VehicleCardProps {
  vehicle: ProfileResource;
  attrs: VehicleAttrs;
  media: ReturnType<ReturnType<typeof useIdentity>['mediaForResource']>;
  readonly: boolean;
  onArchive: () => void;
  onUploadMedia: (file: File) => Promise<void>;
  onDeleteMedia: (id: string) => Promise<void>;
}

function VehicleCard({
  vehicle,
  attrs,
  media,
  readonly,
  onArchive,
  onUploadMedia,
  onDeleteMedia,
}: VehicleCardProps): ReactNode {
  const summary =
    [attrs.year, attrs.make, attrs.model].filter((x) => x !== undefined).join(' ') ||
    'Vehicle';

  return (
    <article>
      <header className="bb-auth-resource-card-header">
        <h4>{vehicle.name ?? summary}</h4>
        {!readonly ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={onArchive}
            aria-label={`Archive ${vehicle.name ?? summary}`}
          >
            Archive
          </button>
        ) : null}
      </header>
      <dl className="bb-auth-resource-attrs">
        {attrs.make !== undefined ? (
          <>
            <dt>Make</dt>
            <dd>{attrs.make}</dd>
          </>
        ) : null}
        {attrs.model !== undefined ? (
          <>
            <dt>Model</dt>
            <dd>{attrs.model}</dd>
          </>
        ) : null}
        {attrs.year !== undefined ? (
          <>
            <dt>Year</dt>
            <dd>{attrs.year}</dd>
          </>
        ) : null}
        {attrs.plate !== undefined ? (
          <>
            <dt>Plate</dt>
            <dd>{attrs.plate}</dd>
          </>
        ) : null}
      </dl>
      <MediaGallery
        media={media}
        onUpload={onUploadMedia}
        onDelete={onDeleteMedia}
        readonly={readonly}
        label={`Photos for ${vehicle.name ?? summary}`}
      />
    </article>
  );
}

interface VehicleAddFormProps {
  onCancel: () => void;
  onSubmit: (attrs: VehicleAttrs, name: string) => void;
}

function VehicleAddForm({ onCancel, onSubmit }: VehicleAddFormProps): ReactNode {
  const [name, setName] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [plate, setPlate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  return (
    <form
      className="bb-auth-resource-add-form"
      aria-label="Add vehicle"
      onSubmit={(e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (make.trim().length === 0) errs.make = 'Make is required.';
        if (model.trim().length === 0) errs.model = 'Model is required.';
        setErrors(errs);
        if (Object.keys(errs).length > 0) return;
        const attrs: VehicleAttrs = {};
        if (make.length > 0) attrs.make = make;
        if (model.length > 0) attrs.model = model;
        if (year.length > 0) attrs.year = year;
        if (plate.length > 0) attrs.plate = plate;
        onSubmit(attrs, name.length > 0 ? name : `${year} ${make} ${model}`.trim());
      }}
    >
      <SimpleField label="Name" id="bb-veh-name" value={name} onChange={setName} />
      <SimpleField
        label="Make"
        id="bb-veh-make"
        value={make}
        onChange={(v) => { setMake(v); if (errors.make !== undefined) setErrors((s) => { const n = { ...s }; delete n.make; return n; }); }}
        required
        error={errors.make}
      />
      <SimpleField
        label="Model"
        id="bb-veh-model"
        value={model}
        onChange={(v) => { setModel(v); if (errors.model !== undefined) setErrors((s) => { const n = { ...s }; delete n.model; return n; }); }}
        required
        error={errors.model}
      />
      <SimpleField label="Year" id="bb-veh-year" value={year} onChange={setYear} />
      <SimpleField label="Plate" id="bb-veh-plate" value={plate} onChange={setPlate} />
      <div className="bb-auth-actions">
        <button type="submit" className="bb-auth-button bb-auth-button-primary">
          Save vehicle
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

interface SimpleFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  error?: string | undefined;
}

function SimpleField({
  id,
  label,
  value,
  onChange,
  required,
  error,
}: SimpleFieldProps): ReactNode {
  return (
    <label className="bb-auth-field" htmlFor={id}>
      <span className="bb-auth-field-label">{label}</span>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
      />
      {error !== undefined ? (
        <span id={`${id}-error`} className="bb-auth-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
