// @bainbridgebuilders/universal-auth | src/types/api.ts | v1.0.1 | 2026-05-01 | BB
// v1 HTTP request/response + session types per §3 + §D2.1.
//
// Day 1: top-level shape stubs. Day 3-4 (Block 2) fleshes out every request/response.

/** `identity_kind` enum per D11 / §D2.1. */
export type IdentityKind = 'human' | 'device' | 'service' | 'external_app' | 'agent';

/** Persona entry in the multi-persona session per D8 / §D2.1. */
export interface Persona {
  persona_type: string;       // 'crew' | 'supplier' | 'client' | 'architect' | 'subcontractor' | 'admin' | ...
  party_id: string;
  party_name: string;
  role_in_party: string;
  ct_role: string | null;
  plan_slug: string;
  subscription_status: string;
  landing_route: string;      // from persona_registry
}

/** Agent-session augmentation per D13 / §D2.2. */
export interface AgentContext {
  class: string;              // e.g., 'buddy'
  tier: 1 | 2 | 3;
  version: string;
  disclosure_text: string;
  outbound_policy: 'disabled' | 'draft_only' | 'approval_required' | 'auto_send';
  acting_on_behalf_of: string | null;
  on_behalf_of_persona: string | null;
}

/** Feature/capability/app-access aggregate per §D2.1. */
export interface Entitlements {
  features: readonly string[];
  app_access: readonly string[];
  // Details populated Block 3 Day 5-6 per core/entitlements.ts
}

/** Canonical identity shape returned from `/auth/v1/me`. */
export interface Identity {
  identity_id: string;
  identity_kind: IdentityKind;
  display_name: string;
  /**
   * D14 integration — PROPOSED, not yet locked in SDK spec.
   * See plan Decision #19: surfaces `employee_id` when `identity_kind='human' && persona_type='crew'`.
   * CT BFF must populate; null otherwise.
   */
  employee_id?: string | null;
}

/** Session metadata per §D2.1. Populated Block 2 Day 3. */
export interface SessionMeta {
  session_id: string;
  issued_at: string;         // ISO
  expires_at: string;        // ISO
}

/** Full session payload returned from `/auth/v1/me` per §D2.1. */
export interface Session {
  identity: Identity;
  primary_persona?: string;  // D8 — not present for agents
  personas?: readonly Persona[];  // D8 — not present for agents
  agent?: AgentContext;      // D13 — present only when identity_kind='agent'
  aggregate: Entitlements;
  session_meta: SessionMeta;
}
