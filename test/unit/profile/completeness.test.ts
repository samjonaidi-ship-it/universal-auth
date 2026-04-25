// @bb/universal-auth | test/unit/profile/completeness.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB

import { describe, it, expect } from 'vitest';
import {
  computeCompleteness,
  PERSONA_FIELD_ROSTERS,
} from '../../../src/profile/completeness.js';
import type { UniversalProfile } from '../../../src/types/profile.js';

const empty: UniversalProfile = {
  identity_id: 'sam',
  display_name: '',
  email: '',
  locale: 'en-US',
  timezone: 'America/Los_Angeles',
  initials_color: '#C8102E',
  persona_extensions: {},
  completeness_score: 0,
  missing_required_fields: [],
  last_updated_at: new Date().toISOString(),
  profile_version: 1,
};

const fullCrew: UniversalProfile = {
  ...empty,
  display_name: 'Sam',
  email: 'sam@example.com',
  phone_e164: '+12065550123',
  emergency_contact: { name: 'Mom', phone_e164: '+12065550999', relationship: 'parent' },
  avatar_preset: 'crew-01',
  timezone: 'America/Los_Angeles',
  persona_extensions: { crew: { trade: 'carpenter' } },
};

describe('profile/completeness (§5.4.3)', () => {
  it('exports the canonical 6-persona roster', () => {
    expect(Object.keys(PERSONA_FIELD_ROSTERS)).toEqual(
      expect.arrayContaining(['crew', 'supplier', 'client', 'architect', 'subcontractor', 'admin'])
    );
  });

  it('crew with all fields filled scores 100', () => {
    const r = computeCompleteness(fullCrew, 'crew');
    expect(r.score).toBe(100);
    expect(r.missingRequired).toEqual([]);
  });

  it('crew with NO required field missing → cap at 59 enforced', () => {
    const noPhone = { ...fullCrew, phone_e164: undefined };
    const r = computeCompleteness(noPhone, 'crew');
    expect(r.score).toBeLessThanOrEqual(59);
    expect(r.missingRequired).toContain('phone_e164');
  });

  it('all required missing → low score', () => {
    const r = computeCompleteness(empty, 'crew');
    expect(r.score).toBeLessThanOrEqual(59);
    expect(r.missingRequired.length).toBeGreaterThan(0);
  });

  it('weighting: required=60% + recommended=30% + optional=10%', () => {
    // Crew: required 4 fields, recommended 2, optional 1 (timezone).
    // Have all required + 0 recommended + 0 optional → 60 + 0 + 0 = 60
    const onlyRequired: UniversalProfile = {
      ...empty,
      display_name: 'Sam',
      email: 'sam@x.com',
      phone_e164: '+12065550123',
      emergency_contact: { name: 'Mom', phone_e164: '+12065550999', relationship: 'parent' },
      timezone: '',  // strip optional
    };
    const r = computeCompleteness(onlyRequired, 'crew');
    expect(r.score).toBe(60);
  });

  it('admin requires only display_name + email + phone (no emergency_contact)', () => {
    const admin: UniversalProfile = {
      ...empty,
      display_name: 'Admin Sam',
      email: 'admin@bb.com',
      phone_e164: '+12065550000',
    };
    const r = computeCompleteness(admin, 'admin');
    expect(r.missingRequired).toEqual([]);
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it('unknown persona returns 100 (defensive fallback)', () => {
    const r = computeCompleteness(empty, 'martian');
    expect(r.score).toBe(100);
  });
});
