// @bb/universal-auth | src/index.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Public barrel — named exports only (tree-shakeable per §8.2 L830).
// Day 1: stubs only. Day 2+ fills in implementations per plan Block 1-5.

export type { UniversalAuthConfig } from './config.js';
export { initUniversalAuth } from './config.js';

// Imperative (non-React) entry point per §5.3 L403
export { getAuth } from './imperative/getAuth.js';

// Error classes per §3.7 L247 (17 total — populated Day 2 per plan Block 1 Day 2)
export * from './errors.js';

// Public types per §types/ (populated across Block 2-5)
export type { Session, Identity, Persona, Entitlements } from './types/api.js';
export type { UniversalProfile } from './types/profile.js';
