#!/usr/bin/env node
// BB_Tools | guardrails/devin-gate.mjs | v1.10.1 | 2026-10-09 | BB
// CANONICAL. Every managed repo carries a byte-identical copy at scripts/devin-gate.mjs;
// edit THIS file, then `node sync-guardrails.mjs --pr` (BB_Tools). Run by devin-gate.yml.
//
// Makes Devin Review a RELIABLE but NEVER-STUCK merge gate. Devin posts a commit STATUS
// (not a check run) with context "Devin Review" on each head it reviews. Measured
// 2026-10-01: median 1.1-1.6 min, p90 6.5 min, and 37 of 252 merged PRs ended on a head it
// never reviewed (status absent, or "Full review skipped: ..." with state SUCCESS). So the
// gate is not "wait for Devin": it is "wait a bounded time, fail ONLY on a real unresolved
// red finding, and otherwise pass loudly with the `devin-unreviewed` label".
//
//   no Devin status after DEVIN_GATE_NUDGE_MIN (4)  -> ONE "/devin review" comment per head
//   "Completed analysis..."                         -> FAIL if an unresolved, non-outdated
//                                                      red (🔴) Devin review thread exists
//   skipped, or nothing by DEVIN_GATE_MAX_MIN (8)   -> PASS + label devin-unreviewed
//                                                      (FAIL instead if an open red thread is already there:
//                                                      threads are read before any unreviewed pass, #237)
//   `bb-review` status = failure/error on the head  -> FAIL (a second reviewer; absent = ignored). Devin's own
//                                                      state is still reported and still drives the label
//                                                      (a bb-review failure never erases a missing-Devin fact)
//   GitHub API outage (after 3 retries)             -> PASS + label devin-unreviewed, loudly - but only once a
//                                                      final PR read shows no hold; that read failing FAILS (v1.9.1)
//
// Node 22, no dependencies. Env: GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER (set by the
// workflow); optional DEVIN_GATE_NUDGE_MIN, DEVIN_GATE_MAX_MIN, DEVIN_GATE_POLL_S.
// Exit 0 = pass, 1 = fail (open red findings, or bb-review failed).
//
// STATUS MODE (GITHUB_EVENT_NAME=status, context bb-review, state failure/error): a late bb-review failure after the
// gate already passed. A status event carries no PR and its run attaches to the default branch, not the PR head, so
// the script resolves the open PRs of that sha (commits/{sha}/pulls) and RE-RUNS each one's completed devin-gate
// run (the re-run judges the head afresh and now fails). No PR code is checked out or run.
//
// HOLD MODE (DEVIN_GATE_MODE=hold, from devin-gate-hold.yml on a title edit or a sams-merge label change): see
// runHoldRecheck. It disarms auto-merge on a held PR at once and RE-RUNS the PR's latest devin-gate run; it never
// posts a devin-gate check itself. HOLD_PHASE=disarm runs only the disarm, HOLD_PHASE=recheck only the wait and re-run
// (devin-gate-hold.yml v1.1 runs them as two jobs); unset runs both.
//
// v1.10.1 (2026-10-09) - openDisarmRecord rewritten once against its whole case table (round 4; the table is above it).
//           Devin, BMB #1028 / universal-auth #28: (1) red - a retried record post whose first try landed AFTER a newer
//           hold's record (A, B, A) made the closing note for A close B too (v1.10.0 closed through the LAST copy of A); now
//           a copy of an open or closed id is ignored, so A closes at its first position and B stays open; (2) red - the
//           lift check read the comment list once: one 502 left a lifted hold's record unread; now retried, and a read
//           that still fails fails the job (re-arm may be needed), as before.
// v1.10.0 (2026-10-09) - Disarm records carry ids (round 3+ on the disarm record: the whole case table, rewritten once).
//           Devin on the v1.9.2 sync PRs: (1) CT #811 red - a lift job's note posted late closed the record a NEWER hold
//           had written, so that hold's lift never asked for the re-arm; (2) CalExp5 #766 red - a hold renewed between a
//           lift job's read and its re-arm note left the PR held, unarmed and with no record (the new hold's job saw
//           nothing to disarm); (3) BMB #1024 yellows - an unreadable comment list skipped the record, and a failed
//           re-read error outlived the read that recovered it.
//             record   devin-gate-disarmed method=M id=I   posted by every disarm, I fresh (recordId; opts.newId in tests)
//             closing  devin-gate-rearm method=M id=I      closes the last record I and every record before it, never a later one
//             closing  id names no earlier record          closes nothing (the "lifted meanwhile" notes use a fresh id)
//             closing  no id (before v1.10.0)              closes every earlier record, as v1.9.2 did; never posted by v1.10.0
//             record   no id (before v1.10.0)              named c<comment id>, so its closing note names it too (Devin, #271)
//             lift: unheld+armed, record I open             -> closedNote(I)
//             lift: unheld+unarmed, record I open           -> rearmNote(I), re-read: held again + unarmed -> restoredNote(new id)
//             disarm, lifted meanwhile (both sites)         -> rearmNote(fresh id), same re-read and restore (postLiftNote)
//             disarm, still held, ours                      -> settleDisarm: record(new id), re-read, lifted -> postLiftNote
//             disarm, still held, another job's             -> comments read with retries; record open -> settle with its id;
//                                                             none open OR unreadable -> record anyway (duplicate > lost)
//             disarm OK, the read after it fails            -> no error of its own: settleDisarm's retried re-read decides
//           Residual: a hold that begins after postLiftNote's last read gets no record; the re-arm request was already on
//           the PR while it was unheld, and the owner's PR-goal stop hook sees it unarmed.
// v1.9.3 (2026-10-09) - settleDisarm's three errors carry { cause: e } (universal-auth's eslint preserve-caught-error
//           blocked the v1.9.2 sync push). Behaviour unchanged.
// v1.9.2 (2026-10-09) - Two Devin findings on the v1.9.0 guardrail sync PRs, fixed against one case table:
//             held+armed, mutation OK, still held       -> disarm + RECORD (disarmedNote, marker devin-gate-disarmed)
//             held+armed, mutation OK, lifted meanwhile -> disarm + re-arm note (as before)
//             held+armed, mutation fails, now off       -> another job disarmed: record only if none is open
//             unheld+unarmed, open record (lift)        -> re-read; still unheld+unarmed+open -> re-arm note (closes it)
//             unheld+unarmed, no record                 -> nothing (never armed before the hold: never asked to re-arm)
//             recheck: run done, PR held AND armed      -> disarm (+record) BEFORE the re-run
//           (1) Devin CalExp5 #763: a hold lifted after the disarm re-ran the gate green but never asked for the re-arm,
//           so the PR sat green and unarmed for good. Now the disarm is recorded on the PR (runSweep too), and the
//           hold-disarm job that sees an unheld, unarmed PR with an open record (openDisarmRecord, bot comments only)
//           posts rearmNote once. (2) Devin SEC_ CT #808: the recheck phase re-ran the gate on a PR that could still be
//           held AND armed (its hold came while this job waited), so auto-merge could use the old green before the new
//           red landed; it now disarms first. Errors are collected and thrown together after the re-run, as before.
//           (3) Devin, BB_Tools #269: settleDisarm (both disarm sites) retries the record, then re-reads the PR - a hold
//           lifted while the record was written gets the re-arm note (or, re-armed already, the closing note); and a lift
//           on a PR the owner already re-armed posts closedNote, so an old record cannot ask a later, unarmed hold to re-arm.
// v1.9.1 (2026-10-09) - a pass whose final hold re-read fails now FAILS instead of passing (Devin SEC_, universal-auth #27).
//           Under a PR-read outage the gate passed via apiOutage and then could not see a HOLD either, leaving a green
//           check on a held PR. Failing costs an ordinary PR one sweep tick: the sweep re-runs a failed gate on a PR
//           that is not held (RETRYABLE_CONCLUSIONS) and never on a held one.
// v1.9.0 (2026-10-09) - HOLD_PHASE splits HOLD MODE in two (bb-review first-push P1 on the RevExp5 guardrails sync).
//           devin-gate-hold.yml v1.0 queued every hold event for a PR in one cancel-in-progress:false group, and GitHub
//           keeps only ONE pending job per group: a HOLD added while an earlier job sat in its up-to-16-minute wait was
//           queued behind it, so auto-merge stayed armed on a held PR for that long, and a third event replaced the
//           pending one outright. Now hold-disarm (no queue, HOLD_PHASE=disarm) disarms at once on every event, and
//           hold-recheck (HOLD_PHASE=recheck, queued per PR with cancel-in-progress: true - the newest event re-reads the
//           live PR, so a cancelled older wait loses nothing) re-runs the gate. A bad HOLD_PHASE value throws. Two
//           disarm jobs can now race (a title edit plus a label): a failed mutation whose re-read shows auto-merge
//           already off is reported as that, not as a failed disarm (bb-review first-push P2 on this change); that
//           re-read is also the post-disarm read, so a hold lifted meanwhile still gets the re-arm note (Devin #267). The combined disarm+recheck error carries { cause } (ESLint preserve-caught-error in universal-auth).
// v1.8.1 (2026-10-09) - runHoldRecheck disarms like runSweep (Devin #265): the PR is re-read right before the mutation
//           (a hold lifted after the first read leaves auto-merge alone), and once the mutation succeeds a failed
//           follow-up read or re-arm note is reported as that, with disarmed=true, not as a failed disarm. A failed
//           re-read after the disarm throws (the hold may have been lifted: re-arm may be needed), and a later failure
//           (listing runs, the re-run, the wait) carries that message instead of masking it (bb-review P1 x2).
// v1.8.0 (2026-10-09) - the hold re-check moved out of devin-gate.yml (bb-review first-push P1 on the BB_Scan_OpenAI-v4
//           sync). devin-gate.yml v1.6 listened to edited/labeled/unlabeled and filtered them with its job `if`; a job
//           skipped by `if` still reports a SKIPPED devin-gate check on the head, and GitHub counts a skipped required
//           check as passing - so a body edit or ANY label change (the gate writes devin-unreviewed itself) could cover
//           a red gate. devin-gate.yml v1.7 drops those triggers; devin-gate-hold.yml (job hold-recheck, not a required
//           name) runs HOLD MODE instead. findGateRuns also ignores skipped runs, so the sweep judges the run that
//           really rendered a verdict.
// v1.7.0 (2026-10-09) - two changes (FIRST_WRITE_AND_PR_FLOW_MASTER_PLAN_2026-10-09 fixes 6 and 9, contract v1.13):
//   HELD FOR SAM  a PR whose title starts with an uppercase HOLD, carries a bracketed "[HOLD" anywhere (any case; real
//           titles end "[HOLD — Sam merges]"), or carries the label sams-merge now FAILS this check with "held for Sam:
//           title HOLD / label sams-merge", before anything else (a draft too). It was prose only: a HOLD PR could be
//           armed and merged by auto-merge. A bare lowercase "Hold music fix" is NOT held. The result leaves the
//           devin-unreviewed label alone (unreviewed: null) - it is set again by the normal run once the hold lifts.
//           Adding OR lifting a hold re-runs the gate at once: devin-gate-hold.yml (v1.8.0; was devin-gate.yml v1.6)
//           listens to edited (title changed) and labeled/unlabeled (sams-merge only). The sweep backs that up: a PASSED run on a held PR is re-run
//           (it now fails), and a failed run on a held PR is never re-run while the hold stands (no retry spam).
//   SEC_ IS RED  redFindings also counts a thread whose marker id starts with SEC_ (security) as red, even when the
//           emoji is not 🔴. Yellow and info notes still never block outside strict mode (verified: tests added).
//           isRedThread is exported so landed.mjs v1.17 judges severity with this one parser. It fails SAFE on format
//           drift: 🔴 or a SEC_ id anywhere in the body is red, and a body with no severity marker at all (no 🔴, 🟡
//           or 🔍, no SEC_) is red too. Measured 2026-10-09 on 377 Devin threads (BB_Tools, BMB, CT, last 40 merged
//           PRs each): 🔴 was always in the first three lines, and the 28 emoji-less threads were all SEC_.
// v1.6.1 (2026-10-06) - the sweep reads the changed-file list against the PR's changed_files count, as the gate run
//           does. It called getFiles() with no count, so a short read that dropped a guardrail path judged the PR
//           non-strict. An unknown count or a short read now judges strictly (Devin, CT #796).
// v1.6.0 (2026-10-06) - two PR classes are judged differently from the default "red findings only":
//   STRICT  a PR that changes the CANONICAL guardrails (a path under guardrails/, or sync-guardrails.mjs - BB_Tools
//           only) fails on ANY unresolved, non-outdated Devin thread, whatever its severity: those files are copied
//           byte-identically into every managed repo, so a yellow finding fixed once here is not fixed N times later.
//           Changed files that cannot be read count as strict (fail closed).
//   CANONICAL FAST PATH  a consumer sync PR (head ref agent/guardrails-sync) whose every changed file is a synced
//           guardrail path, AND whose head carries a "guardrails-canonical" success status posted by the PR's own
//           author (sync-guardrails.mjs v1.4 posts it after a blob readback proves each file byte-identical to the
//           canonical that was already reviewed in BB_Tools): the gate does not WAIT for Devin on the copy. A pass
//           before Devin's verdict is still a pass WITHOUT it and carries the devin-unreviewed label, exactly like a
//           timeout. It never hides a finding: a red Devin thread already there still fails it.
//           Trust bound (bb-review P1s, BB_Tools #237): the status proves only that the PR author's token posted it,
//           and every agent here shares that token. A forged status therefore buys one thing a timeout does not:
//           TIME - the pass comes at once instead of after up to MAX_MIN. A red finding Devin posts after that pass
//           re-reds the gate through the sweep (<= 10 min) only while the PR is still OPEN; once auto-merge has
//           merged it, the sweep (open PRs only) no longer sees it and the finding is NOT enforced on that copy.
//           Accepted because the copied bytes were reviewed under STRICT on their BB_Tools PR, so a real finding
//           is a finding on the canonical and is fixed there (codex P1, #237: stated, not hidden). scripts/risky-paths.json is NOT fast-pathed:
//           it is a per-repo ensure_json merge, not a byte copy, so no readback covers it.
//
// SWEEP MODE (GITHUB_EVENT_NAME=schedule, every 10 min): GitHub has NO event for "a review thread
// was resolved", so a red gate would stay red after the last red thread is resolved. The sweep
// finds open PRs whose latest devin-gate run FAILED — or never rendered a verdict (cancelled,
// timed_out, ...; RETRYABLE_CONCLUSIONS — a cancelled REQUIRED check wedges a mergeable PR) — and
// re-runs that run (rerun-failed-jobs; a full rerun when there was no failed job) ONLY
// when a fresh read shows the verdict would now be green (no unresolved red thread, bb-review not
// failed). It cannot loop or spam: a still-red PR is never re-run, a run is re-run at most
// SWEEP_MAX_ATTEMPTS times, and a re-run in progress is skipped (it is not "completed").
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATUS_CONTEXT = 'Devin Review';
export const BB_REVIEW_CONTEXT = 'bb-review';
export const LABEL = 'devin-unreviewed';
/** Both spellings: REST names the app `devin-ai-integration[bot]`, GraphQL `devin-ai-integration`. Exact, never a substring. */
export const DEVIN_LOGINS = Object.freeze(['devin-ai-integration', 'devin-ai-integration[bot]']);
/** Descriptions that mean Devin really analysed the head (an allowlist: unknown wording is not evidence of a review). */
export const REAL_REVIEW_RE = /No Issues Found|found \d+ potential issue|Completed analysis/i;
export const NUDGE_MIN_DEFAULT = 4;
export const MAX_MIN_DEFAULT = 8;
export const POLL_S_DEFAULT = 15;
export const API_RETRIES = 3;
export const REQUEST_TIMEOUT_MS = 30000;
export const THREAD_PAGE_LIMIT = 20;
export const SWEEP_MAX_ATTEMPTS = 6;
export const SWEEP_COOLDOWN_MS = 60 * 60000;
// Completed conclusions that rendered NO verdict: cancelled (a same-group event superseded it), timed out,
// an aborted start. Since 2026-10-04 devin-gate is a REQUIRED context, so a latest run in one of these states
// wedges the PR exactly like a failure — the sweep re-runs it under the same green-verdict/attempt-cap rules.
// 'skipped' and 'neutral' stay out: a skipped run skipped on purpose (the job `if`) and would skip again.
export const RETRYABLE_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale']);
export const OPEN_PR_PAGE_LIMIT = 20;
export const RUN_PAGE_LIMIT = 5;
/** HOLD MODE: how long to wait for an unfinished devin-gate run before re-running it (its job times out at 15 min). */
export const HOLD_WAIT_MS = 16 * 60000;
/** Head ref of every sync PR opened by sync-guardrails.mjs. */
export const SYNC_BRANCH = 'agent/guardrails-sync';
/** Commit-status context sync-guardrails.mjs (v1.4+) posts once the synced blobs read back byte-identical to canonical. */
export const CANONICAL_CONTEXT = 'guardrails-canonical';
/**
 * Every consumer path sync-guardrails.mjs BYTE-COPIES (guardrails/manifest.json files[].path; a test keeps them equal).
 * The ensure_json outputs (scripts/risky-paths.json) are left out on purpose: they are per-repo merges that no
 * readback verifies, so a sync PR touching one is reviewed normally (codex P1, BB_Tools #237).
 */
