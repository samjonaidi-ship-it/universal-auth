// @samjonaidi-ship-it/universal-auth | scripts/release.ts | v1.0.2 | 2026-05-01 | BB
// Release script — pre-flight checks, then bumps version, tags, pushes, and
// lets `release.yml` workflow handle the actual publish + provenance + SBOM.
//
// Usage:
//   pnpm release <patch|minor|major>           # full pre-flight + bump + push
//   pnpm release <patch|minor|major> --skip-pre-flight  # emergency hotfix path
//
// Steps:
//   0. Pre-flight (NEW v1.0.2 lookback C9): typecheck + unit tests + lint +
//      verify-no-jose + verify-watermarks. Bails on any failure with a
//      readable message so a broken build can't be tagged + pushed.
//   1. Verify clean working tree (no uncommitted changes).
//   2. `npm version <bump>` — updates package.json + creates a git commit + tag.
//   3. `git push` + `git push --tags` — triggers the Release workflow on tag.
//
// Intentionally NOT semantic-release: the project favors explicit human-driven
// version bumps. The release.yml workflow on push of a `v*` tag handles
// publishing to GitHub Packages and generating SLSA provenance + CycloneDX SBOM.

import { execSync } from 'node:child_process';

type Bump = 'patch' | 'minor' | 'major';

function run(cmd: string): string {
  return execSync(cmd, { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }).trim();
}

function runInherit(cmd: string): void {
  execSync(cmd, { stdio: 'inherit' });
}

function fail(msg: string): never {
  console.error(`[release] ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const bump = args[0] as Bump | undefined;
const skipPreFlight = args.includes('--skip-pre-flight');

if (!bump || !['patch', 'minor', 'major'].includes(bump)) {
  fail('usage: pnpm release <patch|minor|major> [--skip-pre-flight]');
}

// Step 0 — pre-flight (v1.0.2 lookback C9)
if (!skipPreFlight) {
  console.log('[release] running pre-flight gates (typecheck + lint + tests + verify)...');
  // BUILD-3 (rc.5 audit): added verify:readme + verify:version-sync + build +
  // size-check + verify:bundle + test:perf — these are exactly the gates that
  // failed on rc.2/rc.3 main pushes (lint + version-sync + size-limit script).
  // Pre-flight now mirrors CI's `build` job step-for-step.
  const gates: { name: string; cmd: string }[] = [
    { name: 'typecheck',           cmd: 'pnpm typecheck' },
    { name: 'verify:readme',       cmd: 'pnpm verify:readme' },
    { name: 'verify:version-sync', cmd: 'pnpm verify:version-sync' },
    { name: 'lint',                cmd: 'pnpm lint' },
    { name: 'verify:no-jose',      cmd: 'pnpm verify:no-jose' },
    { name: 'verify:watermarks',   cmd: 'pnpm verify:watermarks' },
    { name: 'test:unit',           cmd: 'pnpm test:unit -- --run' },
    { name: 'build',               cmd: 'pnpm build' },
    { name: 'size-check',          cmd: 'pnpm size-check' },
    { name: 'verify:bundle',       cmd: 'pnpm verify:bundle' },
    { name: 'test:perf',           cmd: 'pnpm test:perf' },
  ];
  for (const g of gates) {
    console.log(`[release]   • ${g.name}…`);
    try {
      runInherit(g.cmd);
    } catch {
      fail(`pre-flight gate '${g.name}' failed. Fix locally before tagging, or pass --skip-pre-flight for an emergency hotfix.`);
    }
  }
  console.log('[release] all pre-flight gates passed.');
} else {
  console.warn('[release] WARNING: --skip-pre-flight set; skipping typecheck/lint/tests. Use only for documented hotfixes.');
}

// Step 1 — clean working tree
const status = run('git status --porcelain');
if (status.length > 0) {
  fail(`working tree is not clean. Commit or stash changes before releasing:\n${status}`);
}

// Step 2 — bump version (npm version creates the commit + tag for us).
// `npm version` defaults to creating both commit + tag; no flag needed.
console.log(`[release] bumping ${bump} version...`);
const newVersion = run(`npm version ${bump} -m "release: %s"`);
console.log(`[release] new version: ${newVersion}`);

// Step 3 — push commit + tag (release.yml fires on tag push)
console.log('[release] pushing commit + tag to origin...');
runInherit('git push');
runInherit('git push --tags');

console.log(`[release] done. Tag ${newVersion} pushed — release.yml workflow will publish.`);
