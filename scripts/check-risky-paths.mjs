#!/usr/bin/env node
// BB_Tools | guardrails/check-risky-paths.mjs | v1.6.0 | 2026-09-05 | BB
// CANONICAL. Every managed repo carries a byte-identical copy at scripts/check-risky-paths.mjs;
// edit THIS file, then `node sync-guardrails.mjs --pr` (BB_Tools). Per-repo config is scripts/risky-paths.json.
//
// v1.6.0: a COMMA in a path was a bypass, and the CLI path was weaker than the CI one.
//   One `split(/[\n,]/)` served both CHANGED_FILES and PR_LABELS. Labels may be
//   comma-separated; paths may CONTAIN a comma, so `credentials,x.json` became two
//   names that match nothing and the file reported routine — the same class the gate
//   workflow refuses for a newline, which its NUL-vs-line guard cannot see. Paths now
//   split on newline only. Separately, `--diff` still ran a bare
//   `git diff --name-only`: a rename hid the path a file LEFT (so `git mv` of this
//   very file read routine), C-quoting hid odd paths, and .trim() truncated a path
//   ending in a newline. It now uses --no-renames -z and does not trim.
//   Reviewer P3s on the same change: splitPaths still trimmed (a leading/trailing
//   space is legal, and trimming yields a name that does not exist, so the content
//   scans skip it). NOTHING is stripped from a path now. A CR, or a byte that is not
//   valid UTF-8 (Node replaces it with U+FFFD silently), is REFUSED with exit 2 —
//   the same answer the gate gives a newline in a path. Stripping a trailing \r was
//   the intermediate version and is just a one-character trim with the same failure.
// v1.4.0: BB_HEAD_REF / BB_BASE_REF let the CLI read both sides of the diff from
// git REFS instead of the working tree. The risky-path gate now runs under
// pull_request_target, where the checkout is the BASE — so reading "head" from disk
// read the base twice and content scans went blind to added risky content.
// v1.3.0: the three execFileSync git calls inherited execFileSync's 1 MB default
// maxBuffer. The reader throw was caught by contentHits and read as "deleted", so a
// file too large to capture was SKIPPED rather than scanned. See gitShow below.
// Absence is git exiting 128 AND SAYING the path is not on the ref; every other
// read failure — including an unfetched base ref, which also exits 128 — fails closed.
// v1.2.0: a content scan that is NOT DECLARED in risky-paths.json fails closed
// (exit 2) instead of being read as "off". Three reviewer P1s in a row (codex,
// 2026-09-02, RevExp5 / ProjExp5 / BB_Scan) made the same point: an absent key
// silently disables a scan. Each repo now says `false` explicitly, with a note.
// v1.2.1: the declaration must be EXACTLY false or a complete scan object; null, "",
// 0 or a partial object are rejected (reviewer: a falsey value would pass the presence
// check and then read as off).
// v1.2.2: "complete" also means USABLE - non-empty dirs and extensions, a pattern that
// compiles and is not empty, max_bytes > 0 (reviewer: an object with dirs: [] passed the
// shape check and matched nothing).
// v1.5.0: authz_content_scan — a THIRD content scan, for authorization.
//   Three consecutive authz changes shipped as "no risky paths" on 2026-09-05
//   (CalExp5 #340 menu gates, CalExp5 #344 capability table, Bridge #400 the
//   scoping rule itself). An authorization decision lives wherever it is made —
//   a component, a hook, a route — so no filename pattern reaches it, and
//   widening paths to cover those files gates every unrelated edit to them.
//   Same reasoning that produced the DDL and money scans; the pattern is
//   per-repo because the vocabulary is (can('...') vs request.isAdmin).
//   Repos that have not configured one must declare it false, like the others.
// v1.2.4: the throw names WHICH scan is misconfigured ("ddl_content_scan" / "money_content_scan"),
// not only why - a repo with both keys wrong got one message and no way to tell them apart.
// v1.2.3: the validation lives in the MODULE (scanConfigProblem), not only in the CLI
// block, so an importer that calls ddlContentHits/moneyContentHits with an undeclared
// or unusable config throws instead of silently scanning nothing (reviewer P2, twice).
// v1.1.0: money is now also detected by CONTENT (imports of the QBO/QBT/Chase
//   clients), the same way migrations are detected by DDL. See moneyContentHits.
//   Content scans look at BOTH sides of the diff (eitherSide): a deleted file,
//   or one whose risky import / DDL was removed, is judged by what it was.
//
// The label gate behind AGENTS.md section 4.
//
// The contract says agents may auto-merge routine work but must STOP for risky
// work — auth, migrations, CI/protection config, secrets, deploy, money. That was
// convention: nothing actually stopped an agent auto-merging an auth change.
//
// This makes it mechanical, and it composes with auto-merge rather than fighting
// it. As a REQUIRED check it stays red while a risky PR is unlabelled, so
// auto-merge waits instead of merging. Sam adds the `human-reviewed` label, the
// workflow re-runs on the `labeled` event, the check goes green, and the PR
// merges on its own. Nobody has to remember anything.
//
// Fails CLOSED: if the changed-file list cannot be determined, it refuses rather
// than passing. A gate that opens when it is confused is not a gate.
//
// Usage (CI):  node scripts/check-risky-paths.mjs
//   env  CHANGED_FILES  NEWLINE-separated repo-relative paths. A comma is NOT a
//                       separator here — it is a legal character in a path.
//        PR_LABELS      comma- or newline-separated label names
// Usage (local, against origin/main):
//   node scripts/check-risky-paths.mjs --diff
//
// Exit codes: 0 — safe, or risky-but-labelled. 1 — risky and unlabelled. 2 — could
// not determine the diff (fail closed).

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = JSON.parse(readFileSync(`${ROOT}scripts/risky-paths.json`, 'utf8'));

