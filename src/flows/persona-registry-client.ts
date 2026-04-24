// @bb/universal-auth | src/flows/persona-registry-client.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Client for GET /auth/v1/persona-registry with 1-hour in-memory cache.
//
// Source of truth is `ct_bff.persona_registry` (D6). This client caches
// the current version for UI mapping (persona_type → landing_route +
// display_name + description). Invalidates on server version bump.

import { get } from '../core/client.js';

const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour per §D2.6

export interface PersonaRegistryEntry {
  persona_type: string;
  display_name: string;
  description: string;
  landing_route: string;
  required_consents: readonly string[];
  consent_audience: string;
  order: number;
  active: boolean;
}

interface RegistryResponse {
  version: number;
  entries: readonly PersonaRegistryEntry[];
}

interface Cache {
  data: RegistryResponse;
  fetchedAt: number;
}

let cache: Cache | null = null;
let inFlight: Promise<RegistryResponse> | null = null;

export async function getPersonaRegistry(): Promise<RegistryResponse> {
  if (cache !== null && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  if (inFlight !== null) return inFlight;

  inFlight = (async () => {
    try {
      const { data } = await get<RegistryResponse>('/auth/v1/persona-registry');
      cache = { data, fetchedAt: Date.now() };
      return data;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Find one entry by persona_type, or null if unknown.
 */
export async function lookupPersona(
  personaType: string
): Promise<PersonaRegistryEntry | null> {
  const reg = await getPersonaRegistry();
  return reg.entries.find((e) => e.persona_type === personaType) ?? null;
}

export function __resetPersonaRegistryForTests(): void {
  cache = null;
  inFlight = null;
}