export const GUARDRAIL_PATHS = Object.freeze([
  'scripts/check-risky-paths.mjs', '.github/workflows/risky-path-gate.yml', 'scripts/guardrails-telemetry.mjs', 'scripts/guardrails-modes.mjs',
  'scripts/check-pr-body.mjs', '.github/workflows/pr-body-lint.yml', 'scripts/devin-gate.mjs', '.github/workflows/devin-gate.yml',
  '.github/workflows/devin-gate-hold.yml',
  'scripts/deploy-verify.mjs', '.github/workflows/deploy-verify.yml',
]);
export const FILES_PAGE_LIMIT = 30;

const errLine = (e) => String(e?.message || e).split(/\r?\n/)[0];
export const nudgeMarker = (sha) => `<!-- devin-gate nudge ${sha} -->`;

/** Has a nudge for THIS sha already been posted? `comments` = [{body}]. Pure. */
export function hasNudge(comments, sha) {
  const m = nudgeMarker(sha);
  return (comments || []).some((c) => typeof c?.body === 'string' && c.body.includes(m));
}

/** Marker left when the sweep re-runs a stale-green gate: repeat corrections are detected exactly, not guessed. */
export const sweepCorrectedMarker = (runId, atIso, fp) => `<!-- devin-gate sweep-corrected run=${runId} at=${atIso} fp=${fp || 'none'} -->`;

/**
 * Breadcrumb left when the sweep observes the thread-state fingerprint MOVE from the newest correction
 * marker's last recorded state. The fingerprint alone cannot tell "the red stayed open" from "the red was
 * resolved and re-opened" - both read `stableId:o` - so the marker's suppression must consult this trail:
 * any transition recorded after the marker means the current state is a NEW occurrence of it, not the one
 * the correction already fired against (Devin, BB_Tools #215: a resolve/reopen round-trip inside the
 * cooldown must not keep the stale green). Round-trips entirely inside one sweep tick stay invisible -
 * the API offers no resolvedAt, and polling cannot see between its own ticks.
 */
export const sweepStateMarker = (fp, atIso) => `<!-- devin-gate sweep-state fp=${fp || 'none'} at=${atIso} -->`;

/**
 * Commit-status breadcrumb: durable per-sha and on a DIFFERENT endpoint than issue comments, so a comment
 * outage cannot lose a thread-state transition (Devin, BB_Tools #219 / CT #787). The fingerprint goes in the
 * status description hashed (descriptions cap at 140 chars and a fingerprint can be far longer); the sweep
 * reads the head's `devin-gate-trail` status HISTORY (not the combined status, which shows only the latest
 * per context - a later crumb re-recording the marker's own fp would shadow an earlier move) and merges every
 * differing crumb newer than the marker into its trail (Devin, CalExp5 #731).
 */
export const SWEEP_TRAIL_CONTEXT = 'devin-gate-trail';
export const fpHash = (fp) => createHash('sha256').update(String(fp)).digest('hex').slice(0, 16);
export const sweepTrailStatus = (fp) => `fp=${fpHash(fp)}`;

/**
 * A fingerprint of the PR's Devin review-thread STATE: one entry per Devin thread, `stableId:resolved:outdated`,
 * sorted. Reopening a resolved thread, resolving an open one, or a new finding all change it — so a correction
 * marker carrying this fingerprint suppresses only retries against the SAME unresolved state, never a state that
 * changed since the correction fired (Devin, BB_Tools #214 sync round: a reopened red finding must not keep the
 * green gate for a whole cooldown). `threads` = the getThreads() shape. Pure.
 */