/**
 * execFileSync's DEFAULT maxBuffer is 1 MB, and unlike spawnSync it THROWS on
 * overflow: `err.code === 'ENOBUFS'`, `err.status === null`, and an `err.stdout`
 * that has been SILENTLY CUT at the limit. Measured 2026-09-02 against a 2 MB
 * tracked blob: the default captured 1,097,728 bytes and threw; 64 MB captured
 * the whole file.
 *
 * A `git show` over 1 MB is ordinary — a lockfile, a bundled asset, a generated
 * client. Three calls here inherited that default:
 *
 *   - the content-scan readers (fileReader / baseReader). Their throw was caught
 *     by contentHits and read as "deleted or moved in this PR", so an oversized
 *     file was SKIPPED rather than scanned. A gate that skips is a gate that
 *     misses: a service whose base copy held the QBO import would come out
 *     routine. Today every managed repo sets max_bytes to 400,000, so the
 *     intended size skip and the ENOBUFS skip coincide and nothing looks wrong —
 *     the miss arrives the day a repo raises max_bytes past 1 MB, which is a
 *     per-repo config value this file does not control.
 *   - `git diff --name-only` under --diff, where a large enough changed-file list
 *     threw and was reported as "could not diff against origin/main": fail-closed,
 *     but blaming the diff for what is really a capture limit.
 *
 * So: a generous explicit limit, read per call so a test can override it, and
 * overflow raised as its OWN condition instead of collapsing into "absent".
 *
 * INVARIANT: max_bytes must stay below this limit. contentHits applies the size
 * skip AFTER the read, so a max_bytes above the capture limit could never be
 * reached — the read would overflow first.
 */
const GIT_MAX_BUFFER_DEFAULT = 64 * 1024 * 1024;
/** Read per call, not at import: a module-load constant cannot be overridden by a test. */
const gitMaxBuffer = () => {
  const n = Number(process.env.BB_GIT_MAX_BUFFER);
  // `Number(x) || DEFAULT` let a NEGATIVE through, and execFileSync then throws
  // ERR_OUT_OF_RANGE before git ever runs. That is not an ENOBUFS, so the catch
  // below would have read it as absence and skipped the file — the same miss this
  // file exists to stop, reintroduced through a typo in an env var.
  return Number.isFinite(n) && n > 0 ? n : GIT_MAX_BUFFER_DEFAULT;
};

/** The one failure meaning "the output did not fit", as opposed to "it is not there". */
export const isOverflow = (err) => !!err && err.code === 'ENOBUFS';

