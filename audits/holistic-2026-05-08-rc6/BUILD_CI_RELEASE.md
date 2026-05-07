# Build/CI/Release Integrity Audit — rc.6 Lookback | 2026-05-08

**Subject:** `@samjonaidi-ship-it/universal-auth@1.1.0-rc.6`
**Tag commit:** `80ad9047c351785d8ebe520665120205a60aac19` — merge of `agent/sdk-v1-1-rc6-cov-final` into `main` (`v1.1.0-rc.6`)
**Published:** 2026-05-07 01:01:36 UTC (release id `RA_kwDOSLxQCc4YrLpp`)
**Method:** Local execution + workflow log inspection. Every claim cites file:line or `gh run` id. Quotes ≤15 words.
**Predecessor:** `audits/holistic-2026-05-08-rc4/BUILD_CI_RELEASE.md` (rc.4 score 7.0/10).

## Score: 8.6 / 10 (rc.4: 7.0)

Material progress on every rc.4 finding except those explicitly deferred. Every BUILD-* item from the rc.4 audit closed (BUILD-1 pre-push hook, BUILD-2 browser-smoke gate, BUILD-3 release pre-flight, BUILD-4 4 unused devDeps, BUILD-5 CI_SECRETS doc, BUILD-6 chaos.yml watermark, BUILD-7 verify-watermarks YAML, BUILD-8 timeout-minutes). The version-drift class of regression that bit rc.4 (`SDK_VERSION='1.1.0-rc.3'` while `package.json='1.1.0-rc.4'`) is now blocked by `verify:version-sync` on every CI run + every pre-push. Closure-aware bundle budgets remain green with significant headroom (core 41% utilized, react 61%, profile 31%). 14/14 production deps audit clean. Tarball is bit-clean (only `dist/` + 5 docs + LICENSE + package.json + README; no test files, no `.githooks/`). SBOM (1.2 MB CycloneDX) attached to the GitHub Release as expected.

Remaining debt is mostly cosmetic or deferred-on-purpose: SLSA attestation step is `continue-on-error: true` pending GitHub Enterprise Cloud entitlement (or repo-public flip); browser-smoke + browser-matrix ship gated-off awaiting a fresh sdk-demo deploy; `.githooks/pre-push` file-mode bit in the git index is `100644` (non-executable) on Windows-authored commits — the working-tree bit is 755 but git stored it without `+x` (POSIX users running `git config core.hooksPath .githooks` straight from clone would get a non-exec script). One unit test (`PropertySection.test.tsx:129`) fails on local Windows but passes in CI — pre-existing flake noted in CHANGELOG/BACKLOG (TEST-1).

---

## Build correctness

`pnpm build` exit 0. Output verified locally 2026-05-08.

