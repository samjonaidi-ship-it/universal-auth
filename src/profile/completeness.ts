// @bainbridgebuilders/universal-auth | src/profile/completeness.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Per-persona profile completeness scoring (§5.4.3).
//
// Weighting:
//   required    = 60% of total
//   recommended = 30%
//   optional    = 10%
//
// Hard cap: if ANY required field is missing, score cannot exceed 59.
// Server is the source of truth — this function is the local mirror so
// `<ProfileCompletenessBar>` can update optimistically while save() is in
// flight.

import type { UniversalProfile } from '../types/profile.js';

// ── Per-persona field rosters (mirror of §5.4.3 table) ────────────────────

export interface PersonaFieldRoster {
  required: readonly string[];
  recommended: readonly string[];
  optional: readonly string[];
}

export const PERSONA_FIELD_ROSTERS: Record<string, PersonaFieldRoster> = {
  crew: {
    required: ['display_name', 'email', 'phone_e164', 'emergency_contact'],
    recommended: ['avatar', 'persona_extensions.crew.trade'],
    optional: ['timezone'],
  },
  supplier: {
    required: ['display_name', 'email', 'phone_e164', 'persona_extensions.supplier.company'],
    recommended: ['avatar', 'persona_extensions.supplier.territory', 'persona_extensions.supplier.net_terms'],
    optional: [],
  },
  client: {
    required: ['display_name', 'email', 'phone_e164', 'persona_extensions.client.property_address'],
    recommended: ['avatar', 'persona_extensions.client.preferred_contact'],
    optional: [],
  },
  architect: {
    required: [
      'display_name',
      'email',
      'phone_e164',
      'persona_extensions.architect.firm',
      'persona_extensions.architect.license_number',
    ],
    recommended: ['avatar', 'emergency_contact'],
    optional: [],
  },
  subcontractor: {
    required: [
      'display_name',
      'email',
      'phone_e164',
      'persona_extensions.subcontractor.company',
      'persona_extensions.subcontractor.specialty',
      'emergency_contact',
    ],
    recommended: ['avatar'],
    optional: [],
  },
  admin: {
    required: ['display_name', 'email', 'phone_e164'],
    recommended: ['avatar'],
    optional: ['emergency_contact'],
  },
};

// ── Scoring ───────────────────────────────────────────────────────────────

export interface CompletenessResult {
  score: number;                     // 0..100 (integer)
  missingRequired: readonly string[];
  missingRecommended: readonly string[];
  missingOptional: readonly string[];
}

/**
 * Compute completeness for a profile under a given persona's roster.
 * If the persona is unknown, returns a 100% score against the empty roster
 * (server is authoritative; this is just a defensive fallback).
 */
export function computeCompleteness(
  profile: UniversalProfile,
  persona: string
): CompletenessResult {
  const roster = PERSONA_FIELD_ROSTERS[persona];
  if (roster === undefined) {
    return { score: 100, missingRequired: [], missingRecommended: [], missingOptional: [] };
  }

  const missingRequired = roster.required.filter((f) => !hasValue(profile, f));
  const missingRecommended = roster.recommended.filter((f) => !hasValue(profile, f));
  const missingOptional = roster.optional.filter((f) => !hasValue(profile, f));

  const reqDone = roster.required.length - missingRequired.length;
  const recDone = roster.recommended.length - missingRecommended.length;
  const optDone = roster.optional.length - missingOptional.length;

  const reqRatio = roster.required.length === 0 ? 1 : reqDone / roster.required.length;
  const recRatio = roster.recommended.length === 0 ? 1 : recDone / roster.recommended.length;
  const optRatio = roster.optional.length === 0 ? 1 : optDone / roster.optional.length;

  let score = Math.round(reqRatio * 60 + recRatio * 30 + optRatio * 10);

  // Hard cap at 59 if any required field is missing
  if (missingRequired.length > 0 && score > 59) {
    score = 59;
  }

  return {
    score,
    missingRequired,
    missingRecommended,
    missingOptional,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function hasValue(profile: UniversalProfile, fieldKey: string): boolean {
  // 'avatar' is a synthetic key meaning "any avatar tier set"
  if (fieldKey === 'avatar') {
    return (
      (profile.avatar_url !== undefined && profile.avatar_url !== '') ||
      (profile.avatar_preset !== undefined && profile.avatar_preset !== '')
    );
  }
  // 'emergency_contact' is required when the entire object exists with valid bits
  if (fieldKey === 'emergency_contact') {
    const ec = profile.emergency_contact;
    return (
      ec !== undefined &&
      ec.name.length > 0 &&
      ec.phone_e164.length > 0 &&
      ec.relationship.length > 0
    );
  }
  // Dot-path lookup for nested keys (persona_extensions.crew.trade etc.)
  const parts = fieldKey.split('.');
  let cur: unknown = profile;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === null || cur === undefined) return false;
  if (typeof cur === 'string') return cur.length > 0;
  return true;
}
