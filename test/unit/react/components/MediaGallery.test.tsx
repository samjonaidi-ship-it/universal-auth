// @samjonaidi-ship-it/universal-auth | test/unit/react/components/MediaGallery.test.tsx | v1.0.0-rc.4 | 2026-04-30 | BB

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MediaGallery } from '../../../../src/react/components/MediaGallery.js';
import type { ProfileMedia } from '../../../../src/types/pcp.js';

function makeImage(id: string, url = `https://r2.test/${id}.jpg`): ProfileMedia {
  return {
    id,
    attached_to: 'vehicle',
    media_type: 'image',
    mime_type: 'image/jpeg',
    file_name: `${id}.jpg`,
    url,
    sort_order: 0,
    is_primary: false,
    visibility: 'private',
    uploaded_at: '2026-04-30T00:00:00Z',
    uploaded_by: 'sam',
  };
}

function makeDoc(id: string, name = 'cert.pdf'): ProfileMedia {
  return {
    id,
    attached_to: 'compliance_doc',
    media_type: 'document',
    mime_type: 'application/pdf',
    file_name: name,
    url: `https://r2.test/${id}.pdf`,
    sort_order: 0,
    is_primary: false,
    visibility: 'private',
    uploaded_at: '2026-04-30T00:00:00Z',
    uploaded_by: 'sam',
  };
}

describe('MediaGallery', () => {
  it('renders without crashing for empty list', () => {
    render(
      <MediaGallery
        media={[]}
        onUpload={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByLabelText('Media gallery')).toBeTruthy();
    expect(screen.getByLabelText('Upload media')).toBeTruthy();
  });

  it('renders image thumbs and document icons', () => {
    render(
      <MediaGallery
        media={[makeImage('a'), makeDoc('b', 'invoice.pdf')]}
        onUpload={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />
    );
    expect(screen.getByText('invoice.pdf')).toBeTruthy();
    const imgs = document.querySelectorAll('img');
    expect(imgs.length).toBe(1);
  });

  it('invokes onDelete when delete button clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <MediaGallery
        media={[makeImage('x')]}
        onUpload={vi.fn().mockResolvedValue(undefined)}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByLabelText(/Delete x.jpg/i));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('x'));
  });

  it('hides delete + upload affordances when readonly', () => {
    render(
      <MediaGallery
        media={[makeImage('a')]}
        onUpload={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        readonly
      />
    );
    expect(screen.queryByLabelText(/Delete a.jpg/i)).toBeNull();
    expect(screen.queryByLabelText('Upload media')).toBeNull();
  });

  it('renders error state when image url fails to load', () => {
    render(
      <MediaGallery
        media={[makeImage('e')]}
        onUpload={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const img = document.querySelector('img');
    if (img === null) throw new Error('img not rendered');
    fireEvent.error(img);
    expect(screen.getByLabelText('Media unavailable')).toBeTruthy();
  });

  it('surfaces upload errors via role=alert', async () => {
    const onUpload = vi.fn().mockRejectedValue(new Error('R2 down'));
    render(
      <MediaGallery
        media={[]}
        onUpload={onUpload}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />
    );
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type=file]');
    if (input === null) throw new Error('file input missing');
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('R2 down'));
  });

  it('respects maxItems cap (hides upload when at cap)', () => {
    render(
      <MediaGallery
        media={[makeImage('1'), makeImage('2')]}
        onUpload={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        maxItems={2}
      />
    );
    expect(screen.queryByLabelText('Upload media')).toBeNull();
  });
});
