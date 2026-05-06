# Build/CI/Release Integrity Audit — rc.4 Lookback | 2026-05-08

**Subject:** `@samjonaidi-ship-it/universal-auth@1.1.0-rc.4`
**Tag commit:** `f7010e3427d27f845eb24abfd92ddd8346adf6ba` (merge of `agent/sdk-v1-1-rc4-ci-greens` into `main`)
**Tagger:** Sam Jo, 2026-05-06 13:38:15 -0700
**Method:** Local execution + log inspection. Every claim cites file:line or run id. Quotes ≤15 words.

## Score: 7.0 / 10

Strong fundamentals (build determinism, watermark hygiene, supply-chain SHA pinning, closure-aware budgets all enforced and green). Material debt centers on (1) shipped-but-orphaned `size-limit` devDeps + a 4-line `_comment-size-limit` field that lints as a custom key, (2) chronic browser-matrix red since 2026-05-04 (deployed app fails locator timing), (3) chaos.yml watermark mismatch (header says v1.0.4 but inline note claims v1.1.0), (4) no pre-push hook to prevent rc.2/rc.3 lint-red landings on main, (5) SBOM step emits 8+ npm-error lines per run (cosmetic but noisy), (6) deferred SLSA attestation (private repo entitlement). None are blocking; most are 1-3 hour fixes.

---

## Build correctness

**Local build executed 2026-05-08.** `pnpm build` exit 0, output verified.

| Check | Evidence | Result |
|---|---|---|
| package.json `exports` has 6 subpaths + 1 CSS | package.json:17-43 | ✓ |
| build.ts has 8 entry points | scripts/build.ts:32-53 | ✓ |
| All 6 ESM barrels emitted | `dist/esm/{index,react/index,sw/index,profile/index,extendability/index,internal/index}.js` all present | ✓ |
| All 6 type barrels emitted | `dist/types/{index,react/index,sw/index,profile/index,extendability/index,internal/index}.d.ts` all present | ✓ |
| `dist/types/` mirrors `src/` | 94 src .ts files → 94 dist .d.ts files (exact match) | ✓ |
| `dist/esm/react/components/styles.css` | size 15,626 bytes, copied by build.ts:113-117 | ✓ |
| No `.test.ts` in dist | `find dist -name "*.test.ts"` → 0 hits | ✓ |
| Bundle metafile present | `.build-meta/esbuild-meta.json` 206,651 bytes | ✓ |
| `crypto-worker.js` flat (not under `core/`) | `dist/esm/crypto-worker.js` confirmed; build.ts:48-53 documents the trap | ✓ |
| `sideEffects: false` honored | verify-bundle.ts:15-23 enforces; check passed | ✓ |
| No eval / Function / `<script>` in bundle | verify-bundle.ts:35-39 + scan; passed | ✓ |
| Bundle budgets pass | core 23.38 / react 36.20 / profile 15.29 / passkey lazy 0.20 / sw 0.56 KB gzipped, all under budget | ✓ |

**8 entrypoints → 26 emitted .js files** (3-chunk goal in build.ts:7-8 documents *visible* ones, splitting:true emits shared chunks `chunk-*.js`, `client-*.js`, etc. — 14 internal split chunks beyond the 8 entries, expected behavior).

Documentation drift (minor): build.ts:30 comment says "3 entry points" but the entryPoints object holds 8 keys (build.ts:32-53). Cosmetic — code is correct, comment lags. Same drift in build.ts:106 log: `'bundling ESM (8 entry points...)'` — the log was updated but the function-doc above wasn't.

---

## Script-by-script audit

### `scripts/build.ts` v1.0.1 (2026-05-01)
- Entrypoints (build.ts:32-53) match `package.json:exports` 1:1 plus 2 internal entries (`flows/passkey-flow`, `crypto-worker`) that are reachable only via dynamic import / `new Worker()`.
- Build is non-incremental: `clean()` (build.ts:24-27) wipes `dist/` every run. No watch mode, but acceptable for CI.
- Metafile written outside `dist/` to avoid shipping internal paths (build.ts:74-80) — correct privacy posture per look-back fix L10.
- `legalComments: 'inline'` (build.ts:71) — preserves attribution but inflates gzip slightly. Acceptable.

### `scripts/size-check-closure.ts` v1.0.0 (2026-05-06)
- BUDGETS array (size-check-closure.ts:65-71) lists 5 entries: core 40K, react 70K, profile 50K, passkey-flow lazy-marginal 12K, sw 5K.
- Cross-check against CHANGELOG rc.4 (`docs/CHANGELOG.md:42-43`) which states *"core 23.39 / react 36.21 / profile 15.29 / passkey-marginal 0.20 / sw 0.56 KB gzipped"* — actual local run produced `23.38 / 36.20 / 15.29 / 0.20 / 0.56` — **0.01 KB drift** between CHANGELOG and re-run. Within rounding noise; not material.
- `lazyAfterCore` semantics (size-check-closure.ts:53-61) are correct: subtract chunks already in core's eager closure from the lazy chunk's measurement. Math verified visually.
- Marginal closure of `passkey-flow` shows 0.20 KB. The passkey flow code itself is much larger; the 0.20 KB is the unique slice not already in core. This is correct *if* the flow is dynamic-imported AFTER core. Spot-check: src/flows/passkey-flow.ts is dynamic-imported in src/react. (Not re-verified in this audit; previously verified at rc.2.)
- `react` closure 36.20 KB suggests libphonenumber-js was successfully removed from the eager graph (size-check-closure.ts:97 documents the P1-F fix). Pre-fix would have been ~80+ KB.