export function threadFingerprint(threads) {
  return (threads || [])
    .filter((t) => t && DEVIN_LOGINS.includes(t.author))
    .map((t) => `${t.url || `${t.path}#${t.line}`}:${t.isResolved ? 'r' : 'o'}${t.isOutdated ? 'd' : ''}`)
    .sort().join(',');
}

/**
 * The newest correction marker for this run in `comments` = [{body}], as {at: epoch ms, fp: thread-state
 * fingerprint}, or null. Pure. A marker is the record that a stale-green correction already fired, so
 * first-vs-repeat never depends on run_attempt (which counts retries for unrelated earlier states) or
 * evidence timestamps. The fingerprint lets a marker suppress only the state it was written against -
 * a reopened or new red finding changes the fingerprint and reads as a first correction again.
 * Pre-fingerprint markers (no fp=) parse as fp: 'none' and match only a PR with no Devin threads.
 * `trail` = the sweep-state breadcrumbs recorded AFTER the marker, oldest first; `lastFp` = the fingerprint
 * last recorded (trail tail, else the marker's own). A non-empty trail proves the thread state left the
 * marker's fingerprint at least once - a matching fingerprint now is a re-occurrence, not the same state.
 */
export function sweepCorrection(comments, runId) {
  let newest = null;
  const states = [];
  for (const c of comments || []) {
    const body = typeof c?.body === 'string' ? c.body : '';
    const m = body.match(/devin-gate sweep-corrected run=(\d+) at=(\S+?)(?: fp=(\S+))? -->/);
    if (m && Number(m[1]) === runId) {
      const t = Date.parse(m[2]);
      if (Number.isFinite(t) && (!newest || t > newest.at)) newest = { at: t, fp: m[3] || 'none' };
      continue;
    }
    const s = body.match(/devin-gate sweep-state fp=(\S+) at=(\S+?) -->/);
    if (s) { const t = Date.parse(s[2]); if (Number.isFinite(t)) states.push({ fp: s[1], at: t }); }
  }
  if (!newest) return null;
  newest.trail = states.filter((s) => s.at > newest.at).sort((a, b) => a.at - b.at);
  newest.lastFp = newest.trail.length ? newest.trail[newest.trail.length - 1].fp : newest.fp;
  return newest;
}

/**
 * Is this thread RED: its first three body lines carry 🔴 (the severe marker; detection identical to the 2026-10-01
 * measurement) or the marker id starts with SEC_ (a security finding). Severity only: author, resolved and
 * outdated are the caller's filters. Pure.
 */
export function isRedThread(t) {
  if (!t) return false; // no thread at all, not a thread with an unreadable body
  const body = String(t.body || '');
  if (/🔴/u.test(body) || /"id"\s*:\s*"SEC_/.test(body)) return true;
  // No recognisable severity at all - a format we do not know, or a body the API returned empty/null - is red
  // (fail safe): a gate that cannot read the finding must not wave it through as yellow.
  return !/🟡|🔍/u.test(body);
}

/**
 * Open RED Devin findings. A finding is a review thread whose FIRST comment is Devin's, that is
 * neither resolved nor outdated, and is red (isRedThread). `threads` = [{isResolved,isOutdated,path,line,author,body,url}]. Pure.
 */
export function redFindings(threads) {
  return (threads || [])
    .filter((t) => t && DEVIN_LOGINS.includes(t.author) && !t.isResolved && !t.isOutdated)
    .filter(isRedThread)
    .map((t) => {
      const lines = String(t.body || '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
      const line = lines.find((l) => /🔴/u.test(l)) || lines.find((l) => l.trim()) || '(untitled finding)';
      return { path: t.path || '?', line: t.line ?? null, url: t.url || '', title: line.replace(/\*\*/g, '').replace(/🔴/gu, '').trim().slice(0, 140) };
    });
}

/** STRICT mode: every unresolved, non-outdated Devin thread, any severity. Same output shape as redFindings. Pure. */
export function openDevinThreads(threads) {
  return (threads || [])
    .filter((t) => t && DEVIN_LOGINS.includes(t.author) && !t.isResolved && !t.isOutdated)
    .map((t) => {
      const lines = String(t.body || '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
      const line = lines.find((l) => l.trim()) || '(untitled finding)';
      return { path: t.path || '?', line: t.line ?? null, url: t.url || '', title: line.replace(/\*\*/g, '').trim().slice(0, 140) };
    });
}

/** Held for Sam: a title starting with uppercase HOLD, a bracketed "[HOLD" anywhere (any case), or the label sams-merge. labels = names or {name}. Pure. */
export const HELD_REASON = 'held for Sam: title HOLD / label sams-merge';
export function isHeld(pr) {
  if (!pr) return false;
  const title = String(pr.title || '');
  if (/^\s*HOLD\b/.test(title) || /\[\s*hold\b/i.test(title)) return true;
  return (pr.labels || []).some((l) => String(typeof l === 'string' ? l : l && l.name || '').toLowerCase() === 'sams-merge');
}

/**
 * v1.10.0: every disarm record carries an id, and every note that closes one names it (` id=I` in the marker), so a
 * note posted late can never close a record newer than the one it saw (Devin, BB_Tools CT #811). An id is optional
 * only for reading: records and notes posted before v1.10.0 have none. Pure.
 */
const idPart = (id) => (id ? ` id=${id}` : '');
/** A fresh record id: base36 time + random, enough to tell two records on one PR apart. Injectable as opts.newId. */
export const recordId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The PR comment left when a hold is lifted after these jobs disarmed auto-merge: they cannot re-enable it. Its marker closes record `id`. Pure. */
export const rearmNote = (method, id) => `_devin-gate: auto-merge was disarmed while this PR was held for Sam (it had been armed: ${method}), and the hold is now lifted. Re-arm it from the branch's worktree: \`node TOOLS/bb.mjs landed --arm\`. This job cannot enable auto-merge itself._\n\n<!-- devin-gate-rearm method=${method}${idPart(id)} -->`;

/** The PR comment that records a disarm of a held PR, so lifting the hold later can ask for the re-arm (v1.9.2; id v1.10.0). Pure. */
export const disarmedNote = (method, id) => `_devin-gate: auto-merge disarmed because this PR is held for Sam (it had been armed: ${method}). When the hold is lifted, this job asks the owner to re-arm it._\n\n<!-- devin-gate-disarmed method=${method}${idPart(id)} -->`;

/** v1.10.0: the record restored when the PR was held again, still unarmed, right after its re-arm note (Devin, CalExp5 #766). Same marker as disarmedNote. Pure. */
export const restoredNote = (method, id) => `_devin-gate: this PR was held for Sam again before it was re-armed (it had been armed: ${method}). The re-arm request above still stands; when this hold is lifted, this job asks again._\n\n<!-- devin-gate-disarmed method=${method}${idPart(id)} -->`;

/**
 * The disarm record still waiting for its re-arm note (comments oldest first, as the API lists them). Returns
 * {method, id?} for the newest open record, or null. Pure.
 * v1.10.1 case table (round 4 on this function: written out whole, rewritten once). A record is a `devin-gate-disarmed`
 * marker (the disarm note or the restored note); a closing note is a `devin-gate-rearm` marker (re-arm or closed note).
 *   record id I, I never seen                         -> opens record I at this position
 *   record id I, I already open                       -> a duplicate (a retried post whose first try landed): ignored, so a
 *                                                        newer record B posted between the two copies stays after I (A,B,A)
 *   record id I, I already closed                     -> a duplicate landing after its closing note: ignored, stays closed
 *   record with no id (posted before v1.10.0)         -> named c<comment id>, so v1.10.0 never posts a no-id closing note
 *   closing note id I, record I open                  -> closes I and every record opened before it, never a later one
 *                                                        (a stale lift note cannot close a newer hold's record: CT #811)
 *   closing note id I, I never opened                 -> closes nothing and marks nothing (a "lifted meanwhile" note for a
 *                                                        disarm with no record): a closure never reaches forward - an
 *                                                        extra re-arm request is harmless, a lost one is not
 *   closing note with no id (posted before v1.10.0)   -> closes every record before it, as v1.9.2 did
 * Ids are fresh per disarm (recordId) or per comment (c<id>), so one id is one hold: every copy of it is the same record.
 * A PR that was never armed before its hold has no record, so lifting that hold never asks for a re-arm. Only the
 * comments these jobs post (as github-actions[bot]) count: a person or another app quoting a marker changes nothing.
 * Two lift jobs running at once (a title edit and a label removal) can both post the re-arm note; a duplicate note is
 * harmless, a lost one is not.
 */
export const GATE_BOT = 'github-actions[bot]';
export function openDisarmRecord(comments) {
  let open = [];
  const closed = new Set();
  for (const c of comments || []) {
    if (String((c && c.user && c.user.login) || '') !== GATE_BOT) continue;
    const body = String((c && c.body) || '');
    const d = body.match(/<!-- devin-gate-disarmed method=([a-z]+)(?: id=([a-z0-9]+))? -->/);
    if (d) {
      // a record from before v1.10.0 has no id of its own: it is named by its comment id (c<id>) (Devin, BB_Tools #271)
      const id = d[2] || (c && c.id != null ? `c${c.id}` : undefined);
      if (id && (closed.has(id) || open.some((x) => x.id === id))) continue;
      open.push(id ? { method: d[1], id } : { method: d[1] });
      continue;
    }
    const r = body.match(/<!-- devin-gate-rearm method=[a-z]+(?: id=([a-z0-9]+))?/);
    if (!r) continue;
    if (!r[1]) { for (const x of open) if (x.id) closed.add(x.id); open = []; continue; }
    const i = open.findIndex((x) => x.id === r[1]);
    if (i >= 0) { for (const x of open.slice(0, i + 1)) if (x.id) closed.add(x.id); open = open.slice(i + 1); }
  }
  return open.length ? open[open.length - 1] : null;
}

/** The PR comment that closes disarm record `id` once auto-merge is armed again (no re-arm needed). Its marker is a rearm marker. Pure. */
export const closedNote = (method, id) => `_devin-gate: auto-merge is armed again, so the disarm record above (${method}) is closed. Nothing to do._\n\n<!-- devin-gate-rearm method=${method}${idPart(id)} closed -->`;

/**
 * v1.10.0: the note for a hold seen lifted on a PR these jobs disarmed - one helper for all four places that post it
 * (the lift check, settleDisarm, and the "lifted meanwhile" branch of both disarm sites).
 * armed -> closedNote(id); unarmed -> rearmNote(id), then the PR is read AGAIN: held again and still unarmed means a new
 * hold began between the read that saw it lifted and this note, and that hold's job saw nothing to disarm, so it wrote
 * no record. The note just posted would leave the PR with none, and the next lift would ask nobody to re-arm (Devin,
 * CalExp5 #766): the record is restored with a fresh id. A hold that begins after this last read gets no record, but
 * the re-arm request was already on the PR while it was unheld; the owner's PR-goal stop hook sees it unarmed.
 * Posts and reads are retried. Returns a short note for the log; throws an Error saying what the owner may need to do.
 */
export async function postLiftNote(io, readPr, { method, id, armed, sleep, backoffMs = 2000, newId = recordId } = {}) {
  const tries = (fn) => withRetries(fn, { sleep, backoffMs });
  try { await tries(() => io.postComment(armed ? closedNote(method, id) : rearmNote(method, id))); } catch (e) {
    throw new Error(armed ? `the hold was lifted and auto-merge is armed again, but the closing note of its disarm record could not be posted (${errLine(e)}): a later hold begun unarmed may be asked to re-arm (${method})` : `the hold was lifted after a disarm, but the re-arm note could not be posted (${errLine(e)}): re-arm (${method}) needed`, { cause: e });
  }
  if (armed) return '';
  let now;
  try { now = await tries(readPr); } catch (e) { throw new Error(`re-arm (${method}) requested on the PR, but the PR could not be re-read after it (${errLine(e)}): if it was held again meanwhile, it has no disarm record and the next lift will not ask for the re-arm`, { cause: e }); }
  if (!now || now.state !== 'open' || !isHeld({ title: now.title, labels: now.labels }) || now.auto_merge) return '';
  try { await tries(() => io.postComment(restoredNote(method, newId()))); } catch (e) { throw new Error(`re-arm (${method}) requested on the PR, but it was held again meanwhile and its disarm record could not be restored (${errLine(e)}): the next lift will not ask for the re-arm`, { cause: e }); }
  return ' (held again right after the note: disarm record restored)';
}

/**
 * v1.9.2 (Devin, BB_Tools #269): what follows a disarm of a PR that still read as held, in both runSweep and HOLD MODE.
 * 1. The record (id opts.id, else a fresh one) is posted with retries (a single failed write used to leave no record, so
 *    the lift asked nobody to re-arm). record=false skips it: another job's disarm whose record `id` is already open.
 * 2. The PR is read AGAIN after the record: a hold lifted while the record was being written may have been seen by a lift
 *    job that found no record yet, so this job settles it with postLiftNote - unheld and unarmed -> the re-arm note;
 *    unheld and armed again -> the closing note. Still held -> the record stays open.
 * Returns a short note for the log; throws an Error whose message says what the owner may need to do.
 */
export async function settleDisarm(io, readPr, method, { record = true, id, sleep, backoffMs = 2000, newId = recordId } = {}) {
  const tries = (fn) => withRetries(fn, { sleep, backoffMs });
  const rid = id || (record ? newId() : undefined);
  if (record) {
    try { await tries(() => io.postComment(disarmedNote(method, rid))); } catch (e) { throw new Error(`auto-merge disarmed, but its record could not be posted after retries (${errLine(e)}): lifting the hold will not ask for the re-arm (${method})`, { cause: e }); }
  }
  let now;
  try { now = await tries(readPr); } catch (e) { throw new Error(`auto-merge disarmed, but the PR could not be re-read after its record (${errLine(e)}): if the hold was lifted, re-arm (${method}) is needed`, { cause: e }); }
  if (!now || now.state !== 'open' || isHeld({ title: now.title, labels: now.labels })) return '';
  const armed = !!now.auto_merge;
  let extra;
  try { extra = await postLiftNote(io, readPr, { method, id: rid, armed, sleep, backoffMs, newId }); } catch (e) { throw new Error(`auto-merge disarmed, but the hold was lifted meanwhile and its note could not be settled: ${errLine(e)}`, { cause: e }); }
  return (armed ? ' (hold lifted and auto-merge re-armed meanwhile: record closed)' : ` (the hold was lifted meanwhile: re-arm (${method}) requested on the PR)`) + extra;
}

/** Turns off a PR's auto-merge (held PRs; needs pull-requests: write, which the sweep job has). */
export const DISARM_Q = 'mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){pullRequest{number}}}';

/** Is this changed path part of the CANONICAL guardrails (BB_Tools)? Pure. */
export const isStrictPath = (f) => typeof f === 'string' && (f.startsWith('guardrails/') || f === 'sync-guardrails.mjs');

/** STRICT unless every changed file is known and none is canonical: unreadable files (null) fail closed. Pure. */
export const isStrict = (files) => !Array.isArray(files) || files.some(isStrictPath);

/** Every changed file is a synced guardrail path (the only shape a canonical sync PR can have). Pure. */
const onlyGuardrailPaths = (files) => Array.isArray(files) && files.length > 0 && files.every((f) => GUARDRAIL_PATHS.includes(f));

/**
 * The canonical fast path for a consumer sync PR. pr = {headRef, author}; files = changed paths (null = unknown);
 * canonical = {state, creator} of the newest guardrails-canonical status on the head, or null. Pure.
 */
export function canonicalFastPass({ pr, files, canonical }) {
  if (!pr || pr.headRef !== SYNC_BRANCH || !onlyGuardrailPaths(files)) return false;
  return !!canonical && canonical.state === 'success' && !!canonical.creator && canonical.creator === pr.author;
}

/** The threads that block: every open Devin thread when strict, else the red ones (the fast path included). Pure. */
export function blockingFindings(threads, { strict = false } = {}) {
  return strict ? openDevinThreads(threads) : redFindings(threads);
}
const findingWord = (strict) => (strict ? 'unresolved Devin thread(s) (strict: a canonical guardrail change blocks on any severity)' : 'unresolved red Devin finding(s)');

/**
 * Pure decision from ONE read.
 *   devin       {state, description} of the "Devin Review" status on the head, or null
 *   bbReview    {state} of a `bb-review` status, or null
 *   threads     review threads (null = could not be read)
 *   elapsedMin  minutes this gate has waited;  nudged = a nudge for this sha already exists
 *   strict      any open Devin thread blocks (canonical guardrail change);  fastPass = canonical sync copy (canonicalFastPass)
 * -> {action:'wait'|'pass'|'fail', nudge?:true, unreviewed?:bool, reason, findings?}
 * `unreviewed` = pass WITHOUT Devin's verdict (the job adds the devin-unreviewed label).
 */
export function decide({ devin, bbReview, threads, elapsedMin = 0, nudged = false, nudgeMin = NUDGE_MIN_DEFAULT, maxMin = MAX_MIN_DEFAULT, strict = false, fastPass = false }) {
  let dv = devinVerdict({ devin, threads, elapsedMin, nudged, nudgeMin, maxMin, strict });
  // Fast path: skip the WAIT, never a finding, never the label - only a verdict that would wait is replaced, and
  // that pass is unreviewed (Devin has not vouched for this head), exactly as a timeout would be. It needs the
  // threads READ and clean: Devin can post findings while its status is still pending, so an unread or blocking
  // thread list keeps the normal wait (codex P1, #237).
  if (fastPass && dv.action === 'wait' && Array.isArray(threads) && !blockingFindings(threads, { strict }).length) {
    dv = { action: 'pass', unreviewed: true, reason: `canonical guardrail sync: every changed file is byte-identical to the BB_Tools canonical (${CANONICAL_CONTEXT} status by the PR author), so not waiting for Devin (${dv.reason}) - passing WITHOUT its verdict; a red Devin finding still fails it` };
  } else if (dv.action === 'pass' && dv.unreviewed && Array.isArray(threads)) {
    // An unreviewed pass (timeout, skipped or failed Devin status) never lets a finding already posted through -
    // on ANY PR, so a sweep re-run over a late red thread can actually turn the gate red (codex P1 x2, Devin, #237).
    // runGate reads the threads before such a pass; unreadable threads (null) keep the unreviewed pass.
    const findings = blockingFindings(threads, { strict });
    if (findings.length) dv = { action: 'fail', findings, reason: `${findings.length} ${findingWord(strict)} on this head (${dv.reason})` };
  }
  if (bbReview && /^(failure|error)$/i.test(bbReview.state || '')) {
    // Fails regardless, but REPORTS both facts: the Devin side is neither dropped from the reason nor allowed to
    // erase the devin-unreviewed label logic. Devin not heard from yet (wait) is labelled CONSERVATIVELY: a failed bb-review ends
    // this run at once and no later Devin status re-runs it, so leaving the label off could hide a Devin skip/absence for good
    // (Devin round 2, #186). A re-run on a later head or after bb-review recovers re-judges and clears it.
    const bb = `bb-review status is ${bbReview.state} on this head${bbReview.description ? ` (${bbReview.description})` : ''}`;
    const unreviewed = dv.action === 'wait' ? true : dv.action === 'fail' ? false : !!dv.unreviewed;
    const out = { action: 'fail', unreviewed, reason: `${bb}; Devin: ${dv.reason}` };
    if (dv.findings) out.findings = dv.findings;
    return out;
  }
  return dv;
}

/** The Devin side of the verdict alone (no bb-review). Pure. */
function devinVerdict({ devin, threads, elapsedMin, nudged, nudgeMin, maxMin, strict = false }) {
  if (!devin) {
    if (elapsedMin >= maxMin) return { action: 'pass', unreviewed: true, reason: `No "${STATUS_CONTEXT}" status appeared within ${maxMin} min - passing WITHOUT a Devin review` };
    return { action: 'wait', nudge: elapsedMin >= nudgeMin && !nudged, reason: `no "${STATUS_CONTEXT}" status on this head yet (${elapsedMin.toFixed(1)} min)` };
  }
  const desc = devin.description || '';
  if (/skip/i.test(desc) || /^(cancel|neutral)/i.test(devin.state || '')) {
    return { action: 'pass', unreviewed: true, reason: `Devin skipped this head (${desc || devin.state}) - passing WITHOUT a Devin review` };
  }
  if (/^pending$/i.test(devin.state || '')) {
    if (elapsedMin >= maxMin) return { action: 'pass', unreviewed: true, reason: `Devin still running after ${maxMin} min (${desc || 'pending'}) - passing WITHOUT its verdict` };
    return { action: 'wait', reason: `Devin is running (${desc || 'pending'})` };
  }
  if (/^(failure|error)$/i.test(devin.state || '')) {
    return { action: 'pass', unreviewed: true, reason: `Devin Review status is ${devin.state} (${desc}) - it did not review; passing WITHOUT a Devin review` };
  }
  if (!REAL_REVIEW_RE.test(desc)) {
    return { action: 'pass', unreviewed: true, reason: `Devin Review status "${desc}" is not a completed review - passing WITHOUT a Devin review` };
  }
  if (threads === null || threads === undefined) {
    return { action: 'pass', unreviewed: true, reason: 'Devin finished but its review threads could not be read - passing WITHOUT checking its findings' };
  }
  const findings = blockingFindings(threads, { strict });
  if (findings.length) return { action: 'fail', findings, reason: `${findings.length} ${findingWord(strict)} on this head` };
  return { action: 'pass', unreviewed: false, reason: `Devin completed (${desc}) with no ${strict ? 'unresolved Devin threads (strict)' : 'unresolved red findings'}` };
}

/** Markdown for the job summary. Pure. */
export function summaryMarkdown({ sha, result, elapsedMin, warnings = [] }) {
  const head = result.action === 'fail' ? 'FAIL' : result.unreviewed ? 'PASS (unreviewed)' : 'PASS';
  const out = [`## devin-gate: ${head}`, '', `Head \`${String(sha).slice(0, 8)}\` after ${elapsedMin.toFixed(1)} min. ${result.reason}.`];
  if (result.unreviewed) out.push('', `Label \`${LABEL}\` is on this PR: nobody at Devin vouched for this head. Read the diff yourself.`);
  if (result.findings?.length) {
    out.push('', '| Finding | Where |', '|---|---|');
    for (const f of result.findings) out.push(`| [${f.title.replace(/\|/g, '\\|')}](${f.url}) | \`${f.path}${f.line ? `:${f.line}` : ''}\` |`);
    out.push('', 'Fix it and resolve the thread (or push a change that outdates it); this check re-runs on every push and review.');
  }
  for (const w of warnings) out.push('', `> WARNING: ${w}`);
  return out.join('\n') + '\n';
}

/** Retry an API call API_RETRIES times (after the first try); the last error is thrown. */
export async function withRetries(fn, { retries = API_RETRIES, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), backoffMs = 2000, shouldStop = () => false } = {}) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await fn(); } catch (e) { last = e; if (i < retries && !shouldStop()) await sleep(backoffMs * (i + 1)); else if (shouldStop()) break; }
  }
  throw last;
}

/**
 * The whole gate, with every side effect injected (so tests take no time and no network).
 * io: getPr() -> {sha, draft, headRef?, author?, changedFiles?, title?, labels?}; getStatuses(sha) -> [{context,state,description}];
 *     getFiles?(expectedCount) -> [path]; getCanonicalStatus?(sha) -> {state, creator}|null (optional: absent = files unknown -> strict);
 *     getThreads() -> threads; listComments() -> [{body}]; postComment(body);
 *     setLabel(on:boolean); sleep(ms); now() -> ms; log(line)
 * Returns {result, sha, elapsedMin, warnings}. API errors never block: after retries they pass loudly.
 */
export async function runGate(io, cfg = {}) {
  const nudgeMin = cfg.nudgeMin ?? NUDGE_MIN_DEFAULT;
  const maxMin = cfg.maxMin ?? MAX_MIN_DEFAULT;
  const pollMs = (cfg.pollS ?? POLL_S_DEFAULT) * 1000;
  const t0 = io.now();
  // Past the gate window (+1 min grace) stop retrying: the outage pass must land well before the job timeout.
  const pastWindow = () => (io.now() - t0) / 60000 > maxMin + 1;
  const retry = (fn) => withRetries(fn, { sleep: io.sleep, backoffMs: cfg.backoffMs ?? 2000, shouldStop: pastWindow });
  const warnings = [];
  let sha = '?';
  const apiOutage = (e) => {
    const msg = `GitHub API error after ${API_RETRIES} retries (${String(e?.message || e).split('\n')[0]}) - an outage must not block merging, passing WITHOUT a Devin review`;
    warnings.push(msg);
    return { action: 'pass', unreviewed: true, reason: msg };
  };
  let result;
  let filesSha = null;
  let files = null;
  for (;;) {
    const elapsedMin = (io.now() - t0) / 60000;
    try {
      const pr = await retry(() => io.getPr());
      if (sha !== '?' && pr.sha !== sha) { warnings.push(`head moved ${sha.slice(0, 8)} -> ${pr.sha.slice(0, 8)}; a newer run judges the new head`); }
      sha = pr.sha;
      if (isHeld(pr)) { result = { action: 'fail', unreviewed: null, reason: HELD_REASON }; break; }
      if (pr.draft) { result = { action: 'pass', unreviewed: false, reason: 'draft PR - not gated' }; break; }
      if (filesSha !== sha || (files === null && io.getFiles)) {
        // Read once per head, and again on every poll while it is unreadable (a transient 502 must not pin an ordinary
        // PR to strict for the whole run; Devin, #237). Unreadable (or an io without getFiles) leaves files null:
        // strict, never the fast path.
        filesSha = sha;
        files = null;
        if (io.getFiles) { try { files = await retry(() => io.getFiles(pr.changedFiles)); } catch (e) { warnings.push(`could not read the changed files (${errLine(e)}); judging STRICTLY (any open Devin thread blocks)`); } }
      }
      const strict = isStrict(files);
      let fastPass = false;
      if (pr.headRef === SYNC_BRANCH && io.getCanonicalStatus && onlyGuardrailPaths(files)) {
        // Re-read every poll: sync-guardrails posts the status seconds after the PR opens.
        let canonical = null;
        try { canonical = await retry(() => io.getCanonicalStatus(sha)); } catch (e) { warnings.push(`could not read the ${CANONICAL_CONTEXT} status (${errLine(e)})`); }
        fastPass = canonicalFastPass({ pr, files, canonical });
      }
      const statuses = await retry(() => io.getStatuses(sha));
      const pick = (ctx) => (statuses || []).find((s) => s.context === ctx) || null;
      const devin = pick(STATUS_CONTEXT);
      const bbReview = pick(BB_REVIEW_CONTEXT);
      let d;
      if (bbReview && /^(failure|error)$/i.test(bbReview.state || '')) {
        // A failed bb-review fails the gate no matter what: no request here can turn it into an outage pass. Devin's threads are
        // read best-effort only so the reason can report Devin's side too (a read failure just leaves that side "unknown").
        let bbThreads;
        if (devin && REAL_REVIEW_RE.test(devin.description || '') && !/skip/i.test(devin.description || '')) {
          try { bbThreads = await retry(() => io.getThreads()); } catch { bbThreads = null; }
        }
        d = decide({ devin, bbReview, threads: bbThreads, elapsedMin, nudgeMin, maxMin, strict, fastPass });
      } else {
        let nudged = true;
        if (!devin && elapsedMin >= nudgeMin) {
          try { nudged = hasNudge(await retry(() => io.listComments()), sha); } catch (e) { warnings.push(`could not list comments to check for a nudge (${errLine(e)}); not nudging this poll`); }
        }
        let threads;
        if (devin && REAL_REVIEW_RE.test(devin.description || '') && !/skip/i.test(devin.description || '')) {
          // Only the verdict that depends on the threads degrades (decide: null -> pass unreviewed); it never masks bb-review.
          try { threads = await retry(() => io.getThreads()); } catch (e) { threads = null; warnings.push(`could not read Devin review threads (${errLine(e)})`); }
        } else if (fastPass || strict) {
          // The fast path passes before Devin's verdict, and strict mode must not pass a timeout/skip over a finding
          // already posted, so both read what Devin has posted so far (decide refuses to fast-pass unread threads).
          try { threads = await retry(() => io.getThreads()); } catch (e) { threads = null; warnings.push(`could not read Devin review threads (${errLine(e)})${fastPass ? '; not fast-passing' : ''}`); }
        }
        d = decide({ devin, bbReview, threads, elapsedMin, nudged, nudgeMin, maxMin, strict, fastPass });
        if (d.action === 'pass' && d.unreviewed && threads === undefined) {
          // About to pass WITHOUT Devin's verdict and the threads were never read: read them once now, so a red thread
          // Devin already posted fails the gate instead of a sweep re-run that would pass again (Devin, #237).
          try { threads = await retry(() => io.getThreads()); } catch (e) { threads = null; warnings.push(`could not read Devin review threads (${errLine(e)})`); }
          d = decide({ devin, bbReview, threads, elapsedMin, nudged, nudgeMin, maxMin, strict, fastPass });
        }
      }
      if (d.nudge) {
        // Marker first, then the command alone on line 1 so Devin's trigger reads it. A failed post can have
        // landed (ambiguous timeout), so every RETRY re-lists comments and skips when this head's marker exists.
        let first = true;
        try {
          await retry(async () => {
            if (!first && hasNudge(await io.listComments(), sha)) return;
            first = false;
            await io.postComment(`/devin review\n\n${nudgeMarker(sha)}\n_devin-gate: no Devin Review status after ${nudgeMin} min; asking once._`);
          });
          io.log(`nudged Devin for ${sha.slice(0, 8)}`);
        } catch (e) { warnings.push(`could not post the Devin nudge (${errLine(e)})`); }
      }
      if (d.action !== 'wait') { result = d; break; }
      io.log(d.reason);
    } catch (e) {
      result = apiOutage(e);
      break;
    }
    await io.sleep(pollMs);
  }
  if (result.action === 'pass') {
    // A hold Sam adds while this run was deciding must not leave a green check behind it: re-read once just before passing.
    // A failed re-read FAILS (v1.9.1, Devin SEC_ on universal-auth #27): after an outage pass no PR read may ever have
    // succeeded, so nothing proves the PR is not held. The sweep re-runs a failed gate on a PR that is not held.
    try { if (isHeld(await retry(() => io.getPr()))) result = { action: 'fail', unreviewed: null, reason: HELD_REASON }; } catch (e) {
      const msg = `could not re-read the PR for a hold before passing (${errLine(e)}) - failing: a hold cannot be ruled out; the sweep re-runs this gate`;
      warnings.push(msg);
      result = { action: 'fail', unreviewed: null, reason: msg };
    }
  }
  // unreviewed === null is no longer produced by decide(); kept as a guard for a caller that wants to leave the label alone.
  try { if (result.unreviewed !== null) await retry(() => io.setLabel(!!result.unreviewed)); } catch (e) { warnings.push(`could not update the ${LABEL} label (${String(e?.message || e).split('\n')[0]})`); }
  return { result, sha, elapsedMin: (io.now() - t0) / 60000, warnings };
}

// ---- GitHub I/O (only runs when invoked directly) ----------------------------------------

const THREADS_Q = 'query($o:String!,$n:String!,$p:Int!,$a:String){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100,after:$a){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated path line comments(first:1){nodes{author{login} body url}}}}}}}';

/**
 * Every request gets an AbortSignal timeout: min(requestTimeoutMs, time left in the gate window).
 * `deadlineMs` (absolute epoch ms) is the end of that window; past it each request gets a 1 s budget so
 * retries fail fast and the outage pass is reached long before the job timeout.
 */
export function githubIo(env = process.env, fetchFn = fetch, { requestTimeoutMs = REQUEST_TIMEOUT_MS, deadlineMs = Infinity, nowFn = () => Date.now() } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const pr = Number(env.PR_NUMBER);
  const [owner, name] = String(repo || '').split('/');
  if (!owner || !name || !Number.isInteger(pr) || pr <= 0 || !env.GITHUB_TOKEN) throw new Error('devin-gate: GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required');
  const api = async (method, path, body, okCodes = []) => {
    const budget = Math.max(Math.min(1000, requestTimeoutMs), Math.min(requestTimeoutMs, deadlineMs - nowFn()));
    // A ref'd timer (AbortSignal.timeout's is unref'd) so a hung request cannot let the process exit silently.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error(`request timed out after ${budget} ms`)), budget);
    try {
    const r = await fetchFn(path.startsWith('http') ? path : `https://api.github.com${path}`, {
      method,
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json', 'user-agent': 'bb-devin-gate' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ac.signal,
    });
    if (okCodes.includes(r.status)) return null;
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : await r.json();
    } finally { clearTimeout(timer); }
  };
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  return {
    api,
    getPr: async () => { const p = await api('GET', `/repos/${repo}/pulls/${pr}`); return { sha: p.head.sha, draft: !!p.draft, headRef: p.head.ref, author: p.user?.login || '', changedFiles: p.changed_files, title: p.title || '', labels: (p.labels || []).map((l) => l.name) }; },
    // Changed paths (a rename contributes both names). A partial list could hide a canonical file, so the page cap
    // and a count that disagrees with the PR's changed_files both THROW (the caller then judges strictly).
    getFiles: async (expectedCount) => {
      const all = [];
      let n = 0;
      for (let page = 1; page <= FILES_PAGE_LIMIT; page++) {
        const batch = await api('GET', `/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new Error('pull files unreadable');
        for (const f of batch) { n++; all.push(f.filename); if (f.previous_filename) all.push(f.previous_filename); }
        if (batch.length < 100) {
          if (typeof expectedCount === 'number' && expectedCount !== n) throw new Error(`pull files incomplete: read ${n} of ${expectedCount}`);
          return all;
        }
      }
      throw new Error(`pull files incomplete: more than ${FILES_PAGE_LIMIT * 100} files`);
    },
    // The status LIST (newest first) - the combined endpoint omits `creator`, which the fast path must check.
    getCanonicalStatus: async (sha) => {
      for (let page = 1; page <= 5; page++) {
        const list = await api('GET', `/repos/${repo}/commits/${sha}/statuses?per_page=100&page=${page}`);
        if (!Array.isArray(list)) return null;
        const s = list.find((x) => x?.context === CANONICAL_CONTEXT);
        if (s) return { state: s.state, creator: s.creator?.login || '', description: s.description || '' };
        if (list.length < 100) return null;
      }
      return null;
    },
    // The combined-status endpoint returns the LATEST status per context, which is what a re-run of Devin needs.
    getStatuses: async (sha) => (await api('GET', `/repos/${repo}/commits/${sha}/status?per_page=100`)).statuses || [],
    listComments: async (since) => {
      const all = [];
      for (let page = 1; page <= 20; page++) {
        const c = await api('GET', `/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}${since ? `&since=${encodeURIComponent(since)}` : ''}`);
        all.push(...c);
        if (c.length < 100) return all;
      }
      throw new Error('PR has more than 2000 comments: the comment list is incomplete');
    },
    postComment: (body) => api('POST', `/repos/${repo}/issues/${pr}/comments`, { body }),
    getThreads: async () => {
      const out = [];
      let after = null;
      for (let page = 0; page < THREAD_PAGE_LIMIT; page++) {
        const r = await api('POST', '/graphql', { query: THREADS_Q, variables: { o: owner, n: name, p: pr, a: after } });
        const rt = r?.data?.repository?.pullRequest?.reviewThreads;
        if (!rt || !Array.isArray(rt.nodes)) throw new Error(`graphql reviewThreads unreadable: ${JSON.stringify(r?.errors || r).slice(0, 200)}`);
        for (const t of rt.nodes) {
          const c = t.comments?.nodes?.[0];
          out.push({ isResolved: !!t.isResolved, isOutdated: !!t.isOutdated, path: t.path, line: t.line, author: c?.author?.login || '', body: c?.body || '', url: c?.url || '' });
        }
        if (!rt.pageInfo?.hasNextPage) return out;
        after = rt.pageInfo.endCursor;
      }
      // Still more pages at the limit: a partial list could miss a red thread, so it is NOT a clean read.
      throw new Error(`review threads incomplete: more than ${THREAD_PAGE_LIMIT * 100} threads`);
    },
    setLabel: async (on) => {
      if (on) {
        await api('POST', `/repos/${repo}/labels`, { name: LABEL, color: 'fbca04', description: 'Merged-ready without a Devin review (skipped, absent or API down)' }, [422]);
        await api('POST', `/repos/${repo}/issues/${pr}/labels`, { labels: [LABEL] });
      } else {
        await api('DELETE', `/repos/${repo}/issues/${pr}/labels/${encodeURIComponent(LABEL)}`, undefined, [404]);
      }
    },
    sleep,
    now: () => Date.now(),
    log: (l) => console.log(`${new Date().toISOString().replace('T', ' ').slice(0, 19)} ${l}`),
  };
}

// ---- sweep: re-run a failed gate once its red threads are resolved -----------------------------

/**
 * Pure. Should the latest devin-gate run be re-run now?
 *   run      {status, conclusion, run_attempt, id} of the newest devin-gate run on the head
 *   bbReview {state}|null;  threads = review threads (null = unreadable)
 *   corrected = newest sweep-corrected marker {at, fp, trail, lastFp} (null = none found; undefined = comment list unreadable)
 *   strict = as in decide(): which threads block (blockingFindings). The canonical fast path plays no part here:
 *   unreadable threads never re-run a red gate, on any PR - a re-run under the same outage could turn a PR with
 *   an open red finding green (codex P1, BB_Tools #237).
 * Only a completed run whose conclusion was a failure OR no verdict at all (RETRYABLE_CONCLUSIONS), under the
 * attempt cap, whose fresh verdict would be green. A PR that is still red is never re-run, so the sweep cannot
 * loop or spam. A no-verdict run gets a FULL rerun: it has no failed job for rerun-failed-jobs to target.
 */
export function sweepDecision({ run, bbReview, threads, corrected, nowMs = Date.now(), strict = false, held = false }) {
  const blocking = (ts) => blockingFindings(ts, { strict });
  const what = strict ? 'open Devin thread(s) (strict)' : 'red finding(s)';
  if (!run) return { rerun: false, why: 'no devin-gate run on this head' };
  // Anti-loop: after SWEEP_MAX_ATTEMPTS the run is re-tried at most once per SWEEP_COOLDOWN_MS (never permanently
  // stranded: a late resolve is picked up within the hour). Applies to stale-green re-runs too: a re-run whose
  // own read degrades green again (threads unreadable, an API flap) would otherwise re-trigger every tick.
  const cooling = (run.run_attempt || 1) >= SWEEP_MAX_ATTEMPTS && nowMs - Date.parse(run.updated_at || run.created_at || 0) < SWEEP_COOLDOWN_MS;
  // v1.7.0: a hold is judged before anything else. A green gate on a held PR is stale (the hold came after it, and the
  // edited/labeled event was missed): re-run it - the re-run fails on the hold. It can pass again only when its own PR
  // read fails (the outage pass), so the re-run honours the same attempt cap + cooldown as every other stale-green
  // correction instead of firing every tick (Devin, BB_Tools #264). A failed run on a held PR is never retried while the
  // hold stands: the retry would fail again on the hold.
  // Round 4 (BB_Tools #264): dating the hold (PR updated_at, then issue events) kept leaving a hole - a held PR's green gate
  // must not depend on WHEN the hold began. A held PR can no longer auto-merge at all: every sweep disarms its auto-merge
  // (runSweep, before any decision), and landed --arm refuses a held PR (exit 5). So this re-run only refreshes the
  // check's colour and keeps the plain cap + cooldown: a new hold, an old hold, a re-added hold, unrelated activity -
  // all the same, because none of them can merge the PR.
  if (held && run.status === 'completed' && run.conclusion === 'success') {
    if (cooling) return { rerun: false, why: `${HELD_REASON} after the gate passed, but ${run.run_attempt} attempts already - cooling down (once per hour)` };
    return { rerun: true, full: true, why: `${HELD_REASON} after the gate passed: the green gate is stale` };
  }
  if (held) return { rerun: false, why: `${HELD_REASON} - not re-run until Sam lifts it` };
  const bbFailed = !!bbReview && /^(failure|error)$/i.test(bbReview.state || '');
  // A PASSED gate can be stale in two directions: bb-review failed after the green, or a red review landed
  // after the gate's last thread read while an older run finished later and posted green on top (status-event
  // runs live in their own concurrency group and can always overlap a PR run; Devin, BB_Tools #213). The sweep
  // is the last writer: re-run so the newest verdict re-judges current state.
  if (run.status === 'completed' && run.conclusion === 'success') {
    const staleWhy = bbFailed ? 'bb-review failed after the gate passed'
      : (threads && blocking(threads).length ? `${blocking(threads).length} ${what} appeared after the gate passed` : null);
    if (staleWhy) {
      const fp = threadFingerprint(threads) || 'none';
      // A correction fires whenever no marker FOR THIS THREAD STATE says it already did - first corrections
      // are never held up by run_attempt (it counts retries for unrelated earlier states; Devin, BB_Tools
      // #214). A marker suppresses only while the thread state it was written against is unchanged: a
      // reopened or newly-landed red finding changes the fingerprint and fires immediately rather than
      // hiding behind the cooldown (Devin, BB_ControlTower #783). The fingerprint cannot by itself tell a
      // red that STAYED open from one that was resolved and re-opened - both carry the same bits - so the
      // marker also yields when its trail records any post-correction transition: the matching fingerprint
      // is then a new occurrence, not the state that was already corrected (Devin, BB_Tools #215). Comment
      // history unreadable (undefined) proves neither first nor repeat: defer the decision until the marker
      // read succeeds - one sweep tick for a transient failure, a loud line for a persistent one (Devin,
      // BB_Tools #214).
      if (corrected === undefined) return { rerun: false, why: 'correction history unreadable - deferring the stale-green correction until the marker read succeeds' };
      // A trail entry proves a correction only when it carries a DIFFERENT fingerprint - a crumb identical
      // to the marker's records "state unchanged at that tick" (posted unconditionally when the marker read
      // had failed) and must not lift suppression by itself (Devin, CT #787).
      const moved = (corrected?.trail || []).some((t) => t.fp !== corrected.fp);
      if (corrected && corrected.fp === fp && !moved && nowMs - corrected.at < SWEEP_COOLDOWN_MS) {
        // A partial trail-status history cannot prove nothing moved - the move may sit beyond what was
        // read, and a reopened red finding must not stay mergeable under a stale green (Devin, BMB #985 /
        // CT #791 / BB_Scan #35). Re-judging is always safe: the new run reads live threads. Repeats are
        // bounded by the same attempt cap the retryable path honours - a persistent status-API outage
        // fires at most SWEEP_MAX_ATTEMPTS corrections, then once per cooldown.
        if (corrected.historyIncomplete && !cooling) return { rerun: true, full: true, corrected: true, fp, why: `${staleWhy}: the trail-status history is incomplete - re-judging rather than trusting a partial read` };
        if (corrected.historyIncomplete) return { rerun: false, why: `trail-status history incomplete and the run has ${run.run_attempt} attempts - cooling down (one retry per hour)` };
        return { rerun: false, why: `stale-green correction against this same thread state fired ${((nowMs - corrected.at) / 60000).toFixed(0)} min ago; cooling down (one retry per hour)` };
      }
      return { rerun: true, full: true, corrected: true, fp, why: `${staleWhy}: the green gate is stale` };
    }
  }
  if (run.status !== 'completed' || !RETRYABLE_CONCLUSIONS.has(run.conclusion)) return { rerun: false, why: `latest run is ${run.status}/${run.conclusion || '-'}` };
  if (cooling) return { rerun: false, why: `run attempted ${run.run_attempt} times; cooling down (one retry per hour)` };
  if (bbReview && /^(failure|error)$/i.test(bbReview.state || '')) return { rerun: false, why: 'bb-review still failing' };
  if (threads === null || threads === undefined) return { rerun: false, why: 'threads unreadable' };
  const n = blocking(threads).length;
  if (n) return { rerun: false, why: `${n} ${what} still open` };
  return { rerun: true, full: run.conclusion !== 'failure', why: `no ${strict ? 'open Devin threads (strict)' : 'unresolved red findings'}: the ${run.conclusion} gate run is stale` };
}

/**
 * Every devin-gate run that can belong to this PR head, newest first. Queried PER HEAD (head_sha, and the head branch for
 * pull_request_target runs, whose head_sha is the unverified base commit), each paginated: one page of the repo's latest
 * runs loses a PR's failed run after ~100 newer ones (the sweep's own cron makes ~6 an hour). The sweep's own schedule
 * runs are never candidates.
 */
export async function findGateRuns(api, repo, p, maxPages = RUN_PAGE_LIMIT) {
  const sha = p.head.sha;
  const queries = [`head_sha=${encodeURIComponent(sha)}`];
  if (p.head.ref) queries.push(`branch=${encodeURIComponent(p.head.ref)}`);
  // A pull_request_target run can be attached to the BASE (head_branch = base ref, head_sha = base sha): neither query above finds it.
  // Query the base branch / base sha too; the PR-association filter below keeps only this PR's runs (Devin round 2, #186).
  // That query is narrowed to pull_request_target runs created since this PR opened: the base branch also carries every other PR's
  // runs and the sweep's own cron (~144 a day), which pushed an older failed run past the page cap (Devin, ProjExp5 #32).
  if (p.base?.ref) queries.push(`branch=${encodeURIComponent(p.base.ref)}&event=pull_request_target${p.created_at ? `&created=${encodeURIComponent('>=' + p.created_at)}` : ''}`);
  if (p.base?.sha) queries.push(`head_sha=${encodeURIComponent(p.base.sha)}`);
  const byId = new Map();
  for (const q of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const batch = (await api('GET', `/repos/${repo}/actions/workflows/devin-gate.yml/runs?${q}&per_page=100&page=${page}`)).workflow_runs || [];
      for (const x of batch) byId.set(x.id, x);
      if (batch.length < 100) break;
    }
  }
  return [...byId.values()]
    .filter((x) => x.event !== 'schedule' && x.event !== 'status')
    // A skipped run rendered no verdict (a draft, a non-default base): never the PR's current run (v1.8.0).
    .filter((x) => x.conclusion !== 'skipped')
    // A run GitHub attributes to OTHER PRs is not this one's even when it shares the head sha (Devin, CalExp5 #684); only a run with no
    // attribution at all falls back to the head sha.
    .filter((x) => (x.pull_requests || []).some((q) => q.number === p.number) || (x.head_sha === sha && !(x.pull_requests || []).length))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

/** Walk the open PRs; re-run the failed devin-gate run of each one whose verdict is now green. Returns [{pr, rerun, why}]. */
export async function runSweep(env, fetchFn = fetch, log = console.log, nowMs = Date.now(), { sleep, backoffMs, newId = recordId } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const base = githubIo({ ...env, PR_NUMBER: '1' }, fetchFn);
  const prs = [];
  for (let page = 1; ; page++) {
    if (page > OPEN_PR_PAGE_LIMIT) { log(`sweep: more than ${OPEN_PR_PAGE_LIMIT * 100} open PRs; the rest are not checked`); break; }
    const batch = await base.api('GET', `/repos/${repo}/pulls?state=open&per_page=100&page=${page}`);
    prs.push(...batch);
    if (batch.length < 100) break;
  }
  const out = [];
  for (const p of prs) {
    if (p.draft) continue;
    try {
      const io = githubIo({ ...env, PR_NUMBER: String(p.number) }, fetchFn);
      const sha = p.head.sha;
      // The open-PR list carries title and labels: a hold added after the gate passed is caught here even when its event was missed.
      const held = isHeld({ title: p.title, labels: (p.labels || []).map((l) => l && l.name) });
      // A held PR never auto-merges: disarm it on every tick, whatever the gate run says and whenever the hold began
      // (Devin rounds 1-4, BB_Tools #264 - a green gate on a held PR can no longer merge it). Only when the list shows
      // auto-merge armed (null = not armed); a failed disarm is reported in the sweep line and retried next tick.
      // The list can be stale by the time the mutation runs (Devin round 5): the PR is re-read right before it, and
      // disarmed only while it is STILL held and armed. A hold lifted in the moment between that re-read and the mutation
      // is caught by a read after it: the job cannot re-enable auto-merge (contents stays read-only), so it records the
      // original request on the PR - merge method + the re-arm command - and the owner's PR-goal stop hook sees it unarmed.
      let disarmNote = '';
      if (held && p.auto_merge !== null) {
        try {
          const live = await io.api('GET', `/repos/${repo}/pulls/${p.number}`);
          if (!live || !isHeld({ title: live.title, labels: live.labels }) || !live.auto_merge) {
            disarmNote = ' - hold lifted or auto-merge off on re-read: auto-merge left alone';
          } else {
            const r = await io.api('POST', '/graphql', { query: DISARM_Q, variables: { id: live.node_id || p.node_id } });
            if (!r || r.errors || !r.data || !r.data.disablePullRequestAutoMerge) throw new Error(`disablePullRequestAutoMerge: ${JSON.stringify((r && r.errors) || r).slice(0, 200)}`);
            disarmNote = ' - auto-merge disarmed (held)';
            const after = await io.api('GET', `/repos/${repo}/pulls/${p.number}`).catch(() => null);
            const method = live.auto_merge.merge_method || 'squash';
            const readLive = () => io.api('GET', `/repos/${repo}/pulls/${p.number}`);
            if (after && !isHeld({ title: after.title, labels: after.labels })) {
              // v1.10.0: a fresh id that names no record, so this late note can never close a newer hold's record.
              disarmNote = ` - auto-merge disarmed, but the hold was lifted meanwhile: re-arm (${method}) requested on the PR`;
              try {
                disarmNote += await postLiftNote(io, readLive, { method, id: newId(), armed: false, sleep, backoffMs, newId });
              } catch (e) { disarmNote = ` - auto-merge disarmed, but the hold was lifted meanwhile and the re-arm note could not be settled (${errLine(e)}): re-arm (${method}) needed`; }
            } else {
              // v1.9.2 (Devin, CalExp5 #763 / BB_Tools #269): the record lets the hold job that sees the hold lifted ask for
              // the re-arm; settleDisarm retries it and settles a hold lifted while it was written.
              try {
                disarmNote += await settleDisarm(io, readLive, method, { sleep, backoffMs, newId });
              } catch (e) { disarmNote = ` - ${errLine(e)}`; }
            }
          }
        } catch (e) { disarmNote = ` - auto-merge disarm FAILED, retried next tick (${errLine(e)})`; }
      }
      // pull_request_review runs record the PR head sha; pull_request_target's head_sha is UNVERIFIED (the workflow is not on main yet),
      // so also match by the PR association GitHub attaches to the run (findGateRuns).
      const run = (await findGateRuns(io.api, repo, p))[0] || null;
      const stale = run && run.status === 'completed' && (run.conclusion === 'success' || RETRYABLE_CONCLUSIONS.has(run.conclusion));
      if (!stale) { out.push({ pr: p.number, rerun: false, why: sweepDecision({ run, nowMs }).why + disarmNote }); continue; }
      const statuses = await io.getStatuses(sha);
      const bbReview = statuses.find((s) => s.context === BB_REVIEW_CONTEXT) || null;
      // Threads are read when the verdict depends on them: a failed/never-verdicted run needs them to know
      // a retry would be green, and a PASSED run needs them when Devin has reviewed - a red review that
      // landed after the gate's last thread read can hide under that older green run (Devin, BB_Tools #213).
      // Read for an UNREVIEWED green too: a pass before Devin's verdict (timeout, the canonical fast path) is exactly where a
      // red thread Devin posts later would otherwise stay hidden under the green (codex P1, BB_Tools #237).
      const threads = await io.getThreads().catch(() => null);
      // The correction marker is only needed where a stale-green verdict is possible; it is how a repeat is
      // told from a first correction without trusting attempt counts or evidence timestamps.
      // undefined when the comment list itself failed: "no marker" (null) and "unknowable" are different -
      // only the former proves a first correction.
      // Only markers inside the cooldown can suppress a correction, so the read is bounded to that window:
      // a PR past the 2000-comment pagination cap is not left permanently uncorrectable (Devin, CT #783).
      // Read for retryable runs too: when the sweep retries a failed run after a resolution, the new
      // fingerprint must land in the marker's trail - otherwise a later REOPEN carries the same bits the
      // original correction was written against and hides behind it (Devin, ProjExp5 #39).
      const corrected = run.conclusion === 'success' || RETRYABLE_CONCLUSIONS.has(run.conclusion)
        ? await io.listComments(new Date(nowMs - SWEEP_COOLDOWN_MS).toISOString()).then((cs) => sweepCorrection(cs, run.id), () => undefined)
        : null;
      // A devin-gate-trail commit status is the durable crumb written when a transition could not go into
      // the comment trail (comment outage at retry time). Read the status HISTORY (the list endpoint answers
      // newest-first, paginated): `statuses` is the combined view, latest-per-context only, so a later crumb
      // re-recording the marker's own fp would shadow an earlier recorded move and let a resolve/reopen
      // round-trip hide behind the marker (Devin, CalExp5 #731). Any crumb newer than the marker whose fp
      // differs from the marker's counts as a recorded move; same-fp proves nothing changed. When the history
      // endpoint fails, the combined view is the fallback - shadowed moves stay invisible but nothing errs.
      if (corrected) {
        // The list is paginated newest-first: keep reading pages until they reach the marker's time - a crumb
        // older than the marker can never count, and stopping there keeps the read to one page in practice
        // (Devin, BB_Tools #221: a move pushed past page 1 by other contexts' statuses would hide again). A
        // A FAILED page or the page cap leaves a PARTIAL history: not reaching the marker means a move could
        // be sitting beyond what was read, so the read is marked incomplete - the suppression in
        // sweepDecision then re-judges rather than trusting it as proof that nothing moved (Devin,
        // BMB #985 / CT #791 / BB_Scan #35). The combined `statuses` are always unioned in: its latest
        // trail crumb can carry a move the paged list missed (Devin, ProjExp5 #40).
        const list = [];
        let complete = false;
        for (let page = 1; page <= 5; page++) {
          const batch = await io.api('GET', `/repos/${repo}/commits/${sha}/statuses?per_page=100&page=${page}`).then((l) => (Array.isArray(l) ? l : null), () => null);
          if (batch === null) break;
          list.push(...batch);
          if (batch.length < 100 || batch.some((s) => Date.parse(s?.created_at || 0) <= corrected.at)) { complete = true; break; }
        }
        if (!complete) corrected.historyIncomplete = true;
        const crumbs = [...list, ...statuses]
          .filter((s) => s && s.context === SWEEP_TRAIL_CONTEXT)
          .map((s) => ({ fp: `status:${(s.description || '').match(/^fp=([0-9a-f]{16})/)?.[1]}`, at: Date.parse(s.created_at || 0) }))
          .filter((t) => t.fp !== 'status:undefined' && t.fp !== `status:${fpHash(corrected.fp)}` && Number.isFinite(t.at) && t.at > corrected.at)
          .sort((a, b) => a.at - b.at);
        for (const t of crumbs) if (!corrected.trail.some((e) => e.fp === t.fp)) corrected.trail.push(t);
      }
      // Strict input, best effort: an unreadable file list judges strictly. The open-PR LIST carries no
      // changed_files, so the count comes from the single-PR read; an unknown count or a short read is strict
      // (Devin, CT #796: getFiles() without a count accepted a partial list).
      let files = null;
      try {
        const count = typeof p.changed_files === 'number' ? p.changed_files : (await io.getPr()).changedFiles;
        files = typeof count === 'number' ? await io.getFiles(count) : null;
      } catch { files = null; }
      const strict = isStrict(files);
      const d = sweepDecision({ run, bbReview, threads, corrected, nowMs, strict, held });
      // The fingerprint alone cannot tell a red that STAYED open from one that resolved and re-opened
      // (identical bits), so each observed transition is recorded against the marker: its trail then
      // proves a same-fingerprint state is a NEW occurrence and lifts the cooldown suppression
      // (Devin, BB_Tools #215). The write must land BEFORE a rerun is requested - a retry that turns
      // the gate green with the transition unrecorded lets a later reopen reuse the stale marker
      // (Devin, BB_Tools #218). A fresh correction records the fp in its own marker, so it skips this.
      const fpNow = threads != null ? (threadFingerprint(threads) || 'none') : null;
      // Persist the transition BEFORE a non-correction rerun: a retry that greens the gate with the move
      // unrecorded lets a later reopen reuse the stale marker (Devin, BB_Tools #218). The record goes to
      // the commit-STATUS crumb (durable, independent of the comment API) - so it lands even mid comment
      // outage - plus the comment trail when a marker is known. Deferral applies only when a marker might
      // exist - marker present, or its history UNREADABLE (undefined: an unknown marker is not proof of
      // none, and an unrecorded retry would let a later reopen hide behind it - Devin, ProjExp5 #40 /
      // BB_Scan #34) - and the transition is unrecorded and BOTH stores failed (Devin, CT #787 /
      // BB_Tools #219). A proven absent marker (null) never defers: no history exists to protect.
      let breadcrumbErr = null;
      const crumbNeeded = fpNow !== null && !d.corrected && (corrected === undefined ? d.rerun : !!(corrected && fpNow !== corrected.lastFp));
      if (crumbNeeded) {
        let crumbOk = false;
        try {
          await io.api('POST', `/repos/${repo}/statuses/${sha}`, { state: 'success', context: SWEEP_TRAIL_CONTEXT, description: sweepTrailStatus(fpNow) });
          crumbOk = true;
        } catch (e) { breadcrumbErr = e; }
        try {
          await io.postComment(`_devin-gate: the review-thread state moved since the last stale-green correction; recording it so a resolve/reopen round-trip cannot hide behind the marker._\n\n${sweepStateMarker(fpNow, new Date(nowMs).toISOString())}`);
          if (corrected) { corrected.lastFp = fpNow; corrected.trail.push({ fp: fpNow, at: nowMs }); }
          crumbOk = true;
        } catch (e) { if (!crumbOk) breadcrumbErr = breadcrumbErr || e; }
        if (crumbOk) breadcrumbErr = null; else breadcrumbErr = breadcrumbErr || new Error('comment and status writes both failed');
      }
      if (d.rerun && !d.corrected && corrected !== null && crumbNeeded && breadcrumbErr) {
        d.rerun = false;
        d.why += ` - deferred: the state transition could not be persisted (${errLine(breadcrumbErr)})`;
      }
      if (d.rerun) {
        await io.api('POST', `/repos/${repo}/actions/runs/${run.id}/${d.full ? 'rerun' : 'rerun-failed-jobs'}`);
        // The rerun already fired: a failed marker post loses the repeat record, not the result.
        if (d.corrected) { try { await io.postComment(`_devin-gate: the latest green verdict is stale (${d.why}); re-running the check._\n\n${sweepCorrectedMarker(run.id, new Date(nowMs).toISOString(), d.fp)}`); } catch (e) { d.why += ` (correction marker failed: ${errLine(e)})`; } }
      } else if (breadcrumbErr) { d.why += ` (state trail write failed: ${errLine(breadcrumbErr)})`; }
      out.push({ pr: p.number, rerun: d.rerun, why: d.why + disarmNote });
    } catch (e) { out.push({ pr: p.number, rerun: false, why: `error: ${errLine(e)}` }); }
  }
  for (const o of out) log(`sweep #${o.pr}: ${o.rerun ? 'RE-RAN' : 'skip'} - ${o.why}`);
  return out;
}

/**
 * STATUS MODE. A `bb-review` failure/error status arrived (env STATUS_SHA/STATUS_CONTEXT/STATUS_STATE from the event). The
 * event has no PR and its run belongs to the default branch, so find the open non-draft PRs whose head IS that sha and whose
 * base is the default branch, and re-run each one's COMPLETED devin-gate run (a green one would otherwise stay green). A run
 * still in progress reads the status itself. Returns [{pr, rerun, why}].
 */
export async function runStatusEvent(env, fetchFn = fetch, log = console.log) {
  const repo = env.GITHUB_REPOSITORY;
  const sha = String(env.STATUS_SHA || '');
  const out = [];
  if (env.STATUS_CONTEXT !== BB_REVIEW_CONTEXT || !/^(failure|error)$/i.test(env.STATUS_STATE || '')) { log(`status: ignoring ${env.STATUS_CONTEXT}/${env.STATUS_STATE}`); return out; }
  if (!/^[0-9a-f]{7,64}$/i.test(sha)) throw new Error('devin-gate: STATUS_SHA is not a commit sha');
  const { api } = githubIo({ ...env, PR_NUMBER: '1' }, fetchFn);
  const prs = (await api('GET', `/repos/${repo}/commits/${sha}/pulls?per_page=100`)) || [];
  for (const p of prs) {
    if (p.state !== 'open' || p.draft || p.head?.sha !== sha) continue;
    if (p.base?.ref !== p.base?.repo?.default_branch) { out.push({ pr: p.number, rerun: false, why: 'base is not the default branch' }); continue; }
    try {
      const run = (await findGateRuns(api, repo, p))[0] || null;
      if (!run) out.push({ pr: p.number, rerun: false, why: 'no devin-gate run on this head' });
      else if (run.status !== 'completed') out.push({ pr: p.number, rerun: false, why: `latest run is ${run.status}: it reads the status itself` });
      else if (run.conclusion === 'failure') out.push({ pr: p.number, rerun: false, why: 'gate is already red' });
      else { await api('POST', `/repos/${repo}/actions/runs/${run.id}/rerun`); out.push({ pr: p.number, rerun: true, why: 'bb-review failed after the gate completed' }); }
    } catch (e) { out.push({ pr: p.number, rerun: false, why: `error: ${errLine(e)}` }); }
  }
  for (const o of out) log(`status #${o.pr}: ${o.rerun ? 'RE-RAN' : 'skip'} - ${o.why}`);
  return out;
}

/**
 * HOLD MODE (v1.8.0). Run by devin-gate-hold.yml when a PR's title changes or the sams-merge label is added or removed.
 * Reads the PR live. Held and armed -> auto-merge is disarmed now (a hold lifted between the read and the mutation gets
 * the sweep's re-arm note). Then the PR's latest devin-gate run is RE-RUN in full once it has finished (an unfinished
 * one is waited for: it may have read the PR before the change), so the real gate re-judges the hold and posts its
 * verdict on the head. This job never posts a devin-gate check - that is the point: a SKIPPED devin-gate run counts as
 * passing for a required check. A run still unfinished after waitMs THROWS (this job goes red; the 10-minute sweep
 * re-runs a passed gate on a held PR). Returns {disarmed, rerun, why}.
 * v1.9.0: env.HOLD_PHASE = 'disarm' (the disarm only, never waits) or 'recheck' (the wait and re-run only); unset = both.
 * v1.9.2: a disarm of a PR that stays held posts a record (disarmedNote); an unheld, unarmed PR with an open record gets
 * the re-arm note (the hold was lifted); the recheck phase disarms a held, armed PR right before its re-run.
 */
export async function runHoldRecheck(env, fetchFn = fetch, log = console.log, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), nowFn = () => Date.now(), pollMs = 15000, waitMs = HOLD_WAIT_MS, backoffMs: holdBackoffMs = 2000, newId = recordId } = {}) {
  const repo = env.GITHUB_REPOSITORY;
  const io = githubIo(env, fetchFn);
  const n = Number(env.PR_NUMBER);
  // v1.9.0: devin-gate-hold.yml runs the two phases as two jobs, so the disarm is never queued behind a wait.
  const phase = env.HOLD_PHASE || 'both';
  if (!['disarm', 'recheck', 'both'].includes(phase)) throw new Error(`devin-gate: HOLD_PHASE must be disarm, recheck or unset (got ${JSON.stringify(phase)})`);
  const out = { disarmed: false, rerun: false, why: '' };
  const done = (why) => { out.why = why; log(`hold #${n}: ${out.rerun ? 'RE-RAN the gate' : 'no re-run'}${out.disarmed ? ', disarmed auto-merge' : ''} - ${why}`); return out; };
  const readPr = () => io.api('GET', `/repos/${repo}/pulls/${n}`);
  const p = await readPr();
  if (!p || p.state !== 'open') return done('PR is not open');
  const held = isHeld({ title: p.title, labels: p.labels });
  let note = '';
  // A failed disarm, record or re-arm note must not stop the re-run: the re-run is what turns the gate red on a held PR
  // (pre-push review P2). They are reported (thrown, all of them in one error) only after the gate has been re-run.
  const errs = [];
  // As in runSweep (Devin #265): the PR is re-read right before the mutation and disarmed only while it is STILL held
  // and armed; once the mutation succeeds, a failed follow-up read, record or re-arm note is reported as that, not as a
  // failed disarm. Still held after it -> the disarm is recorded on the PR, so lifting the hold later asks for the
  // re-arm (v1.9.2, Devin CalExp5 #763); lifted meanwhile -> the re-arm note at once.
  const disarm = async () => {
    try {
      const live = await readPr();
      if (!live || !isHeld({ title: live.title, labels: live.labels }) || !live.auto_merge) {
        note = ' (hold lifted or auto-merge off on re-read: auto-merge left alone)';
        return;
      }
      const r = await io.api('POST', '/graphql', { query: DISARM_Q, variables: { id: live.node_id || p.node_id } }).catch((e) => ({ errors: [{ message: errLine(e) }] }));
      const method = live.auto_merge.merge_method || 'squash';
      let after;
      let ours = true;
      if (!r || r.errors || !r.data?.disablePullRequestAutoMerge) {
        // hold-disarm jobs are not queued (v1.9.0): a title edit and a label change together start two, and the second
        // mutation fails once the first has disarmed. Auto-merge off on a re-read is the goal reached, not a failure
        // (bb-review first-push P2). Still armed, or unreadable -> the failure stands.
        const again = await readPr().catch(() => null);
        if (!again || again.auto_merge) throw new Error(JSON.stringify(r?.errors || r).slice(0, 200));
        note = ' (auto-merge was already off: another hold job disarmed it)';
        // Our own mutation may have landed with its response lost: this re-read is also the post-disarm read, so a
        // hold lifted meanwhile still gets the re-arm note (Devin #267). A duplicate note beats a lost one.
        after = again;
        ours = false;
      } else {
        out.disarmed = true;
        // A failed re-read is never read as "still held": settleDisarm below re-reads with retries after the record and
        // throws if that fails too (the hold may have been lifted). v1.10.0 (Devin, BMB #1024): this read's own failure is
        // no longer reported - a later read that recovers is the answer, and the error would have outlived it.
        after = await readPr().catch(() => null);
      }
      if (after && !isHeld({ title: after.title, labels: after.labels })) {
        note = ` (the hold was lifted meanwhile: re-arm (${method}) requested on the PR)`;
        try {
          // v1.10.0: a fresh id that names no record, so this late note can never close a newer hold's record.
          note += await postLiftNote(io, readPr, { method, id: newId(), armed: false, sleep, backoffMs: holdBackoffMs, newId });
        } catch (e) { errs.push(new Error(`auto-merge disarmed, but the hold was lifted meanwhile and the re-arm note could not be settled (${errLine(e)}): re-arm (${method}) needed`, { cause: e })); }
      } else if (after || ours) {
        // Our disarm always gets its record; one another job made gets it only when no record is open yet (that job
        // posts its own - unless its mutation's response was lost, which is what this covers). settleDisarm retries the
        // record and re-reads after it (Devin, BB_Tools #269). v1.10.0 (Devin, BMB #1024): the comments are read with
        // retries, and still unreadable -> recorded anyway (a duplicate record costs a duplicate reminder; a lost one
        // strands the PR unarmed).
        try {
          let open = null;
          if (!ours) open = await withRetries(() => io.listComments(), { sleep, backoffMs: holdBackoffMs }).then(openDisarmRecord, () => null);
          note += await settleDisarm(io, readPr, method, { record: !open, id: open ? open.id : undefined, sleep, backoffMs: holdBackoffMs, newId });
        } catch (e) { errs.push(e); }
      }
    } catch (e) { errs.push(new Error(`disablePullRequestAutoMerge failed: ${errLine(e)}`)); }
  };
  if (phase !== 'recheck' && held && p.auto_merge) await disarm();
  // v1.9.2 (Devin CalExp5 #763): the hold was lifted on a PR these jobs disarmed - it would go green and never merge.
  // Only a PR with an open disarm record (armed before the hold) is asked to re-arm. It is re-read first, so a PR held
  // again meanwhile is left alone (its record stays open for the next lift). A PR the owner already re-armed gets the
  // closing note instead, so that old record cannot ask a LATER hold, begun unarmed, to re-arm (Devin, BB_Tools #269).
  if (phase !== 'recheck' && !held) {
    try {
      // v1.10.1: retried - a single failed read here left a lifted hold's record unread and its re-arm never asked (Devin, UA #28)
      const rec = openDisarmRecord(await withRetries(() => io.listComments(), { sleep, backoffMs: holdBackoffMs }));
      if (rec) {
        const live = await readPr();
        if (live && live.state === 'open' && !isHeld({ title: live.title, labels: live.labels })) {
          // v1.10.0: the note names the record it saw (rec.id), so posted late it cannot close a newer one (Devin, CT #811),
          // and a hold renewed right after it gets its record back (postLiftNote; Devin, CalExp5 #766).
          const extra = await postLiftNote(io, readPr, { method: rec.method, id: rec.id, armed: !!live.auto_merge, sleep, backoffMs: holdBackoffMs, newId });
          note = (live.auto_merge ? ` (auto-merge already re-armed: disarm record (${rec.method}) closed)` : ` (the hold was lifted after a disarm: re-arm (${rec.method}) requested on the PR)`) + extra;
        }
      }
    } catch (e) { errs.push(new Error(`could not check for, or post, the re-arm note of a hold lifted after a disarm (${errLine(e)}): a re-arm may be needed`)); }
  }
  const failure = () => {
    if (!errs.length) return null;
    const e = errs.length === 1 ? errs[0] : new Error(errs.map((x) => x.message).join('; '));
    e.holdReported = true;
    return e;
  };
  const finish = (why) => { const r = done(why); const f = failure(); if (f) throw f; return r; };
  if (phase === 'disarm') return finish(`${held ? 'held' : 'not held'}: disarm phase only (hold-recheck re-runs the gate)${note}`);
  const recheck = async () => {
    if (p.draft) return finish(`draft: not gated${note}`);
    const deadline = nowFn() + waitMs;
    let cur = p;
    let run;
    // The run is picked for the CURRENT head: a push during the wait starts a new run on a new sha, and re-running the old
    // one would judge the old head (pre-push review P2). After each wait the PR is re-read; a new head re-selects.
    for (;;) {
      run = (await findGateRuns(io.api, repo, cur))[0] || null;
      if (!run) return finish(`no devin-gate run on this PR yet: its first run judges the hold${note}`);
      while (run.status !== 'completed') {
        if (nowFn() >= deadline) throw new Error(`devin-gate run ${run.id} still ${run.status} after ${Math.round(waitMs / 60000)} min; the 10-minute sweep re-judges this PR`);
        await sleep(pollMs);
        run = await io.api('GET', `/repos/${repo}/actions/runs/${run.id}`);
      }
      const now = await readPr();
      if (!now || now.state !== 'open') return finish(`PR closed while waiting${note}`);
      const same = now.head?.sha === cur.head?.sha;
      cur = now;
      if (same) break;
    }
    // v1.9.2 (Devin SEC_, BB_ControlTower #808): a re-run does not replace the old verdict at once, and a hold added
    // while this job waited may not be disarmed yet (its hold-disarm job failed, or this is the only job left): auto-merge
    // on a held PR could still use the old green. A held PR that is still armed is disarmed here, before the re-run.
    const nowHeld = isHeld({ title: cur.title, labels: cur.labels });
    if (nowHeld && cur.auto_merge) await disarm();
    await io.api('POST', `/repos/${repo}/actions/runs/${run.id}/rerun`);
    out.rerun = true;
    return finish(`${nowHeld ? 'held' : 'not held'}: devin-gate run ${run.id} (${run.conclusion}) re-run to re-judge${note}`);
  };
  // A later failure (listing runs, the re-run POST, the wait deadline) must not mask a disarm problem - that message is
  // the only record that auto-merge may need re-arming (bb-review P1 on #265's follow-up). Both go in the one error.
  try {
    return await recheck();
  } catch (e) {
    if (e && e.holdReported) throw e;
    const f = failure();
    if (!f) throw e;
    throw new Error(`${f.message}; then: ${errLine(e)}`, { cause: e });
  }
}

/** A positive finite number from env, else the default (junk is rejected, not zero). */
export function envMinutes(v, dflt) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : dflt; }

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const env = process.env;
  if (env.DEVIN_GATE_MODE === 'hold') {
    await runHoldRecheck(env);
  } else if (env.GITHUB_EVENT_NAME === 'schedule') {
    await runSweep(env);
  } else if (env.GITHUB_EVENT_NAME === 'status') {
    await runStatusEvent(env);
  } else {
    const cfg = { nudgeMin: envMinutes(env.DEVIN_GATE_NUDGE_MIN, NUDGE_MIN_DEFAULT), maxMin: envMinutes(env.DEVIN_GATE_MAX_MIN, MAX_MIN_DEFAULT), pollS: envMinutes(env.DEVIN_GATE_POLL_S, POLL_S_DEFAULT) };
    const io = githubIo(env, fetch, { deadlineMs: Date.now() + (cfg.maxMin + 1) * 60000 });
    const { result, sha, elapsedMin, warnings } = await runGate(io, cfg);
    const md = summaryMarkdown({ sha, result, elapsedMin, warnings });
    console.log(md);
    if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, md); } catch { /* summary is best effort */ } }
    for (const w of warnings) console.log(`::warning title=devin-gate::${w}`);
    if (result.action === 'fail') { console.log(`::error title=devin-gate::${result.reason}`); process.exit(1); }
  }
}
