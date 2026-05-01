// @bainbridgebuilders/universal-auth | src/profile/presets.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// 20 preset avatars — geometric SVGs grouped by persona vibe (§5.4.4).
//
// Per spec §5.4.4 + §5.5.3 a fresh identity is auto-assigned a preset via
// `presets[hash(identity_id) % 20]`. Users may pick a different preset later;
// uploading a JPEG (avatar_url) overrides the preset.
//
// Format: each entry is a data-URI SVG. Consumers render via <img src={...}/>
// or <div style={{backgroundImage}}/>. Tiny — ~150 B per SVG, 3 KB total.

export interface PresetAvatar {
  /** Stable key persisted in `identity_profile.avatar_preset`. */
  key: string;
  /** Inline SVG markup as a data URI (renderable in <img src> directly). */
  dataUri: string;
  /** Persona category for picker grouping (UX only; doesn't gate selection). */
  category: 'crew' | 'office' | 'home' | 'shop' | 'design';
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Build a square 96×96 SVG with a colored background and a single glyph.
 * Glyphs are simple geometric shapes — no third-party fonts needed.
 */
function build(bg: string, fg: string, glyph: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">` +
      `<rect width="96" height="96" fill="${bg}"/>` +
      `<g fill="${fg}" stroke="none" transform="translate(20 20)">${glyph}</g>` +
      `</svg>`
  );
}

// Glyphs — kept short and recognizable
const G = {
  hardhat: '<path d="M28 32 L28 24 Q28 8 12 8 L20 8 Q44 8 44 24 L44 32 Z M0 32 L56 32 L56 38 L0 38 Z"/>',
  hammer: '<path d="M30 6 L48 6 L52 14 L46 18 L42 14 L34 14 L20 50 L12 46 L26 12 L30 14 Z"/>',
  wrench: '<path d="M44 4 Q56 4 56 16 Q56 22 50 26 L50 30 L34 46 L18 30 L34 14 L38 14 Q34 8 40 4 Z"/>',
  drill: '<path d="M2 22 L36 22 L36 18 L52 18 L52 30 L36 30 L36 26 L2 26 Z M40 22 L48 22 L48 26 L40 26 Z"/>',
  ladder: '<path d="M10 4 L18 4 L18 56 L10 56 Z M38 4 L46 4 L46 56 L38 56 Z M10 14 L46 14 L46 18 L10 18 Z M10 28 L46 28 L46 32 L10 32 Z M10 42 L46 42 L46 46 L10 46 Z"/>',
  saw: '<path d="M4 30 L52 30 L52 34 L4 34 Z M4 30 L8 22 L12 30 L16 22 L20 30 L24 22 L28 30 L32 22 L36 30 L40 22 L44 30 L48 22 L52 30 Z"/>',
  truck: '<path d="M2 18 L34 18 L34 38 L2 38 Z M34 22 L48 22 L52 30 L52 38 L34 38 Z M10 38 A4 4 0 1 0 18 38 A4 4 0 1 0 10 38 Z M40 38 A4 4 0 1 0 48 38 A4 4 0 1 0 40 38 Z"/>',
  toolbox: '<path d="M4 20 L52 20 L52 50 L4 50 Z M16 12 L40 12 L40 20 L16 20 Z M22 12 L34 12 L34 6 L22 6 Z"/>',
  paint: '<path d="M14 2 L42 2 L42 16 L52 16 L52 28 L14 28 Z M22 28 L34 28 L34 50 L26 56 L22 50 Z"/>',
  blueprint: '<path d="M4 6 L52 6 L52 50 L4 50 Z M10 14 L46 14 L46 18 L10 18 Z M10 24 L34 24 L34 28 L10 28 Z M10 34 L46 34 L46 38 L10 38 Z"/>',
  house: '<path d="M28 4 L52 22 L52 50 L4 50 L4 22 Z M22 30 L34 30 L34 50 L22 50 Z"/>',
  key: '<path d="M40 12 A12 12 0 1 1 28 24 L4 24 L4 32 L8 32 L8 28 L12 28 L12 32 L16 32 L16 28 L20 28 L20 32 L28 32 A12 12 0 0 1 40 12 Z M40 16 A4 4 0 1 0 40 24 A4 4 0 1 0 40 16 Z"/>',
  lock: '<path d="M14 24 L14 16 Q14 4 28 4 Q42 4 42 16 L42 24 L46 24 L46 50 L10 50 L10 24 Z M20 24 L36 24 L36 16 Q36 8 28 8 Q20 8 20 16 Z"/>',
  briefcase: '<path d="M4 18 L52 18 L52 50 L4 50 Z M18 18 L18 12 Q18 8 22 8 L34 8 Q38 8 38 12 L38 18 M22 12 L34 12 L34 18 L22 18 Z"/>',
  pencil: '<path d="M40 4 L52 16 L20 48 L4 52 L8 36 Z M44 8 L48 12 L42 18 L38 14 Z"/>',
  ruler: '<path d="M2 18 L52 18 L52 34 L2 34 Z M10 18 L10 26 M18 18 L18 28 M26 18 L26 26 M34 18 L34 28 M42 18 L42 26 M50 18 L50 28"/>',
  gear: '<path d="M28 8 L34 8 L36 14 L42 18 L48 16 L50 22 L46 28 L48 34 L44 38 L38 38 L34 44 L28 44 L24 38 L18 38 L14 32 L18 26 L16 20 L20 14 L26 14 Z M28 18 A8 8 0 1 0 28 34 A8 8 0 1 0 28 18 Z"/>',
  shield: '<path d="M28 4 L52 12 L48 36 Q48 46 28 52 Q8 46 8 36 L4 12 Z M16 22 L24 32 L40 16"/>',
  star: '<path d="M28 4 L33 22 L52 22 L37 32 L42 50 L28 40 L14 50 L19 32 L4 22 L23 22 Z"/>',
  building: '<path d="M8 6 L48 6 L48 50 L8 50 Z M14 14 L20 14 L20 20 L14 20 Z M26 14 L32 14 L32 20 L26 20 Z M38 14 L44 14 L44 20 L38 20 Z M14 26 L20 26 L20 32 L14 32 Z M26 26 L32 26 L32 32 L26 32 Z M38 26 L44 26 L44 32 L38 32 Z"/>',
};

