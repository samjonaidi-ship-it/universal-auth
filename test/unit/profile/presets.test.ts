// @bainbridgebuilders/universal-auth | test/unit/profile/presets.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB

import { describe, it, expect } from 'vitest';
import {
  PRESET_AVATARS,
  pickPresetForIdentity,
  findPresetByKey,
} from '../../../src/profile/presets.js';

describe('profile/presets', () => {
  it('exports exactly 20 preset avatars (§5.4.4)', () => {
    expect(PRESET_AVATARS).toHaveLength(20);
  });

  it('every preset has a unique key', () => {
    const keys = PRESET_AVATARS.map((p) => p.key);
    expect(new Set(keys).size).toBe(20);
  });

  it('every preset has a data URI starting with data:image/svg+xml', () => {
    for (const p of PRESET_AVATARS) {
      expect(p.dataUri).toMatch(/^data:image\/svg\+xml;utf8,/);
    }
  });

  it('pickPresetForIdentity is deterministic', () => {
    const a1 = pickPresetForIdentity('sam-uuid-1');
    const a2 = pickPresetForIdentity('sam-uuid-1');
    expect(a1.key).toBe(a2.key);
  });

  it('pickPresetForIdentity distributes across the 20 presets for varied input', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(pickPresetForIdentity(`identity-${i}`).key);
    }
    // Birthday-like; with 200 inputs over 20 buckets we expect all 20 hit
    expect(seen.size).toBe(20);
  });

  it('findPresetByKey returns null for unknown key', () => {
    expect(findPresetByKey('does-not-exist')).toBeNull();
  });

  it('findPresetByKey resolves a known key', () => {
    expect(findPresetByKey('crew-01')?.key).toBe('crew-01');
  });
});