/**
 * A reader failure that is NOT "the file is not there".
 *
 * Absence is git exiting 128 AND SAYING SO. 128 alone is not the signature: it is
 * git's generic fatal code, shared with an unfetched or mistyped base ref
 * ("invalid object name") and a cwd that is not a repository. Reading those as
 * absence would skip EVERY file in the diff and report the PR routine — a worse
 * miss than the overflow, and the one the reviewer caught on the second push of
 * this change. Everything else (ENOBUFS, ERR_OUT_OF_RANGE from a bad limit, ENOENT
 * because git is not on PATH, a damaged object store) fails closed.
 *
 * A bare Error (no tag, no status) stays skippable on purpose: the downstream
 * suites inject readers that throw one to mean "deleted", and that contract is
 * what BB_Micro_Bridge/tests/risky-paths.test.js asserts.
 */
export const isFatalReadError = (err) => !!err && (err.fatal === true || err.overflow === true || isOverflow(err));

/**
 * git's own words for "that path is not on that ref" — the ONLY 128 that means
 * absence. Both spellings are absence: the second is what git says when the path
 * exists in the working tree but not in the ref being read.
 */
const ABSENT_ON_REF = /does not exist in|exists on disk, but not in/;

/**
 * `git show <ref>:<path>`, with overflow distinguished from absence.
 *
 * An ABSENT path throws unchanged and contentHits skips it — the documented
 * contract for a file deleted in this PR or added since the base. Every other
 * failure is tagged (`.overflow` or `.fatal`) and contentHits refuses to read it
 * as absence. See ABSENT_ON_REF for why the exit code alone is not enough.
 */
export function gitShow(base, f, root = process.cwd()) {
  const max = gitMaxBuffer();
  try {
    return execFileSync('git', ['show', `${base}:${f}`], {
      cwd: root, encoding: 'utf8', maxBuffer: max,
      // stderr must be CAPTURED, not inherited: absence is identified by what git
      // says, and an inherited stderr also spills "fatal: ..." into the CI log every
      // time a PR deletes a file, which reads like a failure and is not one.
      stdio: ['ignore', 'pipe', 'pipe'],
      // Force English. The absence test reads git's message, and a translated one
      // would be classed fatal — safe (it blocks) but noisy for every deletion.
      env: { ...process.env, LC_ALL: 'C', LANGUAGE: '' },
    });
  } catch (err) {
    const stderr = String(err.stderr || '');
    // git ran and said the path is not on this ref. Rethrown untagged so contentHits
    // skips it — a file deleted in this PR, or added since the base. Measured:
    //   absent path   status 128  "fatal: path 'x' does not exist in 'HEAD'"
    //   bad base ref  status 128  "fatal: invalid object name 'origin/mian'."
    //   not a repo    status 128  "fatal: not a git repository"
    // Only the first is absence. The other two must NOT skip the file.
    if (err.status === 128 && ABSENT_ON_REF.test(stderr)) throw err;
    if (!isOverflow(err)) {
      // A 128 that is not absence, or git never running at all: a bad maxBuffer
      // (ERR_OUT_OF_RANGE), git missing from PATH (ENOENT), a damaged object store.
      // Tagged so the scan fails closed instead of reading the silence as "not there".
      err.fatal = true;
      const why = stderr.split('\n').find(Boolean);
      if (why) err.message = `git show ${base}:${f} failed: ${why}`;
      throw err;
    }
    const got = Buffer.byteLength(err.stdout || '');
    const e = new Error(`git show ${base}:${f} produced more output than the ${max}-byte capture limit `
      + `(ENOBUFS; ${got} bytes captured before it was cut). Raise BB_GIT_MAX_BUFFER to capture it.`);
    e.overflow = true;
    throw e;
  }
}

/**
 * Pure matcher — exported so tests can drive it without a git repo or CI env.
 * Returns [{name, why, files}] for every category with at least one hit.
 */
export function riskyHits(files, config = CONFIG) {
  const hits = [];
  for (const cat of config.categories) {
    const res = cat.patterns.map((p) => new RegExp(p));
    const matched = files.filter((f) => res.some((r) => r.test(f)));
    if (matched.length) hits.push({ name: cat.name, why: cat.why, files: matched });
  }
  return hits;
}

