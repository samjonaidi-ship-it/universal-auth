# Changelog

All notable changes to `@bainbridgebuilders/universal-auth` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/spec/v2.0.0.html) per SDK spec §14.

Citation convention: section-only (`§3.7`, `§D2.1`, `Appendix B`). Spec line numbers drift on every version bump; section numbers are stable.

## [Unreleased — targeting 1.0.0-rc.1]

### A1 audit sign-off (2026-04-24)
- **Web Crypto → Web Worker** (§8.2): new `src/core/crypto-worker.ts` (DedicatedWorker with `self.importScripts` assertion on load, CryptoKey cache keyed by device input, message-based encrypt/decrypt/clearKeyCache); new `src/core/crypto-client.ts` (main-thread proxy to worker via `new Worker(new URL('./crypto-worker.js', import.meta.url), { type: 'module' })` with pure-crypto fallback for SSR/test); new `src/core/storage-crypto.ts` (pure PBKDF2 + AES-256-GCM primitives shared by worker and fallback)
- **Unit tests — 77 passing across 6 files** covering A1 gates #4, #5, #6, #10: mutex-coalesced refresh (5 concurrent → 1 call), 17 typed error classes + envelope factory, 3 mode-safety negative tests, device-id determinism, encrypt/decrypt round-trip + IV uniqueness + tamper fail, client headers + URL join + error mapping + 401 refresh-retry
- **Citation convention migration**: stripped SDK spec `L<n>` line numbers from 57 citations across code + audit report (drift after v1.4.0→v1.4.1 spec bump); section-only citations from here forward
- **Test infrastructure**: vitest config with `environment: 'happy-dom'`, `test/unit/setup.ts` with `fake-indexeddb/auto` + Node 25 `localStorage` shim (Node 25 ships broken stub unless `--localstorage-file` CLI arg) + BroadcastChannel stub
- **ESLint flat-config migration** (ESLint 9): `.eslintrc.cjs` → `eslint.config.js`; split config (typed for src/test, untyped for scripts); strict rules per plan CI/CD step 2
- **Bundle delta** (post-A1): core 5.51 KB / 40 KB (86% headroom), passkey 104 B / 10 KB, sw 13 B / 5 KB
- **Audit report**: `audits/A1_core_modules_2026-04-24.md` — 11 gates passed + 1 conditional on coverage (A2/A3 commitments attached)

### Block 2 Days 3-4 (2026-04-24)
- Core modules per spec §3 / §8 / §9 / §15:
  - `src/core/device-id.ts` — SHA-256(UA).hex.slice(0,32) with in-memory + optional localStorage cache; DPoP extension point for Phase 2 (§16.2)
  - `src/core/storage.ts` — encrypted IDB via `idb` wrapper; 4 stores (refresh_tokens, offline_queue, event_queue, dead_letter_queue); `toOwnedBytes()` shim for TS 5.5 BufferSource narrowing; graceful decryption failure
  - `src/core/token-manager.ts` — access in memory only (§15.1), encrypted refresh in IDB (§5.0 v1.4.0 — 90-day TTL); mutex-coalesced refresh (§8.2); BroadcastChannel cross-tab adoption (Shared Worker primary in A3+); session-change listener pattern; 30s refresh margin
  - `src/core/client.ts` — `X-Auth-Protocol-Version: v1` on every request; `Idempotency-Key` on mutations; Bearer auto-attach (opt-out via `anonymous:true`); 401 silent-refresh-retry; non-2xx → errorFromEnvelope typed throw; ETag 304 support
- `src/config.ts` — `initUniversalAuth()` wires `configureClient()` which registers the refresh callback into token-manager

### Block 1 Day 1 — Scaffold (2026-04-24)

- **Repository skeleton** per plan repo layout + SDK spec §4
  - `package.json` with production + dev deps per Appendix B; `sideEffects: false`; 3-subpath exports (root, `/react`, `/sw`)
  - `tsconfig.json` strict (ES2022, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`)
  - `.npmrc` for GitHub Packages under `@bainbridgebuilders` scope (renamed from `@bb` — `bb` GitHub user is taken by Benjamin Bock since 2008; GitHub Packages scope must match a claimable org namespace)
  - `.gitignore`, `README.md`, `docs/CHANGELOG.md`, `LICENSE` (proprietary)
- **Source stubs**
  - `src/index.ts` — public named-export barrel (no side effects)
  - `src/config.ts` — `UniversalAuthConfig` shape + `assertModeSafety` per §10.6
  - `src/errors.ts` — 17 typed error classes per §3.7 + §5.4.5 + v1.4.0 §3.4; `errorFromEnvelope()` factory; uses `no_app_registration` sub-code per plan Decision #20
  - `src/imperative/getAuth.ts` — non-React entry per §5.3 (stub)
  - `src/types/api.ts` — Session, Identity (incl. D14 `employee_id?: string | null` per plan Decision #19), Persona, Entitlements, AgentContext per §D2.1
  - `src/types/profile.ts` — UniversalProfile per §5.4.1
  - `src/react/index.ts`, `src/sw/index.ts`, `src/flows/passkey-flow.ts` — subpath reservations (lazy chunks in build)
- **Build + verification scripts** (all wired in CI)
  - `scripts/build.ts` — esbuild 5-entry split per §12.1; `tsc --emitDeclarationOnly` for `.d.ts`
  - `scripts/verify-bundle.ts` — `sideEffects:false` audit, no inline scripts, no barrel side effects
  - `scripts/verify-watermarks.ts` — CLAUDE.md §10 watermark enforcement on every `.ts`/`.tsx`
  - `scripts/verify-no-jose.ts` — forbids `jose`/`lodash`/`axios`/`zustand`/`moment`/`date-fns` in prod deps per §Appendix B
- **CI + release**
  - `.github/workflows/ci.yml` — lint + typecheck + test + build + size-check + 3 verify scripts + npm audit on every PR
  - `.github/workflows/release.yml` — `npm publish --provenance` on v* tag per §15.1
- **Docs + audits**
  - `docs/CHANGELOG.md` (this file), `audits/TEMPLATE.md` (A1-A6 blocking audit-phase template)

### Infrastructure & housekeeping
- GitHub repo: `BainbridgeBuilders/universal-auth` (private), transferred from `samjonaidi-ship-it` to the `BainbridgeBuilders` GitHub org when org was created
- CI pipeline debugged: YAML format quirk (multi-line `on:` trigger form rejected, flow-sequence form works); ESLint 9 flat-config migration; vitest `passWithNoTests` for scaffold-only commits
- `pnpm-lock.yaml` generated via `pnpm install --lockfile-only`; 460 packages resolved
