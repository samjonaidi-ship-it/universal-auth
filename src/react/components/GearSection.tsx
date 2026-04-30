// @bainbridgebuilders/universal-auth | src/react/components/GearSection.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Crew persona personal-gear list — name + per-item photos.
// Implements PERSONA_PCP_DESIGN.md §3.3 (resource_type='gear' is PERSONAL,
// owned by identity, NOT BB-owned tools which stay in Bridge cal_assets) +
// SDK_SPEC §5.4.7.

import { useState, type ReactNode } from 'react';
import { useIdentity } from '../useIdentity.js';
import { MediaGallery } from './MediaGallery.js';

export interface GearSectionProps {
  heading?: string;
  readonly?: boolean;
}

export function GearSection({
  heading = 'Personal gear',
  readonly = false,
}: GearSectionProps): ReactNode {
  const {
    resourcesOfType,
    addResource,
    archiveResource,
    mediaForResource,
    uploadMedia,
    deleteMedia,
  } = useIdentity();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const gear = resourcesOfType('gear');

  async function handleAdd(): Promise<void> {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      setError('Name is required');
      return;
    }
    setError(null);
    try {
      await addResource({
        resource_type: 'gear',
        status: 'active',
        name: trimmed,
        attributes: {},
        verified: false,
        external_refs: {},
      });
      setNewName('');
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add gear');
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
            Add gear
          </button>
        ) : null}
      </header>

      {gear.length === 0 && !adding ? (
        <p className="bb-auth-description">No personal gear on file.</p>
      ) : null}

      <ul role="list" className="bb-auth-resource-list">
        {gear.map((g) => (
          <li key={g.id} className="bb-auth-resource-card">
            <article>
              <header className="bb-auth-resource-card-header">
                <h4>{g.name ?? 'Item'}</h4>
                {!readonly ? (
                  <button
                    type="button"
                    className="bb-auth-button bb-auth-button-link"
                    onClick={() => void archiveResource(g.id)}
                    aria-label={`Remove ${g.name ?? 'item'}`}
                  >
                    Remove
                  </button>
                ) : null}
              </header>
              <MediaGallery
                media={mediaForResource(g.id)}
                onUpload={(file) =>
                  uploadMedia(file, {
                    attached_to: 'gear',
                    resource_id: g.id,
                  }).then(() => undefined)
                }
                onDelete={(id) => deleteMedia(id)}
                readonly={readonly}
                label={`Photos for ${g.name ?? 'item'}`}
              />
            </article>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          className="bb-auth-resource-add-form"
          aria-label="Add personal gear"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          <label className="bb-auth-field" htmlFor="bb-gear-name">
            <span className="bb-auth-field-label">Item name</span>
            <input
              id="bb-gear-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-required="true"
              autoFocus
            />
          </label>
          <div className="bb-auth-actions">
            <button
              type="submit"
              className="bb-auth-button bb-auth-button-primary"
            >
              Save
            </button>
            <button
              type="button"
              className="bb-auth-button bb-auth-button-link"
              onClick={() => {
                setAdding(false);
                setNewName('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}