/**
 * Schema writers found by CONTENT rather than by name.
 *
 * Filename matching lost this argument twice. `migrate*` missed
 * `db/apply-schema.mjs`; the `apply*` fix then missed `_apply-mig-076.mjs`,
 * which abbreviates "migration" to "mig". Adding "mig" would still have missed
 * `cutover-fabric-tables.mjs` and `_deep_audit_why_shadow.mjs` — both run DDL
 * under names that advertise nothing. There is no regex over filenames that
 * closes this; the name is simply not the signal.
 *
 * Scoped to scripts/ and migrations/ on purpose. Repo-wide, 135 files contain
 * DDL and 105 are already gated, but the remaining 30 are mostly routes running
 * CREATE TABLE IF NOT EXISTS to self-heal — gating every edit to platform-v1.js
 * would be noise for no safety. Inside these two directories a file containing
 * DDL *is* a schema applier: there it is exactly 4 files, all of them real.
 *
 * @param readFile injected so tests need no fixtures on disk
 */
export function ddlContentHits(files, readFile, config = CONFIG) {
  return contentHits(config.ddl_content_scan, files, readFile, 'ddl_content_scan');
}

/**
 * Money code found by CONTENT rather than by name.
 *
 * Same lesson as the DDL scan, learned again on 2026-09-01: the money category
 * matched three narrow filenames and missed the QuickBooks, QBT and Chase
 * clients themselves plus every caller of them — qbo-v2.js, qbt.js,
 * chase-ledger.js, chase-bank-feed.js, both pto-*-adapter files, all seven
 * receipt-qbo-*.js. A change to any of those was classified routine. The
 * filename patterns now catch the clients; this scan catches the files that
 * IMPORT them, which is where a wrong amount or wrong customer actually gets
 * posted.
 *
 * Scoped to src/ on purpose: tests and scripts import these clients to mock or
 * probe them, not to post.
 *
 * @param readFile injected so tests need no fixtures on disk
 */
export function moneyContentHits(files, readFile, config = CONFIG) {
  return contentHits(config.money_content_scan, files, readFile, 'money_content_scan');
}


/**
 * Authorization decisions found by CONTENT rather than by name.
 *
 * The third time the same lesson arrived, 2026-09-05. Three consecutive changes
 * to authorization shipped classified as routine:
 *   CalExp5 #340 — added can('assets.admin') to two menu entries
 *   CalExp5 #344 — added a capability to useFeatures' LEGACY_FALLBACK table
 *   Bridge  #400 — changed WHO the asset list is scoped to, in a route
 * Each printed "no risky paths — skipping review".
 *
 * No filename pattern reaches them. The auth category matches
 * src/(plugins|middleware)/(auth|session|visibility) and files NAMED
 * auth/session/permission/role — but an authorization decision lives wherever
 * it is made: a React component's menu entry, a capability table in a hook, a
 * ternary inside a route handler. Widening the paths to catch those means
 * gating every edit to MenuDrawer or assets-v1, which is noise, and it still
 * misses the next file.
 *
 * The content is the signal, exactly as it was for DDL and for money.
 *
 * Each repo supplies its own pattern, because the vocabulary differs: CalExp5
 * decides with can('...') against a fallback table, the Bridge with
 * request.isAdmin and getVisibilityFilter. Measured before enabling — CalExp5:
 * 25 of 467 src files, ~5%.
 *
 * @param readFile injected so tests need no fixtures on disk
 */
export function authzContentHits(files, readFile, config = CONFIG) {
  return contentHits(config.authz_content_scan, files, readFile, 'authz_content_scan');
}


/**
 * Carpool-declaration ROUTE HANDLERS found by CONTENT rather than by name.
 *
 * The fourth time the same lesson arrived, 2026-09-16 (T3 lookback audit,
 * third round this session): PR #593 (POST /declare-carpool's own draftId
 * ownership check — closing the gap where a crafted draftId could scope a
 * GPS-evidence exemption to a different employee's or a different day's
 * draft) pre-push-classified routine. The payroll-guards category (added
 * earlier this same session, PR #577) covers guards.js and
 * src/modules/carpool/, but the carpool-declaration ROUTE HANDLERS
 * themselves live in src/routes/auto-ts-v1.js — deliberately excluded from
 * money_content_scan and the money category's own path patterns
 * (auto-ts-v1.js is 19% of all commits by itself, mostly one hub-route
 * call among hundreds of lines; adding all of src/routes/ was measured and
 * rejected for that reason). Same shape as authzContentHits above and for
 * the same underlying reason: the decision lives in the handler, not a
 * filename.
 *
 * Measured before enabling: of the last 100 commits touching
 * src/routes/auto-ts-v1.js, 11 (11%) touch a line containing one of these
 * tokens — the same order of magnitude as authz_content_scan's own 15%
 * (3/20), nowhere near the 71% the full-routes/ pattern was rejected for.
 *
 * @param readFile injected so tests need no fixtures on disk
 */