// 20 presets — categories interleaved
export const PRESET_AVATARS: readonly PresetAvatar[] = [
  { key: 'crew-01', category: 'crew',   dataUri: build('#C8102E', '#fff',    G.hardhat) },
  { key: 'crew-02', category: 'crew',   dataUri: build('#1A1A1A', '#FFCC00', G.hammer) },
  { key: 'crew-03', category: 'crew',   dataUri: build('#2C5F2D', '#fff',    G.wrench) },
  { key: 'crew-04', category: 'crew',   dataUri: build('#7B3F00', '#fff',    G.drill) },
  { key: 'crew-05', category: 'crew',   dataUri: build('#003366', '#fff',    G.ladder) },
  { key: 'crew-06', category: 'crew',   dataUri: build('#5C2A0F', '#fff',    G.saw) },
  { key: 'crew-07', category: 'crew',   dataUri: build('#404040', '#FFCC00', G.toolbox) },
  { key: 'crew-08', category: 'crew',   dataUri: build('#0066CC', '#fff',    G.truck) },
  { key: 'shop-01', category: 'shop',   dataUri: build('#992D2D', '#fff',    G.paint) },
  { key: 'shop-02', category: 'shop',   dataUri: build('#2C5F2D', '#fff',    G.gear) },
  { key: 'shop-03', category: 'shop',   dataUri: build('#003366', '#fff',    G.shield) },
  { key: 'office-01', category: 'office', dataUri: build('#1A1A1A', '#fff',  G.briefcase) },
  { key: 'office-02', category: 'office', dataUri: build('#404040', '#fff',  G.pencil) },
  { key: 'office-03', category: 'office', dataUri: build('#2A2A2A', '#FFCC00', G.ruler) },
  { key: 'office-04', category: 'office', dataUri: build('#003366', '#fff',  G.star) },
  { key: 'design-01', category: 'design', dataUri: build('#5B2A86', '#fff',  G.blueprint) },
  { key: 'design-02', category: 'design', dataUri: build('#2C5F2D', '#fff',  G.building) },
  { key: 'home-01',  category: 'home',  dataUri: build('#7B3F00', '#fff',    G.house) },
  { key: 'home-02',  category: 'home',  dataUri: build('#404040', '#fff',    G.key) },
  { key: 'home-03',  category: 'home',  dataUri: build('#2A2A2A', '#FFCC00', G.lock) },
];

if (PRESET_AVATARS.length !== 20) {
  // Sanity assertion at module load — caught in dev/CI.
  throw new Error('PRESET_AVATARS must contain exactly 20 entries.');
}

/**
 * Deterministic preset assignment per §5.5.3 — `presets[hash(identity_id) % 20]`.
 * Uses a simple FNV-1a 32-bit hash to keep this dependency-free.
 */
export function pickPresetForIdentity(identityId: string): PresetAvatar {
  const idx = fnv1a32(identityId) % PRESET_AVATARS.length;
  return PRESET_AVATARS[idx]!;
}

/** Find a preset by its stable key. Returns null if unknown. */
export function findPresetByKey(key: string): PresetAvatar | null {
  return PRESET_AVATARS.find((p) => p.key === key) ?? null;
}

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
