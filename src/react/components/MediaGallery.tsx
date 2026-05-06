// @samjonaidi-ship-it/universal-auth | src/react/components/MediaGallery.tsx | v1.1.0 | 2026-05-06 | BB
// 3-column R2-backed media grid with upload tile + per-item delete.
// Implements PERSONA_PCP_DESIGN.md §10 (SDK component map) +
// SDK_SPEC §5.4.1 (ProfileMedia) + §5.4.2 (POST/DELETE /identity/v1/profile/media).
//
// Optimistic UI is delegated to the parent (useIdentity().uploadMedia /
// deleteMedia mutate the store on resolve); this component only owns the
// per-file upload spinner + delete confirmation.

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import type { ProfileMedia } from '../../types/pcp.js';

export interface MediaGalleryProps {
  /** Media items to render (already filtered by resource/asset by caller). */
  media: readonly ProfileMedia[];
  /** Upload handler — receives the chosen file. */
  onUpload: (file: File) => Promise<void>;
  /** Delete handler — receives the media id. */
  onDelete: (id: string) => Promise<void>;
  /** When true, hides upload + delete affordances (display-only). */
  readonly?: boolean;
  /** Soft cap on rendered items + new uploads. */
  maxItems?: number;
  /** `accept` attribute on the file input. Defaults to images + PDF. */
  accept?: string;
  /** ARIA label for the gallery region. */
  label?: string;
}

export function MediaGallery({
  media,
  onUpload,
  onDelete,
  readonly = false,
  maxItems,
  accept = 'image/*,application/pdf',
  label = 'Media gallery',
}: MediaGalleryProps): ReactNode {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible =
    typeof maxItems === 'number' ? media.slice(0, maxItems) : media;
  const canUpload =
    !readonly &&
    (typeof maxItems !== 'number' || media.length < maxItems);

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setError(null);
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current !== null) fileRef.current.value = '';
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setError(null);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <section className="bb-auth-media-gallery" aria-label={label}>
      <ul role="list" className="bb-auth-media-grid">
        {visible.map((item) => (
          <li
            key={item.id}
            className="bb-auth-media-tile"
            data-media-type={item.media_type}
          >
            <MediaThumb item={item} />
            {!readonly ? (
              <button
                type="button"
                className="bb-auth-media-delete"
                onClick={() => void handleDelete(item.id)}
                disabled={busyIds.has(item.id)}
                aria-label={`Delete ${item.file_name ?? item.attached_to}`}
              >
                {busyIds.has(item.id) ? '…' : '×'}
              </button>
            ) : null}
          </li>
        ))}

        {canUpload ? (
          <li className="bb-auth-media-tile bb-auth-media-upload">
            <button
              type="button"
              className="bb-auth-media-upload-button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Upload media"
            >
              {uploading ? '…' : '+'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              onChange={(e) => void handleFile(e)}
              style={{ display: 'none' }}
              aria-hidden="true"
              tabIndex={-1}
            />
          </li>
        ) : null}
      </ul>

      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function MediaThumb({ item }: { item: ProfileMedia }): ReactNode {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <span
        className="bb-auth-media-error"
        role="img"
        aria-label="Media unavailable"
      >
        ⚠
      </span>
    );
  }

  if (item.media_type === 'image') {
    return (
      <img
        src={item.thumb_url ?? item.url}
        alt={item.caption ?? item.file_name ?? ''}
        loading="lazy"
        onError={() => setErrored(true)}
      />
    );
  }

  // documents / pdf / other → file icon + name
  return (
    <span className="bb-auth-media-doc">
      <span className="bb-auth-media-doc-icon" aria-hidden="true">
        📄
      </span>
      <span className="bb-auth-media-doc-name">
        {item.file_name ?? item.mime_type}
      </span>
    </span>
  );
}