export function carpoolDeclareContentHits(files, readFile, config = CONFIG) {
  return contentHits(config.carpool_declare_content_scan, files, readFile, 'carpool_declare_content_scan');
}


/** Why a scan config is unusable, or null. Exactly false is a declaration ("off"); anything else must be a usable object. */
export function scanConfigProblem(v) {
  if (v === false) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v === undefined ? 'undeclared' : 'not an object (declare false or a scan object)';
  if (!Array.isArray(v.dirs) || !v.dirs.length || !v.dirs.every((d) => typeof d === 'string' && d)) return 'dirs must be a non-empty list of strings';
  if (!Array.isArray(v.extensions) || !v.extensions.length || !v.extensions.every((x) => typeof x === 'string' && x)) return 'extensions must be a non-empty list of strings';
  if (typeof v.pattern !== 'string' || !v.pattern.trim()) return 'pattern must be a non-empty string';
  try { new RegExp(v.pattern, 'i'); } catch { return 'pattern does not compile'; }
  if (typeof v.max_bytes !== 'number' || !(v.max_bytes > 0)) return 'max_bytes must be > 0';
  return null;
}

function contentHits(cfg, files, readFile, key = 'content_scan') {
  if (cfg === false) return [];
  const why = scanConfigProblem(cfg);
  if (why) throw new Error(`content scan config "${key}": ${why}`);
  const re = new RegExp(cfg.pattern, 'i');
  const hits = [];
  for (const f of files) {
    if (!cfg.dirs.some((d) => f.startsWith(d))) continue;
    if (!cfg.extensions.some((e) => f.endsWith(e))) continue;
    let src;
    // A deleted or renamed-away file is not readable from the head commit. It
    // cannot introduce anything either, so skipping is correct, not a blind spot.
    // An OVERFLOW is NOT absence: it is a file too large to capture, and
    // swallowing it here is exactly how a risky file leaves the gate unexamined.
    try { src = readFile(f); } catch (err) { if (isFatalReadError(err)) throw err; continue; }
    if (src.length > cfg.max_bytes) continue;
    if (re.test(src)) hits.push(f);
  }
  return hits;
}

/**
 * Reader for the content scans: the file as it is at head, or — when it is not
 * on disk because the PR DELETES it — as it was on the base.
 *
 * Caught by the pre-push reviewer on the first push of the money scan: reading
 * only from disk made deletions invisible, so a PR that removed
 * src/services/pto-requests.js (a QBT caller with no money token in its name)
 * came out routine. Removing a posting path is a money change. Judging a
 * deleted file by what it WAS closes that; a file absent on both sides is
 * genuinely nothing and the scan skips it.
 *
 * @param base ref the deleted file is read from; origin/main is what CI diffs against
 */
export function fileReader(base = 'origin/main', root = process.cwd()) {
  return (f) => {
    try { return readFileSync(f, 'utf8'); } catch { /* deleted or moved in this PR */ }
    return gitShow(base, f, root);
  };
}

/** The file as it was on the base ref only. Throws if it did not exist there. */
export function baseReader(base = 'origin/main', root = process.cwd()) {
  return (f) => gitShow(base, f, root);
}

/**
 * A content scan over BOTH sides of the diff: a file is a hit if its head copy
 * OR its base copy matches.
 *
 * Reviewer finding on the fourth push of the money scan: reading the head copy
 * (with a base fallback only when the file was gone) still missed a file that
 * REMAINS but whose risky content was removed — e.g. a service that dropped its
 * `import ... from '../clients/qbo-v2.js'`. Removing a posting path, or
 * removing DDL from an applier, is exactly the kind of change the gate exists
 * for. The union over both sides is the only reading that cannot be dodged by
 * the direction of the edit.
 *
 * @param scan   ddlContentHits or moneyContentHits
 * @param atHead reader for the head copy
 * @param atBase reader for the base copy (throws when absent on base)
 */
