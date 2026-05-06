// @samjonaidi-ship-it/universal-auth | src/core/dpop/index.ts | v0.1.0 | 2026-05-06 | BB
// Barrel export — the SDK-side DPoP foundation per DPOP_DESIGN_v1.0.md §5.

export {
  generateAndStoreKeypair,
  loadKeypair,
  getOrCreateKeypair,
  deleteKeypair,
} from './keypair.js';

export { jwkThumbprint, base64UrlEncode, DpopThumbprintError } from './thumbprint.js';

export { buildDpopProof, type BuildDpopProofInput } from './proof.js';

export { recordNonce, consumeNonce } from './nonce-cache.js';