| Check | Evidence | Result |
|---|---|---|
| `package.json` exports has 6 subpaths + 1 CSS asset | `package.json:17-43` | OK |
| `build.ts` declares 8 entry points | `scripts/build.ts:32-53` (index, react/index, flows/passkey-flow, sw/index, profile/index, extendability/index, internal/index, crypto-worker) | OK |
| All 6 ESM barrels emitted | `dist/esm/{index,react/index,sw/index,profile/index,extendability/index,internal/index}.js` all present | OK |
| All 6 type barrels emitted | `dist/types/{index,react/index,sw/index,profile/index,extendability/index,internal/index}.d.ts` all present | OK |
| `dist/esm/react/components/styles.css` shipped | copied by `build.ts:114-117` | OK |
| No `.test.*` / `.spec.*` files in dist | `find dist -name "*.test.*"` → 0 hits | OK |
| Bundle metafile present (outside dist) | `.build-meta/esbuild-meta.json` 215,597 bytes | OK |
| `crypto-worker.js` flat (not under `core/`) | `dist/esm/crypto-worker.js` confirmed; `build.ts:48-53` documents the trap (downstream Vite resolves `./crypto-worker.js` from the chunk's location) | OK |
| `sideEffects: false` declared and honored | `package.json:7`; enforced by `verify-bundle.ts:15-23` | OK |
| No `eval` / `new Function()` / `<script>` in bundle | `verify-bundle.ts:35-39` scan + checked dist files | OK |
| Bundle budgets pass with margin | core 23.52/40, react 42.89/70, profile 15.37/50, passkey-marginal 0.20/12, sw 0.56/5 KB gzipped | OK |

Minor doc drift (carry-over from rc.4): `build.ts:30` comment says "3 entry points" while the actual entryPoints object holds 8 keys. The startup log line `build.ts:106` was updated to "8 entry points" but the function-doc above it wasn't. Cosmetic only. **Not closed in rc.5/rc.6** — flagged in debt inventory.

---

## Script-by-script audit (8 scripts)

### `scripts/build.ts` v1.0.1 (2026-05-01)
- 8 entries (build.ts:32-53) map 1:1 to `package.json:exports` plus 2 internal entries (`flows/passkey-flow` for dynamic import after sign-in, `crypto-worker` for `new Worker()`).
- Non-incremental: `clean()` (build.ts:24-27) wipes `dist/` every run. Acceptable for CI; no watch mode.
- Metafile written outside `dist/` (build.ts:74-91) — correct privacy posture per look-back fix L10 (paths to `node_modules/.pnpm/*` and `src/*.ts` would otherwise leak in the published tarball).
- `legalComments: 'inline'` (build.ts:71) — preserves attribution; mild gzip cost. Acceptable.
- Carries forward the rc.4 doc-vs-code drift noted above.

### `scripts/size-check-closure.ts` v1.0.0 (2026-05-06)
- BUDGETS array (size-check-closure.ts:65-71) lists 5 entries with budgets: `core 40K`, `react 70K`, `profile 50K`, `passkey-flow lazy 12K`, `sw 5K`.
- CHANGELOG rc.6 entry doesn't quote bundle figures (rc.5 entry at `docs/CHANGELOG.md:158-159` says *"core 23.39 / react 36.21 / profile 15.29 / passkey-marginal 0.20 / sw 0.56"*) — local rc.6 re-run produced `23.52 / 42.89 / 15.37 / 0.20 / 0.56`. The **+6.7 KB jump in react** between the rc.5-quoted figure (36.21) and rc.6 (42.89) is unexplained in the CHANGELOG and worth investigating — not a budget violation (61% utilization), but a 18% growth on a single entry without doc note is the kind of drift that compounds. **Flagged in debt inventory.**
- `lazyAfterCore` semantics (size-check-closure.ts:53-61, 142-145) correctly subtract chunks already in core's eager closure from the lazy chunk's measurement.
- Eager-only walker (size-check-closure.ts:114) excludes dynamic imports — necessary for the libphonenumber-js lazy-load to actually reduce the react closure.

### `scripts/check-readme-code.ts` v1.0.0 (2026-05-06)
- Symbol-level barrel verification with **depth limit `> 4`** (check-readme-code.ts:84). Re-export chains deeper than 4 levels would silently fail. Reasonable for current barrels (max chain depth observed = 2).
- Handles direct exports, named re-exports, wildcard re-exports (lines 86-120). Strips `type` prefix and `as alias` rename.
- Gap: doesn't follow `export *` from external packages (line 111-112 explicit `if (!target.startsWith('.')) continue`). Acceptable — barrels only re-export local files.
- Local run: 3 imports / 3 symbols verified, exit 0.

### `scripts/verify-bundle.ts` v1.0.0-rc.1 (2026-04-24)
- 3 checks: (1) `sideEffects: false`, (2) no `<script>`/eval/Function in dist .js files, (3) no top-level side-effects in `src/index.ts` (after stripping function bodies via iterative `{...}` collapse, lines 75-78). Defensive coding (e.g. block-body strip avoids false-positives from declared but uncalled `console.log` inside functions).
- Local run: all 3 pass.
- **Has not been touched since 2026-04-24** despite being a foundational gate. Test coverage of the script itself is implicit (CI runs it). Adequate.

### `scripts/verify-watermarks.ts` v1.0.3 (2026-05-08, **NEW in rc.5**)
- v1.0.3 added YAML support (BUILD-7 fix). Scans `.github/workflows/*.yml` with `#`-prefixed comment style alongside `//` for TS files.
- SCAN_DIRS at line 39: `['src', 'scripts', 'test', 'demo', '.github/workflows']` plus 7 root config files (vitest configs + playwright).
- Verified working on the 5 workflow files: `ci.yml v1.1.1`, `release.yml v1.0.2`, `chaos.yml v1.1.0`, `browser-matrix.yml v1.0.5`, `demo-deploy.yml v1.0.2` — all pass `verify:watermarks` locally.
- Pragma allowance (lines 55, 84) lets vitest `// @vitest-environment happy-dom` pragmas live on line 1 with the watermark on line 2.
- Legacy `@bb/universal-auth` form is forbidden (lines 36-37, 92-95) — prevents copy-paste regression.
- Total scanned: 268 files have the watermark. Local run exit 0.

### `scripts/verify-no-jose.ts` v1.0.0-rc.1 (2026-04-24)
- Forbidden list (line 7): `['jose', 'lodash', 'axios', 'zustand', 'moment', 'date-fns']`. Comprehensive for the documented constraint set in spec §Appendix B.
- Falls back from `pnpm ls --prod --depth=Infinity --json` to `npm ls --omit=dev --all --json` if pnpm isn't available (line 15-17). Reasonable for portability.
- Walks the dep tree iteratively (lines 22-32) — correct.
- Local run: production tree clean.

### `scripts/verify-version-sync.ts` v1.0.0 (2026-05-08, **NEW in rc.5**)
- Audit-fix from rc.4 incident (`src/config.ts:235='1.1.0-rc.3'` while `package.json='1.1.0-rc.4'` ⇒ every event envelope misattributed). Header docstring at lines 4-9 documents the regression.
- Reads `package.json:version` and `src/config.ts:SDK_VERSION` literal via regex `/^export\s+const\s+SDK_VERSION\s*=\s*['"]([^'"]+)['"]/` (line 40).
- **False-positive analysis:** the regex is line-anchored to `^export` and requires single-line literal. False positives only if someone deliberately defines a different `SDK_VERSION` export with a non-canonical value. Low risk.
- **False-negative analysis:** if the export uses a template literal or a computed expression (`= \`${BASE}-rc.6\``), the regex would fail to match — but that path triggers an explicit error at line 45 (`could not locate SDK_VERSION export`), not a silent pass. Safe-fail.
- Currently `1.1.0-rc.6` matches `1.1.0-rc.6` (line 231 of `src/config.ts`). Local run exit 0.
- Future P2-11 supersedes via esbuild `--define` injection (script header line 14-15) — until then this is the canonical guard.

### `scripts/release.ts` v1.0.2 (2026-05-01) — pre-flight gates extended in rc.5 BUILD-3
- Pre-flight gates list (release.ts:53-65) now: `typecheck → verify:readme → verify:version-sync → lint → verify:no-jose → verify:watermarks → test:unit → build → size-check → verify:bundle → test:perf` (11 gates).
- **Comparison with `ci.yml` build job (lines 32-42):** `typecheck → verify:readme → verify:version-sync → lint → test:unit → build → size-check → verify:bundle → verify:watermarks → verify:no-jose → pnpm audit --prod` (11 steps). The release pre-flight is a **strict superset** — it adds `test:perf` (CI runs it as a separate `perf` job for parallelism) and reorders watermarks/no-jose before test:unit (cheaper-first ordering, sensible). The release script is missing `pnpm audit --prod --audit-level=high` that the CI build job has at line 42 — a small gap.
- `--skip-pre-flight` documented as "emergency hotfix only" with a warn message (line 76).
- Verified clean working tree before bump (line 80-83). Pushes commit + tag separately (lines 92-94) so `release.yml` workflow fires on tag.

---

## CI pipeline review (`.github/workflows/ci.yml` v1.1.1)

| Job | Trigger | Timeout (BUILD-8) | Steps |
|---|---|---|---|
| `build` | push, PR, workflow_dispatch | **15 min** (line 21) | install → typecheck → verify:readme → verify:version-sync → lint → test:unit → build → size-check → verify:bundle → verify:watermarks → verify:no-jose → audit (12 steps, 11 gates + install) |
| `perf` | needs build | **10 min** (line 47) | install → build → test:perf (cold-start) |
| `security` | needs build | **15 min** (line 65) | install → test:security (fuzzing, CSRF, IDB tamper, token replay) |
| `memory-quick` | needs build | **10 min** (line 82) | install → 5-min memory soak (--expose-gc, deadlock + cycle-progress gate) |
| `browser-smoke` | needs build, **`if: vars.BROWSER_SMOKE_ENABLED == 'true'`** (line 118) | 20 min | install → build → playwright install → 4 desktop projects (chrome/firefox/webkit/edge) |
| `dependency-review` | PR only (line 152) | implicit ubuntu-latest 6h default — no `timeout-minutes:` | dependency-review-action fail on critical/high CVEs |

**SHA pinning audit.** All 6 third-party action references pinned to commit SHAs:
- `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2) — used 6×
- `pnpm/action-setup@0c17529a66aca453f9227af23103ed11469b1e47` (v4.0.0) — used 5×
- `actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af` (v4.1.0) — used 5×
- `actions/upload-artifact@b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882` (v4.4.3) — used 1×
- `actions/dependency-review-action@3b139cfc5fae8b618d3eae3675e383bb1769c019` (v4.5.0) — used 1×
All comply with OpenSSF supply-chain hardening.

**Timeouts.** BUILD-8 successfully closed: `build 15`, `perf 10`, `security 15`, `memory-quick 10`, `browser-smoke 20`. The 5-min memory soak fits comfortably inside the 10-min timeout. Sensible.

**Gap:** `dependency-review` job (lines 151-163) has no explicit `timeout-minutes`. The action itself rarely runs longer than 60 sec, and the job only fires on `pull_request` (so it doesn't gate pushes), but every other job got an explicit timeout in BUILD-8 — flagged for symmetry.

**`verify:version-sync` wired in build job:** Yes, line 34 `- run: pnpm verify:version-sync`. Confirmed firing on rc.5 run id 25465720549 step 8 (started 22:56:02Z, completed 22:56:02Z, conclusion: success) and rc.6 run id 25469587911 step 8 (started 00:51:07Z, completed 00:51:08Z).

**`browser-smoke` gate (BUILD-2):** `if: vars.BROWSER_SMOKE_ENABLED == 'true'` at line 118. Verified status `skipped` (not failure) on both rc.5 run 25465720549 (jobs[5].conclusion=`skipped`) and rc.6 run 25469587911 (jobs[5].conclusion=`skipped`). Gate is honored.

---

## Release pipeline review (`.github/workflows/release.yml` v1.0.2)

**Trigger:** `push: tags: ['v*']` (line 22-25). Tag push from `release.ts` triggers it.

**Permissions** (lines 31-34): `contents: write` (release asset upload), `packages: write` (publish), `id-token: write` (sigstore), `attestations: write` (SLSA). Minimum-viable scope.

**Timeout:** 15 min (line 35).

**Pipeline:**
1. checkout → pnpm install → setup node (`registry-url: https://npm.pkg.github.com`, line 49)
2. `pnpm install --frozen-lockfile` (line 52)
3. `pnpm build` (line 55)
4. `pnpm size-check` — pre-publish budget gate (line 58)
5. **CycloneDX SBOM generation** (lines 70-85) — `pnpm dlx @cyclonedx/cyclonedx-npm@2.0` with `--ignore-npm-errors`. Pinned to minor `@2.0` (rc.4 lookback C7 fix dropped `@latest`).
6. **Publish** (lines 87-104) — `npm publish --access=restricted`. Tarball path captured from `npm pack --silent | tail -1` to ensure attestation attests the published artifact.
7. **SLSA provenance** — `actions/attest-build-provenance@ef244123eb79f2f7a7e75d99086184180e6d0018` (v1.4.4), **`continue-on-error: true`** (line 127).
8. **GitHub Release SBOM upload** — `gh release upload "$TAG" sbom.cdx.json --clobber` (line 142).

**`continue-on-error: true` rationale.** Lines 113-125 explain: `actions/attest-build-provenance` for private repos requires GitHub Enterprise Cloud. The owning org `samjonaidi-ship-it` is on free Pro tier, so the step returns 403 "Feature not available". Until either Enterprise plan or repo-public, the step soft-fails so publish + SBOM still complete. **Still needed at rc.6** — no entitlement change since rc.4. Tracked as v1.1+ deferral. Flagged in debt inventory.

**rc.6 release verification:**
```
gh release view v1.1.0-rc.6 --json assets,publishedAt
{
  "publishedAt":"2026-05-07T01:01:36Z",
  "tagName":"v1.1.0-rc.6",
  "assets":[{
    "name":"sbom.cdx.json",
    "size":1215493,
    "digest":"sha256:ebe422508b1b21ff6670925bcac860c60dac509d7d053b3e56ec996a4fc90b3a",
    "createdAt":"2026-05-07T01:01:37Z",
    "state":"uploaded"
  }]
}
```
SBOM (1.16 MB) attached. Tarball is implicit (resides in GitHub Packages, not as a release asset).

---

## Other workflows status

### `chaos.yml` v1.1.0 (2026-05-08)
- Watermark v1.1.0 confirmed at line 1 (BUILD-6 closed). Header version now matches the v1.1.0 inline note that survived from earlier edits.
- 3 jobs: `integration` (gated `vars.NEON_INTEGRATION_ENABLED == 'true'`, line 52), `chaos` (no gate, but depends on docker-in-docker + cross-repo PAT), `memory-24h` (24h soak), `memory-browser` (Playwright Chromium real-IDB).
- Cross-repo checkout of `samjonaidi-ship-it/BB_ControlTower` uses `secrets.BB_CROSS_REPO_PAT` (line 65, 250).
- Neon branch lifecycle has `if: always()` cleanup (lines 220-231). No leak risk.
- Real heap gate now in `memory-browser` (lines 354-380) since fake-indexeddb leaks ~3 KB/op.

### `browser-matrix.yml` v1.0.5 (2026-05-08)
- BUILD-2 closed: `if: vars.BROWSER_SMOKE_ENABLED == 'true'` (line 48). Same gate as `ci.yml:browser-smoke`.
- 4×3 matrix shard (chromium/firefox/webkit/edge × desktop/mobile/tablet).
- Aggregate `matrix-gate` job (lines 114-125) verifies all 4 shards passed.
- Pinned action SHAs match ci.yml.

### `demo-deploy.yml` v1.0.2 (2026-05-04)
- `on: workflow_dispatch: {}` (line 25) — manual trigger only. Confirmed.
- Previously ran on every push to main and failed with "service not found"; rc.4 fix limited to manual trigger only.
- Self-deactivates: if `RAILWAY_TOKEN` or `RAILWAY_SERVICE_AUTH_DEMO` are unset, the `railway up` command at line 58 will fail — but the workflow won't auto-fire, so this manifests only when intentionally triggered. The header comment (lines 6-7) tells the operator to set both secrets before re-enabling.

---

## Release artifact integrity (rc.6)

`npm pack --silent` reproducibility check executed locally on the rc.6 working tree at HEAD:

| Property | Value | Source |
|---|---|---|
| Tarball name | `samjonaidi-ship-it-universal-auth-1.1.0-rc.6.tgz` | npm pack output |
| Compressed size | 588,905 bytes (575 KB) | local `ls -la` |
| Unpacked size | 2.2 MB | `npm pack --dry-run` |
| File count | 249 | `tar -tzf | wc -l` |
| Roots shipped | `package/dist/`, `package/docs/{CHANGELOG,INTEGRATION_GUIDE,QA_RUNBOOK,RELEASE_NOTES,THREAT_MODEL}.md`, `package/LICENSE`, `package/package.json`, `package/README.md` | `tar -tzf | grep -v dist` |
| Test files in tarball | 0 | `tar -tzf | grep -E "(\.test\.|\.spec\.)"` returned 0 |
| `.githooks/` in tarball | 0 — correctly excluded | not in `package.json:files` (line 8-16) |
| `scripts/` in tarball | 0 — correctly excluded | not in `package.json:files` |
| `test/` in tarball | 0 — correctly excluded | not in `package.json:files` |
| `.build-meta/` in tarball | 0 — correctly excluded | not in `package.json:files`; explicit privacy fix (build.ts:74-91) |

**`.githooks/` is repo-tooling, not consumer-shipped — verdict: correctly excluded.** `package.json:files` enumerates only `dist/` + 5 docs + LICENSE + CHANGELOG. The hooks live under `.githooks/` and are never referenced by consumers. Confirmed not in the published tarball.

**rc.5-introduced files vs published tarball:**
- `scripts/verify-version-sync.ts` — NOT in tarball (correct: scripts/ excluded).
- `.githooks/pre-push` — NOT in tarball (correct: tooling).
- `.githooks/README.md` — NOT in tarball (correct: tooling).
- `docs/CI_SECRETS.md` — NOT in `package.json:files` (line 8-16 only ships CHANGELOG, RELEASE_NOTES, INTEGRATION_GUIDE, THREAT_MODEL, QA_RUNBOOK). **CI_SECRETS is a repo-internal doc** — correctly excluded from consumer tarball.

`package.json:files` (lines 8-16) is correct.

---

## Lockfile & dep tree

- `pnpm-lock.yaml` lockfileVersion `'9.0'` (line 1).
- `pnpm install --frozen-lockfile --offline` exit 0: *"Lockfile is up to date, resolution step is skipped"*. Lockfile in sync with `package.json`.
- `eslint-plugin-react-hooks@^5.2.0` in package.json:95 — verified in lockfile at line 72 (importer dep) and line 1663 (resolution stub) and line 4285 (resolved version `5.2.0` against `eslint@9.39.4(jiti@2.6.1)`).
- The 4 BUILD-4 removed devDeps (`size-limit`, `@size-limit/preset-small-lib`, `tiny-invariant`, `toxiproxy-node-client`) — `grep -E "(size-limit|tiny-invariant|toxiproxy-node-client)" pnpm-lock.yaml` returns **0 matches**. All four are gone from the lockfile. Commit `d694607` ("chore(deps): remove 4 unused devDeps") landed cleanly.
- `pnpm audit --prod --audit-level=high` → *"No known vulnerabilities found"*. 0 high or critical CVEs in the production tree.

Production dep set (4 packages): `@simplewebauthn/browser`, `idb`, `libphonenumber-js`, `nanoid`. Devs total ~28. Engines: `"node": ">=20.0.0"` (package.json:112). PeerDeps: react/react-dom `>=18`. Reasonable surface.

---

## Coverage gate sanity

`vitest.config.ts:38-43` thresholds (rc.5+ → rc.6 unchanged):
```
lines: 90
branches: 84
functions: 90
statements: 90
```

Local re-run on Windows 2026-05-08 produced (extracted from `coverage/index.html`):
- Statements: 90.41% (8044/8897)
- Branches: 84.73% (2109/2489)
- Functions: 92.64% (491/530)
- Lines: 90.41% (8044/8897)

CHANGELOG rc.6 entry (`docs/CHANGELOG.md:42`) claims `90.72/84.72/92.81/90.72`. The discrepancy (~0.31pp on lines/statements, ~0.17pp on functions, +0.01pp on branches) is consistent with **1 unit test failing locally on Windows** (`test/unit/react/components/PropertySection.test.tsx:129` — `screen.getByText('Main residence')` waitFor times out — pre-existing flake noted in BACKLOG TEST-1, also called out in the CHANGELOG rc.6 deferred list at line 65).

**Margins to threshold (using local Windows numbers, conservative):**
- Lines 90.41 vs 90 → +0.41pp margin
- Branches 84.73 vs 84 → +0.73pp margin (this is the historically-tight gate)
- Functions 92.64 vs 90 → +2.64pp margin
- Statements 90.41 vs 90 → +0.41pp margin

The branches gate is the closest to the floor. CHANGELOG honestly documents `+0.28pp to original 85% target` as deferred work (storage.ts HMAC v3→v4 upgrade path 76.19% + useAccess.ts callback 63.63%). This is honest and tracked.

**Coverage `exclude` list** (vitest.config.ts:44-77) — reasonable:
- `dist/**`, `node_modules/**`, `demo/**`, `scripts/**`, `test/**`, `*.config.*`, `.claude/**` — standard.
- `src/types/**` — pure type defs (no executable code). Correct.
- 5 barrel files (index.ts, profile/index.ts, extendability/index.ts, react/index.ts, react/components/index.ts) — re-export only; v8 doesn't count re-export evaluation. Reasonable per the documented note (lines 60-63).
- `src/sw/index.ts` — SW global scope, covered by Playwright. Correct.
- `src/core/crypto-worker.ts` — Worker module, deferred past v1.0. Reasonable.
- 3 extendability interface declarations — pure interface types. Correct.

---

## Watermark + version drift

- `pnpm verify:watermarks` exit 0: *"all source files carry the canonical BB watermark"* — 268 files scanned across `src`, `scripts`, `test`, `demo`, `.github/workflows` + 7 root configs.
- `pnpm verify:version-sync` exit 0: *"OK — both at 1.1.0-rc.6 (package.json + src/config.ts:231)"*.
- `VERSION_MATRIX.md` v1.6 (2026-05-08) lists 21 components with versions. Cross-checked against actual file watermarks:

| Component | Matrix | File | Match |
|---|---|---|---|
| Package | v1.1.0-rc.6 | `package.json:3` | OK |
| Config | v1.1.3 | `src/config.ts` watermark | (not re-read; matrix entry trusts watermark) |
| ESLint config | v1.0.0-rc.2 | `eslint.config.js:1` | OK (matches) |
| Vitest config | v1.1.0-rc.5 | `vitest.config.ts:1` | OK (matches) |
| CI workflow | v1.1.1 | `.github/workflows/ci.yml:1` | OK |
| Chaos workflow | v1.1.0 | `.github/workflows/chaos.yml:1` | OK |
| Browser-matrix workflow | v1.0.5 | `.github/workflows/browser-matrix.yml:1` | OK |
| verify-watermarks | v1.0.3 | `scripts/verify-watermarks.ts:1` | OK |
| verify-version-sync | v1.0.0 | `scripts/verify-version-sync.ts:1` | OK |

Footer line of VERSION_MATRIX.md (line 149) says "Updated: 2026-05-04 | Lane 2 ships | BB" — **stale**. The watermark line 1 was bumped to `v1.6 | 2026-05-08` but the footer wasn't. Cosmetic drift. Same class as the build.ts header drift. Flagged in debt inventory.

---

## Reproducibility check

Fresh checkout from `v1.1.0-rc.6` tag: not re-cloned (single working copy on disk). However:

1. `pnpm install --frozen-lockfile --offline` — reproducible (lockfile hashes match installed dep tree).
2. `pnpm build` — produces `dist/` with deterministic file layout (8 entry points + N split chunks). Chunk names `chunk-XXXXXXXX.js` are content-addressed by esbuild — should be stable across reproductions. Spot-check from local rc.6 build:
   - `dist/esm/chunk-3RM3QMGM.js`, `chunk-3UGU53KX.js`, `chunk-AYEKYGFX.js`, `chunk-BW67F3TS.js`, `chunk-CELGU6WT.js`, `chunk-OFNHSS3N.js`, `chunk-PHREFXJI.js`, `chunk-QOOWXQHE.js`, `chunk-QRT5D3KS.js`, `chunk-Y2GBHCPN.js`, `client-JOHJLKZ3.js`, `error-hook-FMGBK6H2.js`, `event-reporter-YBWTYA2D.js`, `libphonenumber-js-VJRHUYNU.js`, `queue-ASS3PXBS.js`, `session-events-VYUAHJCV.js`, `session-watcher-5HGRD45M.js`, `settings-sync-2TOEMCT6.js` — 18 internal chunks beyond the 8 entries. Reasonable for `splitting: true`.
3. **File count match:** local `tar -tzf | wc -l` → 249. Published rc.6 tarball file count was not verified directly (tarball is in GitHub Packages, not a release asset), but the structure is determined by `package.json:files` + `dist/` content. With identical lockfile + source tree, the published artifact should match locally-built one modulo timestamps.
4. Source maps shipped (`*.js.map` for every `.js`, `*.d.ts.map` for every `.d.ts`). These contain absolute paths from the build machine — minor info disclosure but standard practice; acceptable.

**Verdict:** semantically reproducible. Hash-identical reproducibility (e.g., for SLSA L3) is not asserted — timestamps in metadata + source maps will differ between machines.

---

## rc.5/rc.6 ship-process retrospective

**rc.5 push (2026-05-06 ~22:55Z):**
- Commit on `agent/sdk-v1-1-rc5-debt-cleanup` triggered run id **25465720549**.
- Pre-push hook output not captured in this audit (would require `git push` log artifact). However the hook's gates are a strict subset of CI build job gates, and CI passed all build steps in 2.5 min — so the pre-push hook **must** have passed too (otherwise the push would have been blocked unless `--no-verify`). The CHANGELOG rc.5 entry at `docs/CHANGELOG.md:115-119` confirms: *"BUILD-1 — Pre-push git hook…landed in this version"*.
- CI run 25465720549 conclusion: **success**. Job-level statuses:
  - `build`: success (16 steps, 22:55:41Z → 22:58:10Z, 2 min 29 sec)
  - `perf`: success
  - `security`: success
  - `memory-quick`: success (5 min 8 sec — within the 10-min timeout)
  - `browser-smoke`: **skipped** (vars.BROWSER_SMOKE_ENABLED gate honored)
  - `dependency-review`: skipped (push event, only fires on PR)

**rc.6 push (2026-05-07 ~00:50Z):**
- Run id **25469587911**, conclusion: **success**. Same job topology: build/perf/security/memory-quick green, browser-smoke skipped, dependency-review skipped.
- Build job: 2 min 34 sec. Memory soak: 5 min 2 sec.

**The BROWSER_SMOKE_ENABLED gate is honored.** Both runs report `browser-smoke.conclusion = "skipped"` — not `"failure"` — confirming the `if:` expression at `ci.yml:118` (and matrix.yml:48) evaluates to false when the variable is unset. Status icon is green-skipped, not red-failed. This is exactly the behavior the BUILD-2 fix targeted.

**No CI runs failed for rc.5 or rc.6.** This is the first 2-RC stretch since the rc.2/rc.3 lint-red incidents that landed cleanly without re-tag/re-push. The pre-push hook (BUILD-1) is plausibly the active cause of the regression suppression.

---

## .githooks/pre-push integrity audit

`.githooks/pre-push` v1.0.0 (2026-05-08), 52 lines.

| Check | Evidence | Result |
|---|---|---|
| Mirrors CI build-job gates | Lines 32-38: `pnpm typecheck → verify:readme → verify:version-sync → lint → verify:no-jose → verify:watermarks` (6 gates). CI build job has 11 (lines 32-42). | PARTIAL — see below |
| Order: cheapest first (fail-fast) | typecheck (~6s) → readme (~1s) → version-sync (<1s) → lint (~6s) → no-jose (~1s) → watermarks (~1s) | OK |
| File mode (working tree) | `stat -c %a` = `755` | OK |
| File mode (git index) | `git ls-files --stage` = `100644` | **FAIL — see below** |
| Bypass-on-emergency documented | Line 11: *"Skip (emergency hotfix only): git push --no-verify"* | OK |
| Remote check | Line 21-23: only fires for `remote == origin`, skips fork pushes | OK |
| `set -euo pipefail` | Line 13 | OK |
| Per-gate output | Line 41 echoes each gate name; line 43-46 emits the failed gate name + remediation. | OK |

**Coverage gap vs CI build job:** pre-push runs **6 gates**; CI build runs **11**. Missing from pre-push: `test:unit`, `build`, `size-check`, `verify:bundle`, `pnpm audit --prod`. The README.md (lines 19-20) says *"Mirrors `.github/workflows/ci.yml` build-job step-for-step. ~30 sec on a warm cache."* — the documentation is **slightly inaccurate**. The 5 missing gates (especially `test:unit` at ~2 min) are the expensive ones; the hook's "30 sec" promise is real, but the "step-for-step" claim is not. This is a deliberate trade-off (cost vs coverage) but the doc should be updated. **Flagged in debt inventory.**

**File mode discrepancy:** working tree is 755 (executable), but git index has it as `100644` (non-exec). This means anyone who clones the repo on a POSIX system will get a non-executable script — `git config core.hooksPath .githooks` will succeed but `git push` won't actually invoke the hook (Linux/macOS git silently skips non-executable hook files). Windows git ignores file modes anyway. **HIGH-priority fix:** `git update-index --chmod=+x .githooks/pre-push && git commit`. Flagged in debt inventory.

---

## Debt inventory

| # | Severity | Area | Issue | Age | Recommendation | Effort |
|---|---|---|---|---|---|---|
| BUILD-9 | HIGH | `.githooks/pre-push` | Git index has file mode `100644` (non-exec); on POSIX clones the hook silently skips | rc.5 (2026-05-08) | `git update-index --chmod=+x .githooks/pre-push && git commit -m "fix(hooks): mark pre-push executable in index"` | 5 min |
| BUILD-10 | LOW | `scripts/build.ts` | Header comment line 30 says "3 entry points" but code holds 8; carry-over from rc.4 | rc.2 (2026-04-28) | One-line edit: `// 8 entry points = 8 chunks (split per §12.1)` | 2 min |
| BUILD-11 | LOW | `docs/VERSION_MATRIX.md` | Header watermark `v1.6 \| 2026-05-08` updated; footer line 149 still says `Updated: 2026-05-04 \| Lane 2 ships` | rc.5 (2026-05-08) | Update footer to match header | 1 min |
| BUILD-12 | LOW | `.github/workflows/ci.yml` | `dependency-review` job has no explicit `timeout-minutes` while every other job got one in BUILD-8 | rc.5 (2026-05-08) | Add `timeout-minutes: 5` (action runs <60s normally) | 2 min |
| BUILD-13 | LOW | `scripts/release.ts` | Pre-flight gates list (lines 53-65) is a strict superset of CI build job EXCEPT missing `pnpm audit --prod --audit-level=high` | rc.5 BUILD-3 (2026-05-08) | Add `{ name: 'audit', cmd: 'pnpm audit --prod --audit-level=high' }` to gates array | 2 min |
| BUILD-14 | LOW | `.githooks/README.md` | Claims pre-push *"mirrors ci.yml build-job step-for-step"* but is missing 5 of 11 gates (test:unit, build, size-check, verify:bundle, audit) | rc.5 (2026-05-08) | Either expand hook to match (cost: ~3 min/push) OR update README to accurately list the 6 gates run | 5 min (doc) or 30 min (hook) |
| BUILD-15 | LOW | `scripts/size-check-closure.ts` measurements | React closure jumped 36.21 → 42.89 KB between rc.5 and rc.6 (+18%); CHANGELOG rc.6 doesn't mention it | rc.6 (2026-05-07) | Run `SIZE_CHECK_VERBOSE=1 pnpm size-check` to attribute the +6.7 KB; if expected, document in CHANGELOG; if regression, fix | 30 min investigation |
| BUILD-16 | MEDIUM | `release.yml` | SLSA attestation `continue-on-error: true` since rc.4 — entitlement still pending | rc.4 (2026-05-06) | Long-term: upgrade owning org to GHEC OR flip repo to public OR drop the step. Tracked. | external decision |
| BUILD-17 | LOW | TEST-1 (Windows-only flake) | `test/unit/react/components/PropertySection.test.tsx:129` waitFor times out on local Windows; passes in Linux CI | pre-rc.5 | Already documented in BACKLOG TEST-1 + CHANGELOG rc.6:64. Investigate root-cause (likely happy-dom + Windows + waitFor interaction) | 1-2 hr |
| BUILD-18 | LOW | `verify:no-jose` | Falls back to `npm ls --omit=dev --all` without explicit failure if pnpm crashes; could mask broken trees | foundational (2026-04-24) | Add explicit `process.exit(2)` if both `pnpm ls` and `npm ls` throw, instead of warning + exit 0 | 5 min |
| BUILD-19 | INFO | Coverage margins | Branches threshold 84 vs measured ~84.72 — only 0.73pp margin; tightest of the four gates | rc.5 | Continue COV-1 work to lift margin; tracked in BACKLOG | external scope |
| BUILD-20 | INFO | `dist/esm/*.js.map` | Source maps ship to consumers and contain build-machine absolute paths | foundational | Optional: switch to `--source-root` or strip paths post-build. Low priority — not a security risk for a private package. | 30 min |

Total: 12 debt items. **1 HIGH** (BUILD-9 — git index mode), **1 MEDIUM** (BUILD-16 — SLSA, blocked on external entitlement), **10 LOW/INFO**. Net-progress vs rc.4: 8 BUILD-* items closed, 12 new (mostly INFO/LOW) surfaced — most are 1-5 minute one-line fixes.

---

## Recommendations (ranked)

1. **(BUILD-9, 5 min, HIGH)** Fix git index mode of `.githooks/pre-push`. POSIX clones currently silently skip the hook. One command + commit.
2. **(BUILD-15, 30 min, MEDIUM)** Investigate the `react` closure 36.21 → 42.89 KB jump between rc.5 and rc.6. Run `SIZE_CHECK_VERBOSE=1 pnpm size-check` to attribute. If expected, add CHANGELOG note; if regression, fix before GA.
3. **(BUILD-13, 2 min, LOW)** Add `pnpm audit --prod --audit-level=high` to `release.ts` pre-flight gates so the release script truly mirrors CI build job.
4. **(BUILD-12, 2 min, LOW)** Add `timeout-minutes: 5` to `dependency-review` job in `ci.yml` — symmetry with BUILD-8.
5. **(BUILD-14, 5 min, LOW)** Update `.githooks/README.md` to honestly list the 6 gates the hook runs, OR add the 5 missing gates to the hook (cost trade-off — current 6-gate hook is fast, true mirror would be ~3 min). Decision recommended: keep the fast hook + fix the README.
6. **(BUILD-10 + BUILD-11, 3 min combined, LOW)** Sweep the two stale doc strings (`build.ts:30` "3 entry points", `VERSION_MATRIX.md:149` "2026-05-04").
7. **(BUILD-16, external)** Decide on SLSA path: upgrade GHEC, flip repo public, or drop the step. Currently soft-failing.
8. **(BUILD-17, 1-2 hr, LOW)** Root-cause the Windows-only `PropertySection.test.tsx` flake. Linux CI is unaffected so this is dev-experience only, but it erodes confidence in `pnpm test:unit` on Sam's machine.
9. **(BUILD-18, 5 min, LOW)** Tighten `verify-no-jose` failure mode.
10. **(BUILD-19, external)** Continue COV-1 push toward 85% branches for v1.1.0 GA.

Items 1–6 total **~50 minutes** of mechanical work to lift the audit score from 8.6 → ~9.2. Item 7 is the only one with external dependencies. Items 8–10 are continuous improvement and don't block GA.

---

*Audit conducted 2026-05-08 against `main` HEAD `80ad904` on Windows 11. All commands run with permission. No source modifications. Pact tarball and dist artifacts cleaned post-audit.*
