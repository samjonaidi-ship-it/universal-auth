# Audit Report A5 — RC Readiness — `@bainbridgebuilders/universal-auth`

## Audit metadata

- **Phase:** A5
- **Topic:** RC publish readiness — Block 6 (test hardening) complete; gates `1.0.0-rc.1` to GitHub Packages
- **Date:** 2026-04-28
- **Auditor:** Claude (Sonnet) as implementation-owner
- **Reviewer:** Sam Jonaidi (sign-off pending)
- **Block gated:** Block 7 Day 23 (`npm publish --provenance`)
- **Branch:** `main` @ `bf84d94` (post-merge of Days 18-19, 20-21, 22)
- **Authoritative spec:** `BB_UNIVERSAL_AUTH_SDK_SPEC.md v1.4.2` — primarily §7.1 (perf), §11 (testing), §12 (bundle + observability), §15 (security)
- **Primary plan reference:** `purring-sleeping-hanrahan.md` Block 6 + `### 🔎 AUDIT A5 — RC readiness (Day 22 end)`

---

## Gates — §11.11 canonical 9 + 3 plan additions

| # | Gate | Status | Evidence |
|---|---|---|---|
| 1 | All unit tests green (90%+ coverage) | ⚠️ partial | **Tests:** 261/261 pass across 46 files (3 consecutive runs). **Coverage:** 76.55% lines / 79.56% branches / 78.81% functions / 76.55% statements. **Below the spec §11 target** of 90%/85%. The Block 6 Day 16-17 push raised coverage from 56.89% → 76.51%; reaching 90% requires ~14 more test files (notably: `<PersonaFieldsForm>` 29% / `<AvatarPicker>` 65% / `core/storage-crypto.ts` 0% / SW + types 0%). Pre-publish remediation: either accept the gap as a documented v1.0-rc.1 carry-forward (with target for v1.0 GA), or stretch Block 6 to land 14 more test files. **Decision needed from Sam.** |
| 2 | All integration tests green | ✓ infra-ready, ⏳ live-run | 8 integration test files exist in `test/integration/` (signup→refresh→revoke, passkey ceremony, offline queue flush, event batching, entitlement cache, settings 409, impersonation audit, revoke-all cascades). `vitest.integration.config.ts` + `test/integration/docker-compose.test.yml` (postgres + ct-bff + twilio-mock + resend-mock) wired. **Live-run gate** requires Docker Desktop and CT BFF migrations 046-058 applied to dev Neon. Sam's local + nightly chaos.yml CI both available. |
| 3 | All browser-matrix tests green (12 configs) | ✓ infra-ready, ⏳ live-run | `playwright.config.ts` declares 12 projects (chrome/firefox/webkit/edge × desktop/mobile/tablet). 5 specs in `test/browser/` (sign-in, passkey CDP virtual authenticator, multi-tab BroadcastChannel, 9-consent gate, axe-core WCAG 2.2 AA). **Live-run** requires the demo deployed at `auth-sdk-demo.bainbridgebuilders.com` (gate #7) — which lands in Block 7. Browser specs reference seeded users via `X-Test-Mode-Key` header. |
| 4 | Chaos suite passes (zero data loss, zero stuck sessions across 7 scenarios) | ✓ infra-ready, ⏳ live-run | 7 chaos test files in `test/chaos/` matching spec §11.6 1:1 (connection drop, 5xx burst, ±1h clock skew, IDB unavailable, multi-tab race, tab crash restore, SW blocked). `docker-compose.chaos.yml` overlay adds `ghcr.io/shopify/toxiproxy:2.9.0` on port 13300 fronting CT BFF. `test/chaos/toxics.ts` typed wrapper for all 7 toxic types. **Live-run** wired into nightly `.github/workflows/chaos.yml`. |
| 5 | Performance budget met | ✓ | **Bundle (size-limit):** core 11.78/40 KB, passkey 7.88/10 KB, sw 0.43/5 KB — all within budget with healthy headroom (§12.1). **Cold-start** (`test/perf/cold-start.ts`): 18.84 ms throttled (3× Moto G Power) vs ≤ 50 ms budget (§7.1). **Token refresh / memory heap budgets:** asserted via memory soak; full Lighthouse score gate (≥ 90) requires demo deploy (gate #7) and runs in browser CI alongside browser matrix. |
| 6 | Security audit clean | ✓ | **`pnpm audit --prod --audit-level=high`:** 0 vulnerabilities. **`scripts/verify-no-jose.ts`:** prod dep tree clean (no jose/lodash/axios/zustand/moment/date-fns per spec Appendix B). **6 security test files / 18 tests** in `test/security/` cover: fast-check fuzzing, timing-attack regression, token storage hygiene, IDB tamper, CSRF headers, token replay. All pass in ~2.5s. **Manual review** by Sam: pending. |
| 7 | Demo deployed + working end-to-end at `auth-sdk-demo.bainbridgebuilders.com` | ⏳ Block 7 | Demo source ships in `demo/` (Vite + React kitchen sink). Railway deploy workflow at `.github/workflows/demo-deploy.yml`. **Deploy is Sam's task** — slated for Block 7 Day 23 alongside RC publish. Browser-matrix and Lighthouse gates depend on this. |
| 8 | Manual QA runbook complete (14 explicit + 40 expanded scenarios) | ⏳ partial | Per plan: 14 explicit scenarios are the canonical floor; 40-scenario expansion documented. **Status:** explicit scenarios mapped to integration + browser test files (gates 2 + 3). `docs/QA_RUNBOOK.md` not yet authored — pending Sam writeup before A5 sign-off OR can be back-filled in Block 7 alongside demo deploy. |
| 9 | Published to GitHub Packages as `@bainbridgebuilders/universal-auth@1.0.0-rc.1` (`npm publish --provenance` per §15.1) | ⏳ Day 23 | This is the gate downstream of A5 sign-off. `package.json` has `"version": "1.0.0-rc.1"` + `publishConfig.registry: https://npm.pkg.github.com` + `access: restricted`. `scripts/release.ts` invokes `npm publish --provenance`. Day 23 fires after A5 ✓. |
| 10 | Threat model doc `docs/THREAT_MODEL.md` — every §15.3 threat mapped to SDK defense + test citation | ⏳ pending | Plan addition (not §11.11). **Status:** doc not yet authored. STRIDE matrix exists in spec §15.3. Recommended scope: 1-2 page doc cross-referencing each threat to (a) the SDK code path that defends, (b) the security test that regresses. Can be authored in 1-2 hours by reading §15.3 + scripts/verify-bundle.ts + test/security/. |
| 11 | Contract tests green — SDK Pact files verified by CT BFF CI | ⚠️ partial | `test/contract/setup.ts` + `test/contract/auth-endpoints.contract.test.ts` produce `pacts/` JSON for 2 interactions (`POST /auth/v1/code/request` + `POST /auth/v1/code/verify`). **Plan implies more interactions** (full §3.1-3.5 surface) — currently 2/N where N depends on coverage interpretation. **Verifier-side gate** requires CT BFF CI job to consume `pacts/` artifact and run `pact-broker verify` — that lands in `BainbridgeBuilders/control-tower` repo, separate from this SDK. Per Risk R13: extrapolated dependency, coordination needed. |
| 12 | CalExp5 migration runbook drafted in `docs/INTEGRATION_GUIDE.md` | ⏳ pending | Plan addition. **Status:** doc not yet authored. Plan §13.3 / §13.5.2 in spec spell out the 5-day cutover. Recommended scope: 8-section guide per plan (npm install + scope auth, app_id registration, preconnect, CSP, cookie domain override, feature flag, rollback playbook, observability hookup). Can be authored in 2-3 hours. |

---

## Verification commands run on `main @ bf84d94`

```
pnpm install --frozen-lockfile     ✓ (3.6s)
pnpm typecheck                      ✓ tsc --noEmit clean
pnpm lint                           ✓ eslint clean
pnpm build                          ✓ esbuild ESM + tsc dts
pnpm size-check                     ✓ core 11.78/40 KB, passkey 7.88/10 KB, sw 0.43/5 KB
pnpm verify:bundle                  ✓ sideEffects:false, no inline scripts/eval/Function
pnpm verify:watermarks              ✓ all source files carry BB watermark
pnpm verify:no-jose                 ✓ prod dep tree clean
pnpm audit --prod --audit-level=high ✓ 0 vulnerabilities
pnpm test:unit                      ✓ 46 files / 261 tests / 76.55% lines coverage
pnpm test:security                  ✓ 6 files / 18 tests / 2.5s
pnpm test:perf                      ✓ cold-start 18.84 ms throttled vs 50 ms budget
pnpm test:memory (5s smoke)         ✓ 220+ cycles, no deadlock
```

Live-stack gates (integration / chaos / browser) require Docker Desktop + CT BFF dev branch + demo deploy and are listed as ⏳ live-run pending Block 7 infra.

---

## Findings

### Pass ✓

- **Test infrastructure is comprehensive.** Every `test/<kind>/` directory is wired with a vitest or playwright config. Unit / integration / contract / chaos / security / memory / perf / browser — 8 distinct test surfaces, each independently runnable, each with appropriate isolation (single-fork where state is shared, parallel where not).
- **CI matrix expansion landed cleanly.** `.github/workflows/ci.yml` now has `build` + `perf` + `security` + `memory-quick` parallel jobs. Heavy suites (24h soak, full Toxiproxy chaos via docker-compose) live in `chaos.yml` nightly + manual `workflow_dispatch`.
- **Bundle budgets have margin.** Core is at 29% of its 40 KB cap; passkey at 79%; SW at 9%. Plenty of headroom for Block 7 demo expansion + future v1.1 features without breaching `§12.1` budgets.
- **Cold-start performance is exemplary.** 18.84 ms throttled = 38% of the 50 ms budget. Even on a bottom-tier device with 3× CPU throttle, the SDK loads in ~½ a frame.
- **Security defense-in-depth is present.** Token storage hygiene asserted at runtime (no plaintext tokens in localStorage / sessionStorage / window / IDB). IDB tamper test corrupts AES-GCM auth tags and verifies `getAccessToken()` returns null without crashing or falling back to plaintext. CSRF headers enforced on every mutation. Token replay defense end-to-end.
- **Spec compliance citations present in every CHANGELOG entry.** Block 6 days 16/17, 18/19, 20/21, and 22 all carry §-references to the locked spec sections, making this audit's gate-by-gate cross-walk trivially verifiable.

### Issues / decisions for Sam

| # | Item | Severity | Recommended action |
|---|---|---|---|
| F1 | Coverage at 76.55% vs 90% spec target | Medium | **Recommended:** accept as v1.0-rc.1 carry-forward, stretch toward 90% before v1.0 GA tag (Block 7 + a small Block 8 of test gap-filling). Document in `RELEASE_NOTES.md` for `1.0.0-rc.1`. Alternative: spend 2-3 days now to land 14 more test files. |
| F2 | `docs/THREAT_MODEL.md` not yet authored | Medium | Author before A5 sign-off (1-2 hrs). Cross-walk §15.3 STRIDE matrix to SDK defense + test citation. |
| F3 | `docs/INTEGRATION_GUIDE.md` not yet authored | Medium | Author before Block 7 Day 24 (2-3 hrs). 8-section guide. Block 7 Day 24 is when CalExp5 starts integration; guide is the prerequisite. |
| F4 | `docs/QA_RUNBOOK.md` not yet authored | Low | Author in Block 7 Day 23 alongside demo deploy. The 14 explicit scenarios are already covered by integration + browser tests; runbook is the human-facing checklist. |
| F5 | Pact contract surface 2/N (only 2 interactions) | Low | Block 7 Day 23 expand to cover full §3.1-3.5 surface (estimated 8-12 interactions). Coordinate with CT BFF CI verifier wiring (Risk R13). |
| F6 | Live-run integration / chaos / browser gates not yet executed | Medium | All require either Docker Desktop locally OR CI runner. Block 7 Day 23 fires the full nightly `chaos.yml` once on demand to capture green run as A5 evidence. |
| F7 | Coverage drop spuriously caused by sibling worktrees | Resolved | Fixed in commit `bf84d94` — `vitest.config.ts` excludes `.claude/**` from coverage scan. Confirmed: 76.55% (matches Block 6 Day 16-17 baseline). |

### Out of scope for A5 (deferred to A6)

- CalExp5 line delta `−1,800 / +200` (A6 gate #1 — measured during Block 7 Day 25 cutover)
- 24h soak Sentry baseline + production token-on-disk grep (A6 gates #3 + #8 — measured in Block 7 Day 27 24h window)
- Spec Appendix D Security + Legal sign-off (A6 gate #13)

---

## Recommendation

**Conditional ✓ for A5 — proceed to Block 7 Day 23 RC publish on the following conditions:**

1. **F1 coverage gap:** Sam decides one of:
   - (a) Accept 76.55% as the rc.1 baseline (documented in `RELEASE_NOTES.md`), OR
   - (b) Land 14 more test files before Day 23 publish.
2. **F2 + F3 docs:** `docs/THREAT_MODEL.md` and `docs/INTEGRATION_GUIDE.md` authored before Day 24 (CalExp5 starts integrating). Day 23 RC publish does not strictly need them; Day 24 does.
3. **F6 live-run gates:** A single green nightly `chaos.yml` run captured before Day 23 RC publish (manual `workflow_dispatch`). Browser-matrix gate fires when demo lands on Day 23.

If those three conditions are accepted, **`1.0.0-rc.1` ready to publish.**

---

## Sign-off

- [ ] Sam Jonaidi — accepts F1 decision: ☐ (a) 76.55% as baseline / ☐ (b) defer publish
- [ ] Sam Jonaidi — confirms F2 + F3 docs authored or scheduled
- [ ] Sam Jonaidi — confirms F6 live-run captured

Once Sam signs above, Day 23 fires:
1. `pnpm release` → `npm publish @bainbridgebuilders/universal-auth@1.0.0-rc.1 --provenance`
2. Manual QA runbook execution against deployed demo
3. Tag `v1.0.0-rc.1` on `main`, GitHub release with auto-generated notes

Next audit: **A6 Production Readiness** (Day 27 + 24h soak — gates `1.0.0` GA tag).
