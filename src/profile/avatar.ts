// @bb/universal-auth | src/profile/avatar.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Avatar primitives — JPEG compression, initials generation, deterministic
// color palette, 3-tier resolution. Per §5.4.4.
//
// Ports from CalExp5:
//   * compressJpeg          ← MyProfile.jsx (canvas pipeline at 82%, ≤1024px)
//   * generateInitials      ← store/helpers.js (2-char from display_name)
//   * INITIALS_COLORS       ← store/slices/userSlice.js (6-color palette)
//
// Upload endpoint: POST /identity/v1/profile/avatar (multipart/form-data)
// → CT BFF signs + uploads to R2 bb-profile-avatars/<identity_id>/<uuid>.jpg

import { post, del } from '../core/client.js';
import type { UniversalProfile } from '../types/profile.js';
import { findPresetByKey, pickPresetForIdentity } from './presets.js';

// ── Constants ─────────────────────────────────────────────────────────────

/** 6-color palette for InitialsBadge background — matches CalExp5 userSlice.js. */
export const INITIALS_COLORS: readonly string[] = [
  '#C8102E', // BB red
  '#003366', // navy
  '#2C5F2D', // forest green
  '#7B3F00', // brown
  '#404040', // graphite
  '#5B2A86', // purple
];

const JPEG_QUALITY = 0.82;
const MAX_DIMENSION = 1024;

// ── Initials generation ───────────────────────────────────────────────────

/**
 * Generate 2-char uppercase initials from a display name.
 * - "Sam Jonaidi"   → "SJ"
 * - "MISTER X"      → "MX"
 * - "single"        → "SI"  (first 2 chars when only one word)
 * - ""              → "??"  (sentinel)
 */
export function generateInitials(displayName: string): string {
  const trimmed = (displayName ?? '').trim();
  if (trimmed.length === 0) return '??';
  const parts = trimmed.split(/\s+/u);
  if (parts.length === 1) {
    const single = parts[0]!;
    return single.slice(0, 2).toUpperCase();
  }
  const first = parts[0]!.charAt(0);
  const last = parts[parts.length - 1]!.charAt(0);
  return (first + last).toUpperCase();
}

/**
 * Deterministic color from `INITIALS_COLORS` keyed by identity_id.
 * Same hash strategy as `pickPresetForIdentity` so a user's preset + initials
 * color stay correlated even if they clear their avatar.
 */
export function pickInitialsColor(identityId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < identityId.length; i++) {
    h ^= identityId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return INITIALS_COLORS[h % INITIALS_COLORS.length]!;
}

// ── 3-tier avatar resolution (§5.4.4) ────────────────────────────────────

export type AvatarRender =
  | { kind: 'url'; src: string }
  | { kind: 'preset'; src: string; presetKey: string }
  | { kind: 'initials'; initials: string; color: string };

/**
 * Resolve which of the 3 tiers to render for a given profile.
 * Consumer apps render the result however they want (img, div, canvas, etc.).
 *
 * Order (§5.4.4):
 *   1. avatar_url (uploaded JPEG)
 *   2. avatar_preset (one of 20 SVGs)
 *   3. initials badge with deterministic color
 */
export function resolveAvatar(profile: UniversalProfile): AvatarRender {
  if (profile.avatar_url !== undefined && profile.avatar_url !== '') {
    return { kind: 'url', src: profile.avatar_url };
  }
  if (profile.avatar_preset !== undefined && profile.avatar_preset !== '') {
    const preset = findPresetByKey(profile.avatar_preset);
    if (preset !== null) {
      return { kind: 'preset', src: preset.dataUri, presetKey: preset.key };
    }
    // Unknown preset key — fall through to deterministic preset by identity_id
    const fallback = pickPresetForIdentity(profile.identity_id);
    return { kind: 'preset', src: fallback.dataUri, presetKey: fallback.key };
  }
  return {
    kind: 'initials',
    initials: generateInitials(profile.display_name),
    color: profile.initials_color,
  };
}

// ── JPEG compression (CalExp5 port) ──────────────────────────────────────

/**
 * Compress an arbitrary image Blob/File to JPEG at 82% quality, max 1024×1024.
 * Pure browser API (canvas + createImageBitmap) — no extra dep.
 *
 * Throws if the input isn't a decodable image.
 */
export async function compressJpeg(input: Blob | File): Promise<Blob> {
  if (typeof createImageBitmap === 'undefined') {
    throw new Error('compressJpeg requires a browser context with createImageBitmap.');
  }

  const bitmap = await createImageBitmap(input);
  try {
    const { width, height } = scaleToFit(bitmap.width, bitmap.height, MAX_DIMENSION);
    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : (() => {
            const c = document.createElement('canvas');
            c.width = width;
            c.height = height;
            return c;
          })();
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw new Error('compressJpeg: 2D canvas unavailable.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    if ('convertToBlob' in canvas) {
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    }
    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => (b !== null ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    });
  } finally {
    bitmap.close?.();
  }
}

function scaleToFit(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const scale = Math.min(max / w, max / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// ── Server upload + remove ────────────────────────────────────────────────

interface UploadResponse {
  avatar_url: string;
  profile_version: number;
}

/**
 * Compress + upload a user-selected avatar. Returns the new R2 URL.
 * The endpoint is `POST /identity/v1/profile/avatar` (multipart).
 */
export async function uploadAvatar(input: Blob | File): Promise<UploadResponse> {
  const compressed = await compressJpeg(input);
  const form = new FormData();
  form.append('file', compressed, 'avatar.jpg');

  // Use a custom fetch since `client.post` JSON-stringifies bodies.
  // We still want X-Auth-Protocol-Version + Idempotency-Key — but the SDK's
  // `post()` builds them correctly when given a non-JSON body via the headers
  // pass-through. To avoid duplicating that logic we route through the
  // canonical post() with the headers it auto-stamps and a direct body override.
  const { data } = await post<UploadResponse>(
    '/identity/v1/profile/avatar',
    form,  // FormData — client's JSON.stringify won't be called when body is FormData
    { headers: { /* let browser set Content-Type with multipart boundary */ } }
  );
  return data;
}

/**
 * Remove the user-uploaded avatar; profile falls back to preset → initials.
 */
export async function clearAvatar(): Promise<void> {
  await del('/identity/v1/profile/avatar');
}
