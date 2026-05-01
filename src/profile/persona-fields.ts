// @bainbridgebuilders/universal-auth | src/profile/persona-fields.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Server-driven persona-fields registry per §5.4.6.
//
// New personas / new fields don't need an SDK version bump — the SDK fetches
// the registry at app init and caches 1 hour client-side. Apps render
// `<PersonaFieldsForm persona="crew" />` which reads from this cache.
//
// Server endpoint: GET /identity/v1/persona-fields-registry (NEW v1.0)
// (Distinct from /auth/v1/persona-registry which is the persona TYPE list.)

import { get } from '../core/client.js';

const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour per §5.4.6

// ── Registry shape ────────────────────────────────────────────────────────

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'select'
  | 'multiselect'
  | 'textarea'
  | 'address'
  | 'date';

export interface FieldDefinition {
  type: FieldType;
  label?: string;
  /** For select/multiselect. */
  options?: readonly string[];
  /** UI hint — e.g., 'sms-friendly', 'last-4-of-license'. */
  hint?: string;
  /** Regex string applied client-side; server enforces canonical version. */
  pattern?: string;
}

export interface PersonaFieldRosterFromServer {
  required: readonly string[];
  recommended: readonly string[];
  optional: readonly string[];
  /** Per-field UI definition (key path → definition). */
  fields: Record<string, FieldDefinition>;
}

export interface PersonaFieldsRegistry {
  version: number;
  personas: Record<string, PersonaFieldRosterFromServer>;
}

// ── Cache ─────────────────────────────────────────────────────────────────

interface Cache {
  data: PersonaFieldsRegistry;
  fetchedAt: number;
}

let cache: Cache | null = null;
let inFlight: Promise<PersonaFieldsRegistry> | null = null;

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Fetch the persona-fields registry. Returns from cache if within 1h TTL.
 * Concurrent calls coalesce on the in-flight request.
 */
export async function getPersonaFieldsRegistry(): Promise<PersonaFieldsRegistry> {
  if (cache !== null && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inFlight !== null) return inFlight;

  inFlight = (async () => {
    try {
      const { data } = await get<PersonaFieldsRegistry>('/identity/v1/persona-fields-registry');
      cache = { data, fetchedAt: Date.now() };
      return data;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Get the field roster for one persona, or null if unknown. */
export async function getPersonaRoster(
  persona: string
): Promise<PersonaFieldRosterFromServer | null> {
  const reg = await getPersonaFieldsRegistry();
  return reg.personas[persona] ?? null;
}

/** Test-only reset. */
export function __resetPersonaFieldsForTests(): void {
  cache = null;
  inFlight = null;
}