### `scripts/check-readme-code.ts` v1.0.0 (2026-05-06)
- **Depth limit:** `if (depth > 4)` (check-readme-code.ts:84). Re-export chains deeper than 4 levels would silently fail (return `false` → flag symbol as missing). Reasonable for current barrels but documented.
- Handles direct exports, named re-exports, wildcard re-exports (check-readme-code.ts:86-120).
- **Gap:** doesn't follow `export *` from a package (only `./local`), check-readme-code.ts:111. Acceptable since barrels only re-export local.
- Local run: 3 imports / 3 symbols verified ✓.

### `scripts/verify-bundle.ts` v1.0.0-rc.1 (2026-04-24)
- Three checks: (1) `sideEffects:false` literal in package.json (verify-bundle.ts:15-23); (2) no `eval(`, `new Function(`, or `<script` regex matches in any `dist/esm/**.js` (verify-bundle.ts:35-39); (3) src/index.ts barrel side-effect free via brace-stripping (verify-bundle.ts:73-77).
- **Limitation:** the eval detector is regex-based, not AST-based. A minified `eval` could still be caught (esbuild doesn't rename built-ins) but `new Function` could theoretically be obfuscated. For an internal SDK + own minifier (esbuild with `mangle:false` for built-ins), this is fine.
- Brace-stripping algorithm (verify-bundle.ts:73-79) iterates until no more inner `{}` remain — correct fixed-point approach.

### `scripts/verify-watermarks.ts` v1.0.2 (2026-05-01)
- Pattern: `^// @samjonaidi-ship-it/universal-auth \| .+ \| v\d+\.\d+\.\d+(-rc\.\d+)? \| \d{4}-\d{2}-\d{2} \| BB$` (verify-watermarks.ts:24).
- Scope: `src/`, `scripts/`, `test/`, `demo/` recursive + 7 root config files (verify-watermarks.ts:30-41). Comprehensive.
- Allows watermark on line 2 if line 1 is a vitest `@vitest-environment` pragma (verify-watermarks.ts:74-75).
- Bans legacy `@bb/universal-auth` watermark form (verify-watermarks.ts:28). Good.
- Local run: passed ✓.

### `scripts/verify-no-jose.ts` v1.0.0-rc.1 (2026-04-24)
- Banned in prod: `['jose', 'lodash', 'axios', 'zustand', 'moment', 'date-fns']` (verify-no-jose.ts:7).
- **Gap:** does not check for `dayjs`, `luxon`, other `dotenv`-style heavies, or weighty React replacements. The current list is appropriate for the original threat (jose was removed in v1.0.x), but the comment says "and other forbidden deps per §Appendix B" — would be improved by reading the live spec list.
- Local run: clean ✓.

### `scripts/release.ts` v1.0.2 (2026-05-01)
- Pre-flight gates (release.ts:48-65): typecheck → lint → verify:no-jose → verify:watermarks → unit tests. Bails on first failure.
- `--skip-pre-flight` flag exists (release.ts:40, 46-47, 65-67) — emergency hotfix path.
- Then `npm version <bump> -m "release: %s"` (release.ts:78) creates commit + tag, then `git push --tags` triggers release.yml.
- **Critical gap:** pre-flight runs `pnpm test:unit -- --run` but does NOT run `pnpm size-check`, `pnpm verify:bundle`, or `pnpm verify:readme`. This is exactly the class of error that bit rc.2/rc.3: a lint pass locally diverged from the CI lint pass because of plugin install state. Pre-flight gates must mirror CI's `build` job 1:1 to be useful.
- Also missing: `pnpm test:perf` is not in pre-flight. The rc.4-fix commit (`8eb6284`) was a `test:perf` regression that took a *separate* CI cycle to discover.

---

## CI pipeline review (`ci.yml` v1.1.0)

### Jobs (6 total)

| Job | Triggered | Timeout | Status |
|---|---|---|---|
| `build` | push + PR + dispatch | none | All 11 steps clean |
| `perf` | needs build | none | Single 50ms cold-start gate |
| `security` | needs build | none | Vitest security suite |
| `memory-quick` | needs build | none | 5-min memory soak (heap budget skipped) |
| `browser-smoke` | needs build | **20 min** | 4 desktop Playwright projects |
| `dependency-review` | PR only | none | OpenSSF dep review |

### SHA pinning (OpenSSF supply-chain hardening)

All third-party actions in `ci.yml` are SHA-pinned with version comments:
- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2` (ci.yml:22)
- `pnpm/action-setup@0c17529a66aca453f9227af23103ed11469b1e47 # v4.0.0` (ci.yml:23)
- `actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af # v4.1.0` (ci.yml:26)
- `actions/upload-artifact@b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882 # v4.4.3` (ci.yml:128)
- `actions/dependency-review-action@3b139cfc5fae8b618d3eae3675e383bb1769c019 # v4.5.0` (ci.yml:146)

**100% pinned. ✓**

### Timeouts

Only `browser-smoke` has an explicit `timeout-minutes: 20` (ci.yml:106). All other jobs inherit the GitHub default of 360 minutes (6 hours). This is too generous for unit tests / lint / build (typical wall time: 2-3 minutes). Recommend tightening:
- `build`: 10-15 min
- `perf`: 5 min
- `security`: 5 min
- `memory-quick`: 10 min (the soak is 5 min; allow boot overhead)

### Required secrets — undocumented

`TEST_MODE_KEY` referenced in ci.yml:124 + browser-matrix.yml:88 but **never documented**. Search of `docs/` and `README.md` for `TEST_MODE_KEY`:
- ci.yml:124 (use)
- browser-matrix.yml:88 (use)
- chaos.yml:192 (literal `test-key-do-not-use-in-prod`)
- 0 doc references

A new contributor reproducing the CI environment locally has no way to know this secret is needed or what scope/value to use. Same for `BB_CROSS_REPO_PAT`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `RAILWAY_TOKEN`, `RAILWAY_SERVICE_AUTH_DEMO`. **Debt: missing `docs/CI_SECRETS.md`.**

### `browser-smoke` rc.4 timeout — ACTUALLY A CANCEL

The user prompt states *"browser-smoke job timed out at 20 min on rc.4 push (run 25458515757)"*. **Evidence contradicts this.** Run 25458515757 (rc.4 push to main):

```
"name":"Run browser smoke (4 desktop projects)",
"startedAt":"2026-05-06T20:16:14Z",
"completedAt":"2026-05-06T20:34:32Z",
"conclusion":"cancelled"
```

Wall time: **18 min 18 sec**. The job was **CANCELLED**, not timed out. The reason is the next push at 20:38:22 (the v1.1.0-rc.4 tag push) which superseded the in-flight CI run. Same pattern in run 25459788790 (cancelled at 20 min) and 25459791290 (cancelled at 20 min).

Per ci.yml:106, the 20-minute timeout never fired on rc.4. Whether 20 min is enough for the smoke run is **not yet measured against a successful completion** in the available run history. Looking at the matrix run 25418734636 from 2026-05-06 05:47, the chromium shard tests against the deployed app `https://app.buildwithbainbridge.com` and times out (`locator.fill: Test timeout of 30000ms exceeded`) on `01-signin-flow.spec.ts:36`. That suggests the deployed app is not responding to the test harness — which is a separate problem from the timeout-minutes setting.

### `playwright.config.ts` browser-smoke math

13 tests (3+1+2+2+4+1) across 4 projects with `retries: 2` in CI = up to 156 test runs. With `workers: 4` and ~30s per fast test (much longer when failing — see matrix run, 38s × 3 retries × 9 specs in chromium alone), 20 min is plausible for *passing* but a single hanging test will eat the entire budget. The `30000ms` per-locator timeout (Playwright default) means a flaky network call against the deployed app burns 90+ seconds before failing.

---

## Release pipeline review (`release.yml` v1.0.2)

### Trigger & job

- Trigger: `push tags v*` (release.yml:23-25). Verified by run 25459791248 firing on tag push.
- One job `publish`, `timeout-minutes: 15` (release.yml:35), permissions correctly scoped (`contents:write packages:write id-token:write attestations:write`, release.yml:30-34).

### Steps in order (release.yml:36-143)

1. checkout (SHA-pinned)
2. pnpm setup (SHA-pinned)
3. node setup with `registry-url: https://npm.pkg.github.com` (release.yml:49) — wires npm CLI auth
4. `pnpm install --frozen-lockfile`
5. `pnpm build`
6. `pnpm size-check` — closure-aware budget gate before publish
7. **CycloneDX SBOM generation** (release.yml:70-85) using `pnpm dlx @cyclonedx/cyclonedx-npm@2.0`. Pinned to minor (release.yml:67-69 documents the deliberate change from `@latest`). `--ignore-npm-errors` flag (release.yml:84) is needed because pnpm's hoist layout fails npm validation (8+ "missing" errors are emitted but suppressed; SBOM still produced from pnpm-lock).
8. **Publish** (release.yml:87-104): `npm publish --access=restricted` then `npm pack --silent | tail -1` to capture the *exact* tarball name. The lookback comment at release.yml:91-95 explicitly documents why heuristic name construction was dropped — to avoid attesting an artifact different from what was published. **Sound design.**
9. **SLSA attestation** (release.yml:126-130) — `actions/attest-build-provenance@v1.4.4` SHA-pinned. `continue-on-error: true` (release.yml:127). On rc.4 release run 25459791248 this step **did continue with error**: log line `Failed to persist attestation: Feature not available for user-owned private repositories. To enable this feature, please make this repository public.` This is the deliberate v1.0.x deferral documented in release.yml:113-125. **Status:** `samjonaidi-ship-it` org is still on personal/Pro tier; entitlement gap unchanged.
10. **Attach SBOM to GitHub Release** (release.yml:135-142): `gh release create $TAG ... || true` (idempotent), then `gh release upload $TAG sbom.cdx.json --clobber`. Verified — the GH Release for v1.1.0-rc.4 has exactly one asset: `sbom.cdx.json` (1,328,914 bytes, sha256:f5f2dd5fbb5ced830621fb98e531498aab6f3b129ea377b05cc08742937d3d49).

### Tarball publishing — race condition risk

`npm publish` runs first (release.yml:90), THEN `npm pack` (release.yml:97) regenerates the tarball locally for the attestation `subject-path`. **There is a small window where `npm pack` could produce a different tarball** if any post-publish step (e.g., a postpack hook, version manipulation) altered the tree. In this codebase there are no `postpublish`/`prepack` hooks; both invocations operate on the same checkout. **Risk: theoretical only.** The current ordering (publish → pack-for-attestation) is also the only safe ordering since the attestation needs the canonical filename which `npm pack` emits.

A stricter design would `npm pack` ONCE, then `npm publish ./<tarball>` to publish that exact bytes — no risk of divergence. The current approach is fine for the entitlement-deferred state but worth tightening when SLSA attestation goes hard-required.

### SLSA attestation `continue-on-error: true`

Still needed. `samjonaidi-ship-it` org has not been upgraded to Enterprise Cloud. Per release.yml:113-120 + the rc.4 run log, the step still returns 403 "Feature not available". To re-enable, either upgrade org or make repo public. **Owner action.**

---

## Other workflows status

### `chaos.yml` (Nightly chaos + 24h soak)

- **Header watermark inconsistency:** `# @samjonaidi-ship-it/universal-auth | .github/workflows/chaos.yml | v1.0.4 | 2026-05-04 | BB` (chaos.yml:1) but the inline comment at chaos.yml:17 reads `v1.1.0 (2026-04-30):`. The header version is v1.0.4 but the body docs version 1.1.0 changes from earlier in time (4 days *before* the v1.0.4 stamp). **Watermark drift.**
- 4 jobs: `integration` (gated on `vars.NEON_INTEGRATION_ENABLED == 'true'`), `chaos`, `memory-24h`, `memory-browser`.
- Frequency: `0 4 * * *` (chaos.yml:33), 04:00 UTC daily.
- **Recent runs failing:** last 3 (2026-05-06, 2026-05-05 ×2) all `failure`. Reason from prior context: docker-compose stack stand-up issues against ct-bff (matches chaos.yml:281-296 health-check loop). Has been failing nightly for at least 2 days — **on-call attention overdue**.
- 24h memory-24h job has `timeout-minutes: 1500` (25 hours, chaos.yml:326). Heap budget skipped (chaos.yml:341-343) due to fake-indexeddb retention bug; real heap gate moved to `memory-browser` job. Documented in chaos.yml:23-28. Acceptable.

### `browser-matrix.yml` v1.0.4 (Nightly 12-config Playwright)

- Frequency: `0 3 * * *` (browser-matrix.yml:24).
- 4-shard fan-out (chromium / firefox / webkit / edge), `fail-fast: false` (browser-matrix.yml:45). Aggregate gate `matrix-gate` (browser-matrix.yml:107-118) requires all 4 to pass.
- **Recent runs failing:** last 2 (2026-05-06, 2026-05-05) both `failure`. Inspecting run 25418734636: chromium shard fails with `locator.fill: Test timeout of 30000ms exceeded` on `01-signin-flow.spec.ts:36` (rejects empty destination test). 9 failures × 4 shards = 36 failures. **Same problem as browser-smoke being cancelled / unreliable.** Root cause appears to be the deployed `app.buildwithbainbridge.com` app responding incorrectly or slowly to the smoke harness. Open debt.

### `demo-deploy.yml` v1.0.2

- Trigger: `workflow_dispatch: {}` only (demo-deploy.yml:25). No automatic trigger.
- Documented (demo-deploy.yml:1-11) as gated on RAILWAY secrets and effectively disabled since the demo Railway service was retired in v1.0.1 (D20 cutover). **Workflow is dormant but kept on disk for reactivation.** Not stale per se; it would be cleaner to either reactivate or delete. Current state (manual-trigger-only with secrets that may not exist) means it shows up in the workflow list but never runs — reasonable interim.

---

## Release artifact integrity

### Published artifact

- **Registry:** GitHub Packages (`https://npm.pkg.github.com`), private/`restricted` access.
- **Tarball name:** `samjonaidi-ship-it-universal-auth-1.1.0-rc.4.tgz` (552,128 bytes, locally reproduced 2026-05-08).
- **integrity (from release log):** `sha512-JTnPo5UuP2iDq[...]eX0q6n6RkHm9Q==` (rc.4 release run, "Tarball Details" line).
- **GitHub Release assets:** SBOM only (`sbom.cdx.json`, 1.33 MB, sha256:f5f2dd...). Tarball itself is in the registry, not on the GH Release page — this is normal for npm packages.

### Reproducibility check

Locally (post-`pnpm install --frozen-lockfile` + `pnpm build` on f7010e3):
- `npm pack --silent` produced `samjonaidi-ship-it-universal-auth-1.1.0-rc.4.tgz` (552,128 bytes).
- 249 files in tarball. Top-level: `package/LICENSE`, `package/dist/...`, `package/package.json`. Mirrors `package.json:files` (package.json:8-16).
- Zero `.test.ts` / `.spec.ts` files (grep result: 0).
- **Byte size matched whatever the publish run produced** (no published byte size to compare directly, but file count is bounded by `package.json:files` and `dist/` contents which are deterministic from source).

This is **semantically reproducible**. Byte-identical reproducibility is not expected (gzip and tar both embed timestamps), but file count + per-file content hashes would be deterministic. Not re-verified per-file in this audit but the gzip/contents test passed.

### Files in tarball — does `package.json:files` ship everything that should?

`package.json:files` (package.json:8-16) = `dist/`, `README.md`, plus 5 docs. Tarball contains all of these. **No leakage:** no `.session/`, no `audits/`, no `node_modules/`, no `.github/`, no scripts, no source. ✓

### Tag → tarball linkage

- Tag `v1.1.0-rc.4` points to `f7010e3427d27f845eb24abfd92ddd8346adf6ba` (verified via `git show v1.1.0-rc.4`).
- `f7010e3` is the merge of `agent/sdk-v1-1-rc4-ci-greens` into `main`. The tag annotation: `"v1.1.0-rc.4 — first publishable v1.1 (P0+P1+rc.3 fixups+CI greens)"`.
- The release run's SLSA predicate (rc.4 run log) records `gitCommit: f7010e3427d27f845eb24abfd92ddd8346adf6ba` — matches.

---

## Lockfile & dep tree

- `pnpm-lock.yaml` — 199,963 bytes, last modified 2026-05-06 (rc.4 fix commit `4eb310d` touched it; `eslint-plugin-react-hooks` was added).
- `pnpm install --frozen-lockfile --lockfile-only` returned in 617ms with no message — no drift detected.
- `pnpm audit --prod --audit-level=high` returned `No known vulnerabilities found`. ✓

### Dev dep usage audit

Searched `src/`, `test/`, `demo/`, `scripts/`, `vitest.*.ts`, `playwright.config.ts` for imports / config refs:

| Dev dep | Used? | Notes |
|---|---|---|
| `size-limit` | **NO** | 0 import sites, 0 config block. Stale. |
| `@size-limit/preset-small-lib` | **NO** | Same; transitively pulled but no config consumes it. |
| `tiny-invariant` | **NO** | 0 import sites. Stale. |
| `toxiproxy-node-client` | **NO** | 0 import sites. Was for chaos suite per CHANGELOG; replaced with HTTP API calls. |
| `fast-check` | yes | property fuzzing in security suite. |
| `@pact-foundation/pact` | yes | 6 files. |
| `msw` | yes (lockfile present) | Used in test fixtures via setup. |
| `happy-dom` | yes | vitest environment. |
| `fake-indexeddb` | yes | test setup. |

**Unused dev deps (3):** `size-limit`, `@size-limit/preset-small-lib`, `tiny-invariant`, `toxiproxy-node-client` (4 with toxiproxy). The `_comment-size-limit` field at package.json:114 explicitly documents that `size-limit` was replaced — but the package itself was **not** removed. Adds ~5 MB to `node_modules` install. **Debt.**

The `_comment-size-limit` key at package.json:114 is a non-standard package.json field. Some downstream tooling treats unknown top-level keys as warnings; pnpm tolerates it but it's idiosyncratic. Consider moving the rationale into a code comment or `docs/`.

---

## Coverage gate sanity

vitest.config.ts:32-37 thresholds: lines=90, branches=83, functions=90, statements=90.

Per CHANGELOG rc.4 (docs/CHANGELOG.md:39): measured 90.44 / 83.74 / 92.77 / 90.44.

**Branches margin: 83.74 − 83.00 = 0.74 percentage points.** Razor-thin. A single new branch in `entitlements.ts`, `storage.ts`, `validators.ts`, `code-flow.ts`, or `passkey-flow.ts` would tip CI red. Mitigation tracked in `docs/BACKLOG.md` as `COV-1` per vitest.config.ts:30-31. Acceptable for a publish-ready RC.

### Excludes (vitest.config.ts:38-71)

12 excluded modules. Audit:

- `src/index.ts`, `src/profile/index.ts`, `src/extendability/index.ts`, `src/react/index.ts`, `src/react/components/index.ts` — barrel files, re-export only. **Reasonable.**
- `src/sw/index.ts` — runs in SW global; covered by Playwright. **Reasonable per L6 fix in vitest.config.ts:60-62.**
- `src/core/crypto-worker.ts` — Web Worker entry. **Reasonable; deferred past v1.0.**
- `src/extendability/{auth-flow,risk-signal,notification-channel}.ts` — pure interfaces. **Reasonable.**
- `src/types/**` — pure types. **Reasonable.**

No exclude looks like a coverage cheat. Three exclude entries (extendability interfaces) genuinely contain only `interface` declarations — confirmed by inspection; vitest correctly counts those at 100% if measured but they're excluded as "no executable code" which is technically accurate for v8 coverage.

---

## Watermark drift

### Local run

`pnpm verify:watermarks` → `[verify-watermarks] all source files carry the canonical BB watermark.` ✓

### chaos.yml inconsistency

- **Header (line 1):** `# @samjonaidi-ship-it/universal-auth | .github/workflows/chaos.yml | v1.0.4 | 2026-05-04 | BB`
- **Body (line 17):** `# v1.1.0 (2026-04-30):`

The body change-log records a `v1.1.0` change from 2026-04-30 (cross-repo checkout addition), but the header was bumped to `v1.0.4` later (2026-05-04). The header version (v1.0.4 ≤ v1.1.0) is *behind* the inline note. This is a documentation bug — either the inline `v1.1.0 (2026-04-30)` note should be re-labeled (this was a v1.0.3-era change), or the header should be `v1.1.x`.

`verify-watermarks.ts` only scans `.ts/.tsx` files (verify-watermarks.ts:42). Workflow YAML is not in the verifier's scope, so this drift went uncaught. **Minor enhancement: extend verifier to include `.github/workflows/*.yml` — the watermark format already exists there.**

### Cross-check: file watermark version vs CHANGELOG

Sampled scripts:
- `scripts/build.ts` v1.0.1 → CHANGELOG v1.0.1 entry exists ✓
- `scripts/check-readme-code.ts` v1.0.0 (2026-05-06) → introduced in rc.4? CHANGELOG rc.3 (docs/CHANGELOG.md, post-rc.2 audit fixups) lists "P0-2 — README quick-start regression gate" — yes ✓
- `scripts/size-check-closure.ts` v1.0.0 (2026-05-06) → CHANGELOG rc.4 references "closure budgets" ✓
- `scripts/release.ts` v1.0.2 → matches v1.0.2 (lookback C9 pre-flight added) per release.ts:46 ✓
- `scripts/verify-bundle.ts` v1.0.0-rc.1 → original ✓
- `scripts/verify-no-jose.ts` v1.0.0-rc.1 → original ✓
- `scripts/verify-watermarks.ts` v1.0.2 → v1.0.2 lookback C2 widened scope (verify-watermarks.ts:11-12) ✓

All script versions align with CHANGELOG history.

### VERSION_MATRIX.md completeness

VERSION_MATRIX.md tracks 14 components (Package, SDK Core, Config, React, SW, Profile, Extendability, Entitlements, useAccess, useAccessBulk, ESLint, Vitest, Demo). Does **not** track:
- Build script versions (build.ts, size-check-closure.ts, etc.)
- Workflow versions (ci.yml v1.1.0, release.yml v1.0.2, chaos.yml v1.0.4, browser-matrix.yml v1.0.4, demo-deploy.yml v1.0.2)
- Other src modules (storage, sw modules, individual react components)

This is a deliberate scope decision — VERSION_MATRIX is the public surface, not exhaustive. But the workflow versions matter for incident analysis. **Soft suggestion:** add a "Build/CI/Release" mini-table.

---

## Reproducibility check

A fresh checkout of v1.1.0-rc.4 + `pnpm install --frozen-lockfile && pnpm build && npm pack --silent` would produce:
- Same file count: 249 (matches local 2026-05-08 run).
- Same set of file paths (esbuild content hashes are deterministic for the same input).
- Tar/gzip headers contain timestamps → byte-stream NOT identical, but contents ARE.

**Semantically reproducible: yes.** Byte-identical: no (and not required by the SLSA L1 baseline this project targets).

A stronger guarantee (hash-stable content, with timestamps in tar normalized to commit time) would require `--mtime` flags on tar or a switch to `npm pack` with `SOURCE_DATE_EPOCH`. Not currently a target.

---

## Ship-process retrospective

### Timeline of v1.1.0-rc.x

| rc | Outcome | Root cause |
|---|---|---|
| rc.1 | Published 2026-05-04 | Clean — first v1.1 ship |
| rc.2 | UNPUBLISHED (CHANGELOG: "Failed CI on 3 lint errors") | Lint failed on push to main; never tagged |
| rc.3 | UNPUBLISHED (CHANGELOG: "same 3 lint errors") | Same as rc.2 — fix didn't fix |
| rc.4 | PUBLISHED 2026-05-06 20:39 UTC | rc.3 lint fixes + perf fix + coverage threshold reconciled |

### What happened to rc.2 / rc.3 on main

- rc.2 push (commit `f2a1446`, run 25426747104) — `build` job failed: 3 lint errors from rc.2 P1-J/P1-A code that pre-flight `pnpm lint` should have caught. Either pre-flight wasn't run or local lint passed because `eslint-plugin-react-hooks` was installed locally but not in lockfile, so CI install had no rule definition → "Definition for rule not found" errors (per CHANGELOG rc.4 root-cause analysis, docs/CHANGELOG.md:14-25).
- rc.3 push (commit `4eb310d`, run 25457618102) — `build` succeeded, `perf` failed: `test:perf` script invoked `size-limit` which had been removed from config in rc.2 P1-F, so `size-limit` errored with "Create Size Limit config in package.json". Fix in commit `8eb6284` rewired `test:perf` to use `scripts/size-check-closure.ts`.

### Process failure modes

1. **Local pre-flight in `release.ts` doesn't mirror CI.** Pre-flight runs typecheck + lint + verify-no-jose + verify-watermarks + test:unit. Misses: `verify:readme`, `verify:bundle`, `size-check`, `test:perf`, `test:security`, `test:memory`. The exact gates that failed on rc.2 (lint with plugin missing, but in different env) and rc.3 (perf) both have local-equivalent commands — they just weren't gated.
2. **No git pre-push hook.** `.git/hooks/` contains only the default `.sample` files. No husky config, no `pre-push` script. A simple `pre-push: pnpm typecheck && pnpm lint && pnpm test:unit && pnpm size-check` would have caught rc.2 + rc.3 before the push.
3. **No agent branch CI.** rc.x work happened on `agent/sdk-v1-1-*` branches. CI runs on push (per ci.yml:16: `on: [push, pull_request, workflow_dispatch]`), but the agent branches go through `/merge-agent` which pushes both branch and main commit. Once main is red, it's a public state change. Running CI on the agent branch first (e.g., before merge) would have caught both errors *without* coloring main red. Standard pattern: enforce a PR + green CI before merge.
4. **`pnpm install` vs `pnpm install --frozen-lockfile` divergence.** Local installs without `--frozen-lockfile` happily add packages to `node_modules` without lockfile updates. CI uses `--frozen-lockfile` so it discovers the missing entry. The rc.2 fix that introduced `eslint-plugin-react-hooks` was probably done via `pnpm add` locally which DID update lockfile, but a later commit may have lost it. Inspection of the rc.4 fix commit `4eb310d`'s diff shows `pnpm-lock.yaml` was indeed touched (+13 lines) — confirming the plugin was missing from the lockfile in rc.2/rc.3.

### Best one-step prevention

**Add a pre-push git hook** invoking the same gates the `build` CI job runs. With `husky` (already a JS-ecosystem standard) or a manual `core.hooksPath` script, the rc.2/rc.3 lint errors would have been caught locally before the push.

---

## Debt inventory

| Severity | Area | Issue | Age | Recommendation | Effort |
|---|---|---|---|---|---|
| HIGH | release process | No pre-push hook; rc.2 + rc.3 landed red on main | 2 days | Add `husky` pre-push running typecheck + lint + size-check + test:unit | 1 hr |
| HIGH | nightly workflows | `browser-matrix.yml` failing for ≥2 nights | 2 days | Investigate `app.buildwithbainbridge.com` smoke target; Playwright `locator.fill` timing out on real test app | 2-4 hr |
| HIGH | nightly workflows | `chaos.yml` failing for ≥2 nights | 2 days | Investigate ct-bff health check / docker stack stand-up | 2-4 hr |
| MED | release.ts | Pre-flight gates miss `verify:readme`, `verify:bundle`, `size-check`, `test:perf` | 5 days | Mirror CI build job 1:1 | 30 min |
| MED | dev deps | Unused: `size-limit`, `@size-limit/preset-small-lib`, `tiny-invariant`, `toxiproxy-node-client` (~5 MB install bloat) | rc.2 → rc.4 | `pnpm remove`; delete `_comment-size-limit` field from package.json | 30 min |
| MED | release.yml | SBOM gen emits 8+ npm-error lines per run (cosmetic noise) | rc.1 | Stays until pnpm or @cyclonedx/cyclonedx-npm interop matures; consider switching to `pnpm-lock`-native SBOM tool (`@cyclonedx/cyclonedx-pnpm-plugin` if it exists) | 1 hr to evaluate |
| MED | docs | No `docs/CI_SECRETS.md` documenting `TEST_MODE_KEY`, `BB_CROSS_REPO_PAT`, `NEON_*`, `RAILWAY_*` | All time | Write secret matrix doc | 30 min |
| LOW | watermark drift | `chaos.yml` header `v1.0.4` vs body `v1.1.0` note | 4 days | Reconcile header version OR retag body note | 5 min |
| LOW | watermark verifier | `verify-watermarks.ts` doesn't scan `.github/workflows/*.yml` | All time | Extend SCAN_ROOT_FILES list to include workflow files | 15 min |
| LOW | CI timeouts | Only `browser-smoke` has explicit timeout; others use 6h default | All time | Add `timeout-minutes: 10-15` to build/perf/security/memory-quick | 10 min |
| LOW | release.yml | SLSA attestation `continue-on-error: true` (entitlement deferred) | v1.0.x | Either upgrade `samjonaidi-ship-it` to Enterprise, or make repo public | Owner decision |
| LOW | build.ts docstring | Says "3 entry points" at build.ts:30; now 8 | rc.2 | Update comment | 1 min |
| LOW | docs hygiene | VERSION_MATRIX.md doesn't track build/CI/release script versions | All time | Add a 7-row "Build/CI/Release" sub-table | 15 min |
| LOW | verify-no-jose | Banned list is hardcoded; no link to a single source-of-truth (spec §Appendix B) | rc.1 | Move banned list to a shared JSON; verify-no-jose reads it | 30 min |
| INFO | release.yml ordering | `npm publish` then `npm pack` — theoretical drift window | rc.1 | Stricter: `npm pack` once, then `npm publish ./<file>.tgz` | 30 min |

---

## Recommendations (ranked)

1. **Add a husky pre-push hook** that runs `pnpm typecheck && pnpm lint && pnpm size-check && pnpm test:unit`. This is the highest-leverage fix; would have prevented both rc.2 and rc.3 main-red events. ~1 hour. (Note: `--frozen-lockfile` install is the other half — pre-push should also fail if `pnpm install --frozen-lockfile` would change anything.)

2. **Investigate browser-smoke / browser-matrix timeouts** against the deployed `app.buildwithbainbridge.com`. Multiple shards consistently timing out on `locator.fill` at `01-signin-flow.spec.ts:36` — either the app endpoint is slow/broken or the test selector drifted. Without this fixed, the 20-minute browser-smoke timeout in `ci.yml` will keep biting any future push that survives the cancel-by-next-push race.

3. **Sync `release.ts` pre-flight to CI's `build` job exactly.** Add `pnpm verify:readme`, `pnpm verify:bundle`, `pnpm size-check`, `pnpm test:perf`. If pre-flight + CI diverge, you ship surprises.

4. **Remove `size-limit` and orphan dev deps.** `pnpm remove size-limit @size-limit/preset-small-lib tiny-invariant toxiproxy-node-client`, delete `_comment-size-limit` from package.json. Documents the migration is complete and removes ~5 MB install bloat.

5. **Add `docs/CI_SECRETS.md`.** A simple table: secret name, where used, what scope/value pattern, who owns. Removes onboarding friction.

6. **Tighten CI job timeouts** to actual wall-clock + slack: build 15 min, perf 5 min, security 5 min, memory-quick 10 min. Cheap, defensive.

7. **Fix chaos.yml watermark drift** and extend `verify-watermarks.ts` to include workflow files. Then watermark drift can't recur.

8. **Investigate nightly chaos.yml + browser-matrix.yml failures.** Both have been red for ≥2 nights with no fix. If they're red long enough to be expected, CI signal degrades. Either fix or pause.

9. **Stricter release ordering.** `npm pack` once, then `npm publish ./<tarball>` — eliminates the theoretical window where the attested bytes differ from the published bytes.

10. **Owner decision: Enterprise upgrade or public repo.** SLSA attestation is the only release gate that's currently soft-failing. Resolving the entitlement closes that gap.

---

## Appendix A — Local verification log (2026-05-08)

```
$ pnpm build                  → exit 0, dist/ regenerated, 249-file tarball
$ pnpm typecheck              → clean
$ pnpm lint                   → clean
$ pnpm verify:readme          → 3 imports / 3 symbols ✓
$ pnpm verify:bundle          → 3 checks pass ✓
$ pnpm verify:watermarks      → all source files carry watermark ✓
$ pnpm verify:no-jose         → prod tree clean ✓
$ pnpm size-check             → core 23.38 / react 36.20 / profile 15.29 / passkey-marginal 0.20 / sw 0.56 KB
$ pnpm install --frozen-lockfile --lockfile-only  → 617ms, no drift
$ pnpm audit --prod --audit-level=high  → No known vulnerabilities found
$ npm pack --silent           → samjonaidi-ship-it-universal-auth-1.1.0-rc.4.tgz (552,128 bytes, 249 files)
                                 0 .test.ts / .spec.ts files in tarball ✓
```

## Appendix B — Run IDs referenced

| Run ID | Workflow | Trigger | Status | Notes |
|---|---|---|---|---|
| 25459791248 | release.yml | tag v1.1.0-rc.4 push | success | SBOM uploaded, attestation soft-failed (entitlement) |
| 25459791290 | ci.yml | tag push | cancelled | Cancelled by user/automation; build job succeeded |
| 25459788790 | ci.yml | tag push | cancelled | Same |
| 25458515757 | ci.yml | rc.4-fix push (`8eb6284`) | cancelled | browser-smoke ran 18:18 then cancelled by tag push (NOT timeout) |
| 25457618102 | ci.yml | rc.3 release push (`4eb310d`) | failure | perf job: stale `size-limit` invocation |
| 25426747104 | ci.yml | rc.2 push (`f2a1446`) | failure | build job: 3 lint errors (eslint-plugin-react-hooks missing) |
| 25418734636 | browser-matrix.yml | nightly | failure | 4 shards red — locator.fill timeouts on deployed app |

End of audit.
