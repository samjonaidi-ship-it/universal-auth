// @bainbridgebuilders/universal-auth | test/unit/profile/avatar.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB

import { describe, it, expect } from 'vitest';
import {
  generateInitials,
  pickInitialsColor,
  resolveAvatar,
  INITIALS_COLORS,
} from '../../../src/profile/avatar.js';
import type { UniversalProfile } from '../../../src/types/profile.js';

const baseProfile: UniversalProfile = {
  identity_id: 'sam-1',
  display_name: 'Sam Jonaidi',
  email: 'sam@example.com',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 100,
  missing_required_fields: [],
  last_updated_at: new Date().toISOString(),
  profile_version: 1,
};

describe('profile/avatar — generateInitials', () => {
  it('two-word name returns first letters of first + last', () => {
    expect(generateInitials('Sam Jonaidi')).toBe('SJ');
  });
  it('single-word name returns first 2 chars uppercased', () => {
    expect(generateInitials('madonna')).toBe('MA');
  });
  it('handles all-caps gracefully', () => {
    expect(generateInitials('MISTER X')).toBe('MX');
  });
  it('empty / whitespace returns ?? sentinel', () => {
    expect(generateInitials('')).toBe('??');
    expect(generateInitials('   ')).toBe('??');
  });
  it('three+ words uses first and last only', () => {
    expect(generateInitials('Mary Jane Watson')).toBe('MW');
  });
});

describe('profile/avatar — pickInitialsColor', () => {
  it('returns a hex from the 6-color palette', () => {
    const c = pickInitialsColor('sam-1');
    expect(INITIALS_COLORS).toContain(c);
  });

  it('is deterministic for the same identity_id', () => {
    expect(pickInitialsColor('sam-1')).toBe(pickInitialsColor('sam-1'));
  });
});

describe('profile/avatar — resolveAvatar (3-tier fallback §5.4.4)', () => {
  it('tier 1: uses avatar_url when present', () => {
    const r = resolveAvatar({
      ...baseProfile,
      avatar_url: 'https://r2.example/sam.jpg',
    });
    expect(r.kind).toBe('url');
    if (r.kind === 'url') expect(r.src).toBe('https://r2.example/sam.jpg');
  });

  it('tier 2: uses preset SVG when avatar_url missing but avatar_preset set', () => {
    const r = resolveAvatar({
      ...baseProfile,
      avatar_preset: 'crew-01',
    });
    expect(r.kind).toBe('preset');
    if (r.kind === 'preset') expect(r.presetKey).toBe('crew-01');
  });

  it('tier 3: falls back to initials when neither avatar_url nor avatar_preset set', () => {
    const r = resolveAvatar(baseProfile);
    expect(r.kind).toBe('initials');
    if (r.kind === 'initials') {
      expect(r.initials).toBe('SJ');
      expect(r.color).toBe('#C8102E');
    }
  });

  it('falls back to deterministic preset when avatar_preset key is unknown', () => {
    const r = resolveAvatar({
      ...baseProfile,
      avatar_preset: 'this-is-not-a-real-preset',
    });
    expect(r.kind).toBe('preset');
  });
});