export function eitherSide(files, scan, atHead, atBase) {
  return [...new Set([...scan(files, atHead), ...scan(files, atBase)])];
}

export function hasLabel(labels, config = CONFIG) {
  return labels.some((l) => l.trim().toLowerCase() === config.label.toLowerCase());
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  // Fail closed on an UNDECLARED scan (v1.2.0). `false` is a decision; absence is not.
  for (const key of ['ddl_content_scan', 'money_content_scan', 'authz_content_scan', 'carpool_declare_content_scan']) {
    const why = scanConfigProblem(CONFIG[key]);
    if (why) {
      console.error(`[31m[risky-paths] scripts/risky-paths.json "${key}": ${why}.[0m`);
      console.error('  Declare it as exactly false (with a note explaining why this repo does not scan) or as a USABLE scan object: non-empty dirs and extensions, a pattern that compiles, max_bytes > 0.');
      process.exit(2);
    }
  }
  // ONE splitter for TWO formats was a bypass. Labels are comma- OR newline-separated
  // and a label name cannot usefully contain either. A PATH can contain a COMMA — it
  // is a legal character on every filesystem git supports — so splitting paths on `,`
  // tore one path into two names that match nothing. Measured 2026-09-05 in the exact
  // CI shape:
  //   CHANGED_FILES='README.md\nsrc/services/credentials,x.json'
  //     -> "no risky paths in 3 changed file(s) — routine, may auto-merge", exit 0
  //   the same path without the comma                                      -> exit 1
  // Two files, three entries. The "3" was the only tell, and nothing reads it.
  //
  // This is the SAME CLASS the gate workflow already refuses for a newline, where it
  // compares NUL records to lines and exits 2. That guard counts newlines only, so
  // the comma walked past it and into all seven repos.
  // NOTHING is stripped from a path — no .trim(), and no trailing-\r strip either.
  // Both were tried and both are the same mistake, caught by the reviewer twice:
  //
  //   .trim()            a LEADING OR TRAILING SPACE IS LEGAL in a path, and
  //                      ` src/lib/charge.js` trimmed to `src/lib/charge.js` is a name
  //                      that does not exist — the reader gets ENOENT, contentHits
  //                      reads that as "deleted", and a file whose CONTENT trips the
  //                      money or authz scan reports routine. Filename patterns are
  //                      unaffected (trimming can only make a path match MORE), so it
  //                      hit exactly the content scans, which exist because the
  //                      patterns had already failed there.
  //   .replace(/\r$/,'') a one-character trim with the identical failure shape: a name
  //                      genuinely ending in CR is stripped to one that does not exist.
  //
  // A CR is instead REFUSED below, with the newline and the undecodable byte. That is
  // the honest answer and it costs nothing here: the only producers are the gate
  // workflow (`tr '\0' '\n'` on a Linux runner — pure LF) and --diff (splits on NUL).
  // Neither emits CRLF, so a CR in this list means the input is wrong, and a loud
  // exit 2 sends the next person to the producer instead of silently mangling a name.
  const splitPaths = (s) => (s || '').split('\n').filter(Boolean);
  const splitLabels = (s) => (s || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

  let files;
  if (process.argv.includes('--diff')) {
    try {
      const base = execFileSync('git', ['merge-base', 'origin/main', 'HEAD'], { encoding: 'utf8', maxBuffer: gitMaxBuffer() }).trim();
      // Three deliberate choices, each one a bypass the GATE workflow already closed
      // and this path did not — the same file protecting CI and not its own CLI:
      //
      //   --no-renames  Since git 2.9 rename detection is on by default, and for a
      //                 detected rename --name-only prints ONLY THE DESTINATION. So
      //                 `git mv guardrails/check-risky-paths.mjs docs/gate.txt` — the
      //                 change that DELETES the classifier — lists only docs/gate.txt,
      //                 which matches no pattern. A risk classifier must see the path
      //                 a file LEFT, not just where it landed.
      //   -z            git C-QUOTES any path with a tab, quote, backslash or
      //                 non-ASCII byte, and the quoted form matches no pattern.
      //   no .trim()    -z gives exact bytes, and `pay.js<LF>` would be trimmed back
      //                 to `pay.js` — a name that does not exist, so every read fails
      //                 and the file reads as deleted. Unlike the CI path, this one
      //                 need not REFUSE a newline: files is an array here, not a
      //                 newline-separated string, so it can hold the path exactly.
      files = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', `${base}...HEAD`],
        { encoding: 'utf8', maxBuffer: gitMaxBuffer() })
        .split('\0').filter(Boolean);
    } catch (err) {
      // Overflow is not a broken diff. Saying which one it was keeps the operator
      // from hunting a fetch-depth problem that is not there.
      console.error(`[risky-paths] could not diff against origin/main: ${isOverflow(err)
        ? `the changed-file list exceeded the ${gitMaxBuffer()}-byte capture limit (ENOBUFS). Raise BB_GIT_MAX_BUFFER.`
        : err.message}`);
      process.exit(2);
    }
  } else {
    files = splitPaths(process.env.CHANGED_FILES);
  }

  // An empty list is ambiguous — a genuinely empty diff and a broken one look
  // identical from here — so refuse either way rather than green-light something
  // nothing examined. This guard covers BOTH input paths on purpose: the first
  // version only guarded the CI path, so `--diff` on an uncommitted branch printed
  // "routine, may auto-merge" having inspected zero files.
  if (!files.length) {
    console.error('[risky-paths] no changed files determined — refusing to pass a diff\n'
      + '  that was never examined.\n'
      + '  In CI: check the workflow fetch-depth and base ref.\n'
      + '  Locally: commit your work first — --diff compares against origin/main.');
    process.exit(2);
  }

  // A path this process cannot REPRESENT must not be judged, on either input path.
  // Two ways that happens, both ending in the same silent miss — the name does not
  // exist, every read of it fails, contentHits reads the failure as "deleted", and a
  // file whose CONTENT trips the money or authz scan reports ROUTINE:
  //
  //   a CR      the list is newline-separated, so a name containing CR cannot round-trip
  //             through it. Stripping it was tried twice and is just a small trim.
  //   U+FFFD    Node decodes the git capture (`encoding: 'utf8'`) and process.env as
  //             UTF-8 and replaces invalid bytes SILENTLY. Git can hold a filename that
  //             is not valid UTF-8, so `src/lib/ch\xffarge.js` arrives already broken.
  //
  // Refusing is the answer the gate workflow gives a newline in a path, for the same
  // reason: this file cannot judge what it cannot represent, and a gate that opens when
  // it is confused is not a gate.
  //
  // U+FFFD is a legal character, so a file genuinely named `notes-�.md` is refused
  // too and cannot be told apart from a decode failure — Node has already thrown the
  // original bytes away by the time this sees them. That fails CLOSED (exit 2, the PR
  // waits for a rename) rather than open, which is the right direction, and the message
  // says to rename either way.
  //   whitespace-only  removing .trim() flipped this from closed to OPEN: `' '` used to
  //                    trim away, hit the empty-list check and exit 2; without the trim
  //                    it is a "file named space" that matches nothing and reads as
  //                    deleted, so a broken producer scores routine. Refused per ENTRY
  //                    rather than only when the whole list is blank, so a stray blank
  //                    beside real paths cannot ride along. Reviewer P3.
  const unrepresentable = files
    .map((f) => [f, /[\r\n]/.test(f) ? 'contains a carriage return or newline'
      : f.includes('�') ? 'is not valid UTF-8'
        : f.trim() === '' ? 'is blank — no path is only whitespace' : null])
    .filter(([, why]) => why);
  if (unrepresentable.length) {
    console.error('[risky-paths] a changed path cannot be represented, so it cannot be judged:\n'
      + unrepresentable.map(([f, why]) => `    ${JSON.stringify(f)} — ${why}`).join('\n')
      + '\n  Reading it would fail and the content scans would silently skip it, so this\n'
      + '  refuses instead. Rename the path, or fix the producer if it is sending CRLF.');
    process.exit(2);
  }

  const labels = splitLabels(process.env.PR_LABELS);
  const hits = riskyHits(files);

  // Fold content-detected files into their category, so the operator sees one
  // reason rather than two mechanisms.
  // WHICH "head" the content scans read.
  //
  // fileReader() reads the WORKING TREE first and only falls back to a ref. That is
  // right when the checkout IS the head — a `pull_request` workflow, or a local
  // --diff run. It is WRONG under pull_request_target, where the checkout is the
  // BASE by design: fileReader() would read the base copy, baseReader() would read
  // the base copy, and eitherSide would union the base with itself. A PR that ADDS
  // `import ... from "../clients/qbo-v2.js"` to an existing file would then produce
  // no hit at all and be reported routine — the content scan blind precisely where
  // the filename patterns already failed, which is why the scan exists.
  // Caught by the pre-push reviewer (codex, high effort) on the first push of the
  // pull_request_target gate, before it shipped.
  //
  // So the gate names the two sides explicitly. BB_HEAD_REF makes the head side a
  // pure `git show <ref>:<file>` — a BLOB read. Nothing is written to the workspace
  // and nothing is executed, which is what keeps a privileged pull_request_target
  // job safe while still judging the PR's real content.
  //
  // Unset, both fall back to today's behaviour exactly: working tree, then origin/main.
  const headRef = process.env.BB_HEAD_REF;
  const baseRef = process.env.BB_BASE_REF || 'origin/main';
  const atHead = headRef ? baseReader(headRef) : fileReader(baseRef);
  const atBase = baseReader(baseRef);
  const fold = (found, name, why) => {
    const fresh = found.filter((f) => !hits.some((h) => h.files.includes(f)));
    if (!fresh.length) return;
    const cat = hits.find((h) => h.name === name);
    if (cat) cat.files.push(...fresh);
    else hits.push({ name, why, files: fresh });
  };
  // A scan that could not finish reading must exit 2 (could not determine), never
  // 1 (risky and unlabelled) and never 0. An uncaught throw here would exit 1 and be
  // read as an ordinary block, which is a different claim than "I could not look".
  try {
    fold(eitherSide(files, ddlContentHits, atHead, atBase), 'migrations', 'runs DDL — detected by file CONTENT (on either side of the diff), not by name');
    fold(eitherSide(files, moneyContentHits, atHead, atBase), 'money', 'imports a QuickBooks / QBT / Chase client — money code by CONTENT (on either side of the diff), not by name');
    fold(eitherSide(files, authzContentHits, atHead, atBase), 'auth', 'decides authorization — detected by file CONTENT (on either side of the diff), not by name');
    fold(eitherSide(files, carpoolDeclareContentHits, atHead, atBase), 'payroll-guards', 'declares/reads a carpool GPS-evidence exception — detected by file CONTENT (on either side of the diff), not by name');
  } catch (err) {
    console.error(`\x1b[31m[risky-paths] content scan could not be completed: ${err.message}\x1b[0m`);
    console.error('  Refusing to classify a diff the scans did not finish reading.');
    process.exit(2);
  }

  if (!hits.length) {
    console.log(`[32m[risky-paths] no risky paths in ${files.length} changed file(s) — routine, may auto-merge[0m`);
    process.exit(0);
  }

  const total = hits.reduce((n, h) => n + h.files.length, 0);
  const header = `${total} file(s) in ${hits.length} risky categor${hits.length === 1 ? 'y' : 'ies'}`;

  if (hasLabel(labels)) {
    console.log(`[32m[risky-paths] ${header} — released by the "${CONFIG.label}" label[0m`);
    for (const h of hits) console.log(`  ${h.name}: ${h.files.join(', ')}`);
    process.exit(0);
  }

  console.error(`[31m[risky-paths] BLOCKED — ${header}, and the PR is not labelled.[0m\n`);
  for (const h of hits) {
    console.error(`  ${h.name} — ${h.why}`);
    for (const f of h.files) console.error(`      ${f}`);
  }
  console.error(`\n  AGENTS.md section 4: an agent must not merge these on its own authority.`
    + `\n  A human reviews the diff and adds the "${CONFIG.label}" label.`
    + `\n  The check re-runs on the label event and auto-merge proceeds from there.`
    + `\n\n  Agents: do NOT add this label yourself. Applying it IS the review.`);
  process.exit(1);
}
