// @samjonaidi-ship-it/universal-auth | scripts/verify-watermark-bump.ts | v1.0.1 | 2026-09-21 | BB
// CI gate: a changed, watermarked file must bump its watermark.
//
// scripts/verify-watermarks.ts checks that every source file HAS the header; this
// checks that a change to a file MOVES it. Recommended in five lookback audits
// (#3, #4, #7, #9, #13 - `bb outstanding` O-3) and not built until ControlTower's
// PR #556; this is the SDK's port, with its own parser because the SDK's headers
// differ (`-rc.N` pre-releases, short `v1.4` docs, an optional date). The rule, the
// header grammar and the failure kinds live in scripts/lib/watermark-scan.ts
// (pure, so the tests can import it). This file is the git plumbing and the report.
//
// Wired as the second step of `pnpm verify:watermarks`, which `ci.yml` (build job)
// and .githooks/pre-push already run - so it binds every PR and every push.
//
// What it compares: the merge-base of BASE_REF and HEAD (the state the change started
// from) against HEAD. A multi-commit PR is judged on its NET effect: bump once,
// anywhere in the branch, and every commit is fine.
//
// BASE_REF:
//   env BASE_REF wins.
//   in CI (CI=true)   HEAD^ - a PR is checked out as a merge commit, so HEAD^ is the base
//                     branch tip; on a push to main it is the previous main. actions/checkout
//                     fetches ONE commit by default, so HEAD^ does not exist yet: this script
//                     fetches one more level (`git fetch --depth=2 origin <HEAD sha>`) first -
//                     ci.yml is not edited to do it.
//   locally, on a branch   origin/main - a branch of five commits is judged as one change
//                     (HEAD^ would judge only the last commit and call an earlier
//                     commit's bump missing).
//   locally, on main       HEAD^ - the last merge unit.
//
// NOTE: reads COMMITTED history only. Commit first, then check.
//
// Exit codes: 0 - every changed watermarked file bumped (or nothing to check)
//             1 - at least one did not
//             1 - in CI, when the diff cannot be computed (a gate that proves nothing must
//                 not read as green); 0 with a warning locally, where an unreachable
//                 base is not a verdict.

import { execFileSync } from 'node:child_process';
import { checkChange, parseNameStatus, remedy } from './lib/watermark-scan.js';

const TAG = '[verify-watermark-bump]';
const inCi = process.env['CI'] === 'true' || process.env['CI'] === '1';

function git(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function tryGit(args: string[]): string | null {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

/** Read a blob at a commit; null when the path does not exist there. */
function readAt(rev: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** Pick BASE_REF per the header comment. */
function resolveBase(): string {
  const fromEnv = process.env['BASE_REF'];
  if (fromEnv) return fromEnv;
  if (!inCi) {
    const mb = tryGit(['merge-base', 'origin/main', 'HEAD']);
    const head = tryGit(['rev-parse', 'HEAD']);
    // On main itself (or when origin/main is HEAD) there is no branch to judge; fall through to HEAD^.
    if (mb && head && mb !== head) return 'origin/main';
  }
  return 'HEAD^';
}

/**
 * actions/checkout is depth 1: HEAD^ is absent until one more level of history is fetched.
 * The fetch names HEAD's own SHA. `git fetch --deepen=1 origin` does NOT work here - a pull_request job
 * is a checkout of refs/pull/N/merge, which the default refspec (refs/heads/*) never fetches, so the
 * shallow commit is not one of the tips `--deepen` extends (measured on this repo's first CI run).
 */
function ensureParentAvailable(): void {
  if (tryGit(['rev-parse', '--is-shallow-repository']) !== 'true') return;
  if (tryGit(['rev-parse', '--verify', '--quiet', 'HEAD^']) !== null) return;
  const head = tryGit(['rev-parse', 'HEAD']);
  if (head === null || tryGit(['fetch', '--no-tags', '--quiet', '--depth=2', 'origin', head]) === null) {
    console.warn(`${TAG} could not fetch the parent of the shallow checkout (git fetch --depth=2 origin <HEAD> failed)`);
  }
}

function cannotJudge(base: string, err: unknown): never {
  const first = (s: unknown): string => String(s ?? '').trim().split('\n')[0] ?? '';
  const why = [first(err instanceof Error ? err.message : err), first((err as { stderr?: unknown } | null)?.stderr)]
    .filter((s) => s !== '')
    .join(' - ');
  console.error(`${TAG} could not diff against ${base}: ${why}`);
  // A real root commit has nothing before it: no change to judge, in CI as anywhere. A SHALLOW clone's
  // boundary commit also looks parentless to git, so shallow is excluded - that is a failure, not a root.
  if (
    base === 'HEAD^' &&
    tryGit(['rev-parse', '--is-shallow-repository']) !== 'true' &&
    tryGit(['rev-list', '--max-parents=0', 'HEAD']) === tryGit(['rev-parse', 'HEAD'])
  ) {
    console.error('(HEAD is a root commit - nothing to compare)');
    process.exit(0);
  }
  if (inCi) {
    console.error('In CI a gate that cannot compute its diff must not pass silently. Re-run the job, or set BASE_REF.');
    process.exit(1);
  }
  console.error('(treating as clean - set BASE_REF or fetch more git history)');
  process.exit(0);
}

function main(): void {
  const base = resolveBase();
  if (inCi && base === 'HEAD^') ensureParentAvailable();

  let mergeBase: string;
  let nameStatus: string;
  try {
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
    nameStatus = git(['diff', '--name-status', '-z', '-M', '--no-ext-diff', '--no-color', mergeBase, 'HEAD']);
  } catch (err) {
    return cannotJudge(base, err);
  }

  const { violations, checked, unrecognised } = checkChange(
    parseNameStatus(nameStatus),
    { get: (p) => readAt(mergeBase, p) },
    { get: (p) => readAt('HEAD', p) },
  );

  if (unrecognised.length > 0) {
    console.warn(
      `${TAG} WARNING - ${unrecognised.length} modified file(s) carry a header-shaped line the parser cannot read (expected \`| vX.Y.Z |\`):`,
    );
    for (const f of unrecognised.slice(0, 10)) console.warn(`  ? ${f}`);
    console.warn('  These are NOT checked. Fix the header shape so the next change to them is.');
  }

  if (violations.length === 0) {
    console.log(`${TAG} OK - ${checked} watermarked file(s) changed vs ${base}, all bumped.`);
    process.exit(0);
  }

  console.error(
    `${TAG} ${violations.length} changed file(s) did not bump their watermark ` +
      `(vs ${base}, ${checked} watermarked file(s) changed):\n`,
  );
  for (const v of violations) {
    const shown = v.kind === 'watermark-removed' ? `${v.from} -> (none)` : `${v.from} -> ${v.to}`;
    console.error(`  ✗ ${v.file}:${v.line}  [${v.kind}] ${shown}`);
  }
  console.error('\nThe header is the file\'s per-file changelog; a change that leaves it alone lands with no record.');
  for (const k of [...new Set(violations.map((v) => v.kind))]) console.error(`  ${k}: ${remedy(k)}`);
  console.error('Lookback audits #3, #4, #7, #9, #13 - see scripts/lib/watermark-scan.ts.');
  process.exit(1);
}

main();
