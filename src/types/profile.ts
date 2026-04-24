// @bb/universal-auth | src/types/profile.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// UniversalProfile per §5.4.1 L422-L457.

export interface EmergencyContact {
  name: string;
  phone_e164: string;
  relationship: string;
}

export interface PersonaExtensions {
  crew?: {
    qbt_user_id?: string;
    trade?: string;
    primary_crew_id?: string;
  };
  supplier?: {
    company?: string;
    net_terms?: string;
    territory?: string;
  };
  client?: {
    property_address?: string;
    preferred_contact?: 'sms' | 'email';
  };
  architect?: {
    firm?: string;
    license_number?: string;
  };
  subcontractor?: {
    company?: string;
    specialty?: string;
  };
}

/**
 * Universal profile contract — every consumer app receives this shape.
 * Per §5.4.1 L422-L457.
 */
export interface UniversalProfile {
  identity_id: string;
  display_name: string;
  email: string;
  phone_e164?: string;
  locale: string;                      // 'en-US'
  timezone: string;                    // 'America/Los_Angeles'

  // 3-tier avatar fallback per §5.4.4 L510
  avatar_url?: string;                 // tier 1: R2-hosted upload
  avatar_preset?: string;              // tier 2: one of 20 preset SVG keys
  initials_color: string;              // tier 3: deterministic hex from hash(identity_id)

  emergency_contact?: EmergencyContact; // required for crew / sub / architect

  persona_extensions: PersonaExtensions;

  completeness_score: number;          // 0-100 per §5.4.3
  missing_required_fields: readonly string[];
  last_updated_at: string;             // ISO
  profile_version: number;             // optimistic-lock for PUT
}
