// @bb/universal-auth | src/react/components/AvatarPicker.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// 3-tier avatar picker: upload, preset grid, or fall back to initials.
// Per §5.4.4. Composable with <ProfileSetupScreen> or rendered standalone
// (e.g. on a /me/profile page).

import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useProfile } from '../useProfile.js';
import { PRESET_AVATARS, findPresetByKey } from '../../profile/presets.js';
import { resolveAvatar } from '../../profile/avatar.js';

export interface AvatarPickerProps {
  /** Heading override (i18n). */
  heading?: string;
  /** Tab labels. */
  labels?: Partial<{ upload: string; choose: string; clear: string; size: string }>;
}

export function AvatarPicker({
  heading = 'Avatar',
  labels = {},
}: AvatarPickerProps): ReactNode {
  const L = {
    upload: 'Upload photo',
    choose: 'Choose preset',
    clear: 'Clear',
    size: 'JPEG up to 5 MB',
    ...labels,
  };
  const { profile, uploadAvatar, selectPreset, clearAvatar } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (profile === null) return null;

  const current = resolveAvatar(profile);

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    setError(null);
    setBusy(true);
    try {
      await uploadAvatar(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current !== null) fileRef.current.value = '';
    }
  }

  async function handlePreset(presetKey: string): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await selectPreset(presetKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save preset');
    } finally {
      setBusy(false);
    }
  }

  async function handleClear(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      await clearAvatar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bb-auth-avatar-picker" aria-label={heading}>
      <h3 className="bb-auth-heading">{heading}</h3>

      <div className="bb-auth-avatar-current">
        {renderAvatar(current)}
      </div>

      <div className="bb-auth-actions">
        <button
          type="button"
          className="bb-auth-button bb-auth-button-secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {L.upload}
        </button>
        {(profile.avatar_url !== undefined || profile.avatar_preset !== undefined) ? (
          <button
            type="button"
            className="bb-auth-button bb-auth-button-link"
            onClick={() => void handleClear()}
            disabled={busy}
          >
            {L.clear}
          </button>
        ) : null}
      </div>
      <p className="bb-auth-description">{L.size}</p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={(e) => void handleFile(e)}
        style={{ display: 'none' }}
        aria-label={L.upload}
      />

      <fieldset className="bb-auth-avatar-presets">
        <legend>{L.choose}</legend>
        <ul role="list" className="bb-auth-avatar-preset-grid">
          {PRESET_AVATARS.map((preset) => {
            const selected =
              profile.avatar_url === undefined &&
              findPresetByKey(profile.avatar_preset ?? '')?.key === preset.key;
            return (
              <li key={preset.key}>
                <button
                  type="button"
                  className={
                    'bb-auth-avatar-preset' + (selected ? ' bb-auth-avatar-preset-selected' : '')
                  }
                  onClick={() => void handlePreset(preset.key)}
                  disabled={busy}
                  aria-pressed={selected}
                  aria-label={`Preset ${preset.key}`}
                >
                  <img src={preset.dataUri} alt="" width={48} height={48} />
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {error !== null ? (
        <div role="alert" aria-live="assertive" className="bb-auth-error">
          {error}
        </div>
      ) : null}
    </section>
  );
}

function renderAvatar(r: ReturnType<typeof resolveAvatar>): ReactNode {
  if (r.kind === 'url' || r.kind === 'preset') {
    return <img src={r.src} alt="" width={64} height={64} className="bb-auth-avatar" />;
  }
  return (
    <span
      className="bb-auth-avatar bb-auth-avatar-initials"
      data-color={r.color}
      style={{ backgroundColor: r.color }}
    >
      {r.initials}
    </span>
  );
}
