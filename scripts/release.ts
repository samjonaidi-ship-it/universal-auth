// @bainbridgebuilders/universal-auth | scripts/release.ts | v1.0.1 | 2026-05-01 | BB
// Minimal release script — bumps version, tags, pushes, and lets the
// `release.yml` workflow handle the actual publish + provenance attestation.
//
// Usage: pnpm release <patch|minor|major>
//
// Steps:
//   1. Verify clean working tree (no uncommitted changes).
//   2. `npm version <bump>` — updates package.json + creates a git commit + tag.
//   3. `git push` + `git push --tags` — triggers the Release workflow on tag.
//
// Intentionally NOT semantic-release: the project favors explicit human-driven
// version bumps. The release.yml workflow on push of a `v*` tag handles
// publishing to GitHub Packages and generating SLSA provenance.

import { execSync } from 'node:child_process';

type Bump = 'patch' | 'minor' | 'major';

function run(cmd: string): string {
  return execSync(cmd, { stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf8' }).trim();
}

function fail(msg: string): never {
  console.error(`[release] ${msg}`);
  process.exit(1);
}

const bump = process.argv[2] as Bump | undefined;
if (!bump || !['patch', 'minor', 'major'].includes(bump)) {
  fail('usage: pnpm release <patch|minor|major>');
}

// Step 1 — clean working tree
const status = run('git status --porcelain');
if (status.length > 0) {
  fail(`working tree is not clean. Commit or stash changes before releasing:\n${status}`);
}

// Step 2 — bump version (npm version creates the commit + tag for us)
console.log(`[release] bumping ${bump} version...`);
const newVersion = run(`npm version ${bump} --no-git-tag-version=false -m "release: %s"`);
console.log(`[release] new version: ${newVersion}`);

// Step 3 — push commit + tag (release.yml fires on tag push)
console.log('[release] pushing commit + tag to origin...');
execSync('git push', { stdio: 'inherit' });
execSync('git push --tags', { stdio: 'inherit' });

console.log(`[release] done. Tag ${newVersion} pushed — release.yml workflow will publish.`);
