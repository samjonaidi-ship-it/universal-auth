#!/usr/bin/env node
// BB_Tools | guardrails/devin-gate.mjs | v1.12.5 | 2026-11-05 | BB
// v1.12.5 also: (7) the compare must show the SAME ADDED LINES as the PR merge-base diff, not just the same file names (C01/C02: early window retries, late window scans the PR list unpinned); (8) a key-body line joins a marked header only inside the same patch (C03). Rows C01-C04, M04 in the case table.
// v1.12.5 (case table docs/DEVIN_GATE_V1_12_5_CASE_TABLE_2026-11-05.md): (1) a commit history the gate could not read COMPLETELY fails the gate (commit list or one commit unreadable after the fallback window, or more than 50 commits) - it no longer passes "unreviewed"; a patch-less FILE in an earlier commit is still an unreviewed pass; (2) merge commits are still not read but are counted in a warning; (3) an allow mark on the pushed line also clears the same line (same path, same text) in an EARLIER commit; (4) a Kubernetes/Helm reference name (secretName / existingSecret / ...Ref, lowercase hyphenated value) is not a secret; (5) the "could not read the diff" warning fires once per head and per HTTP status.
// v1.12.4: (1) the allow mark NEVER clears a high-confidence token (any path); it clears a database URL with a password only when every host on the line is a single-label name (a docker service / placeholder such as postgres, your-db-host) - a host with a dot (a real server or IP) is never clearable; the full case table is docs/DEVIN_GATE_HISTORY_READ_CASE_TABLE_2026-11-04.md; (2) new shapes: a SendGrid SG. key (high-confidence) and a Google AIza key (markable: Firebase / Maps browser keys are public), JWTs, dotted quoted values, ROLE_KEY/PRIVATE_KEY names, and an UNQUOTED KEY=value assignment (24+ chars, a digit and a letter); (3) the scan also reads each non-merge commit of the PR, so a secret added in one commit and removed in a later one is no longer invisible (the NEWEST 50 commits; beyond that a notice row marks the pass unreviewed but does not hold the Devin request; a single-commit PR needs no extra reads); (4) a secret hit fails the gate at once (no waiting out the window); (5) history reads are cached per commit, paged, and flag patch-less files; history lines are judged on EVERY kind exactly like the net diff (a history hit on any kind fails the gate at once, and only a mark already on the pushed line clears it; a mark already on the pushed line still clears it), the unquoted KEY=value kind skips source-code files only (N33), dotted local DB hosts host.docker.internal / *.localhost are exempt in the test-path allowlist (N34; a generic *.local is a real corporate domain and is NOT exempt); a bare UPPERCASE shell $VAR outside source-code files (checked case-sensitively in allKinds) or ${{secrets.X}} is a template (N35). Still open: 72h Devin expiry for label-parked PRs; the dead failSeen replacement.
// v1.12.3: a secret hit is recorded BEFORE anything else in the scan block can throw (scannedSha is set last); the skipped-file warning says "too large or binary"; the scan comments match the code (an unreadable diff fails the gate at the deadline).
// v1.12.2: failSeen is sticky only while the diff is unread; a fail verdict leaves the loop at once; the compare's file names must equal the PR's file list; a REST api() error message carries method, path and status only (GraphQL error objects at the reviewThreads/auto-merge reads still echo up to 200 chars - follow-up); a host=/hostaddr= override is flagged only when its value is not local.
// v1.12.1: the secret scan now also runs the "database URL with password" kind inside test/fixture/example paths (Devin
//   SEC_ on v1.12.0: a prod DB URL under tests/ passed the scan). Local/example hosts stay exempt; the allow mark still clears it there.
// v1.12.0: reviewer provenance, Parity plan W3. (1) IDENTITY: every verdict records, per reviewer, the provider, model and
//   effort next to the head sha (provenance.devin / .bbReview; a field the status does not carry is the word
//   "unrecorded", never a guess). (2) INDEPENDENCE: a Devin review of a PR that Devin itself wrote (author login or a
//   devin/ branch) is the same provider reviewing its own work - not independent evidence, so the verdict is an
//   unreviewed pass plus the devin-unreviewed label (never-stuck, as for a forged status); an author whose provider
//   cannot be told (agent/ branches are Claude or Codex) is recorded "unknown" and is NOT rejected. (3) EXPIRY: a
//   DEVIN status older than EVIDENCE_MAX_AGE_H (default 72, env DEVIN_GATE_EVIDENCE_MAX_AGE_H) is stale evidence (the bb-review slot is bound to the head by its own per-sha status and is not aged here) -
//   unreviewed pass; a status with no timestamp is judged as before. Evidence is bound to the head by construction
//   (statuses are per-sha, #351) and the record carries the head and the status time. (4) SECRET SCAN: before the gate
//   sends a review request for a head it scans the ADDED lines of the diff for secret shapes; a hit (or a diff it could not
//   read) withholds the request and warns, naming the kind and file, never the value. Pure helpers: providerOf,
//   reviewerIdentity, evidenceAgeH, scanSecrets. Tests: test/devin-gate.test.mjs "W3".
// v1.11.2: lint-clean for consumers that eslint scripts/ (universal-auth `pnpm lint` runs eslint on scripts/ in its
//   pre-push hook and in CI; the v1.11.1 copy failed it with 7 errors, so its sync PR could not be pushed). No behaviour
//   change: the control-character class is built from char codes (no-control-regex rejects \x00-\x1f in a regex
//   literal AND in a RegExp string) and five declaration initializers that every path overwrote before a read are
//   dropped (no-useless-assignment). test/devin-gate.test.mjs pins the source free of \x00-\x1f escapes.
// v1.11.1: a trusted bb-review FAILURE the status-list read has already seen outranks a stale combined pick.
//   Race (codex P1 on the guardrails-sync push, 2026-10-31): the combined read returns the older success, a
//   trusted failure lands before the list read; the two differ, so the slot went unverifiable/contested and
//   the deadline poll passed UNREVIEWED with the failure in hand. Gates fail closed: when _trustedBb is a
//   failure/error newer than the combined pick (status ids are monotonic), it is the verdict.
//   Round 7 (bb-review pre-push round 7 + Devin SEC "Status flooding hides failed reviews", CT #890): the same
//   seam, fail-closed at every exit. (a) STATUS FLOODING: a foreign bb-review on top with the real verdict beyond
//   the status-list page cap (_bbUnverifiable), or a combined bb-review the capped list never reached
//   (_listCapped + slot unverifiable), is a verdict that COULD NOT BE READ - the deadline FAILS it, never an
//   unreviewed pass; the list reader pages 10 deep (not 3) while the top bb-review is foreign and unverified.
//   (b) a DEADLINE list read that throws judges the LAST GOOD read's failures (provCache) instead of forgetting a
//   trusted failure seen inside the window; it never borrows a cached success. (c) a failed deadline read marks
//   every non-fail outcome unreviewed. (d) ids parse symmetrically (string first, then Number.isSafeInteger on
//   both). (e) clean() also strips @mentions, markdown links and HTML comment markers from status text.
//   Round 8 (bb-review pre-push round 8): the flooding rule closes its last two gaps and gets cheaper. (a) a
//   HIDDEN bb-review slot: the combined read is ONE page of latest-per-context statuses, so with 100+ contexts a
//   bb-review can be missing from it; when that read is FULL (100 entries, no bb-review) and the capped list read
//   never reached one either, the slot is hidden - the deadline FAILS it as flooding (a head whose combined read is
//   not full and holds no bb-review is an ordinary head: Devin alone decides, as before). (b) _listCapped means
//   only "the bb-review slot was still unresolved at the page cap": the reader takes a hint
//   ({expectBb}) when the combined read saw a bb-review or was full, pages to a trusted entry beyond page 3
//   instead of flagging it, and Devin alone unseen stays _truncated, never flooding. (c) the stale-failure fallback
//   at a failed deadline read stays fail-closed, and says "may be superseded" with the re-push recovery when the
//   combined read shows a newer id it could not attribute. (d) the DEEP (10-page) read runs on the first poll, then
//   at most once per 2 minutes, and always at the deadline; polls between read 3 pages ({deep}). (e) the synthetic
//   flooding failure carries none of the foreign success's identity (id null, no url, no timestamp). (f) clean()
//   strips doubled @@mentions and markdown links whose target holds parentheses.
//   Round 9 (bb-review pre-push round 9): (a) a SHALLOW (3-page) list read that leaves the bb-review slot unresolved
//   is not evidence of a hidden slot by itself (rounds 9-10 completed it from the cached deep read; round 11 replaced
//   that borrow with a same-poll deep read - see Round 11). (b) the flooding claim needs the page cap (_listCapped): _bbUnverifiable alone is a
//   contested slot (never honoured, never flooding). (c) clean() strips until stable, drops <...> runs (tags,
//   autolinks), removes URL schemes and breaks any surviving "](". (d) the deep-read cadence runs on the last deep
//   ATTEMPT, so a failing read is not retried 10 pages deep on every poll. (e) one stale failure is counted once.
//   Round 10 (bb-review pre-push round 10): (a) a shallow read keeps every bb-review failure it saw, the NEWEST entry
//   by ANY poster included (round-5 rule: any bb-review failure the list read sees blocks); nothing cached ever
//   overwrites it. (b) clean() also breaks a bare "www." host - GitHub autolinks it without a scheme.
//   Round 11 (bb-review pre-push round 11): (a) the deep-slot borrow is GONE. A shallow read that leaves the bb-review
//   slot unresolved (capped, or a foreign top with no trusted entry inside its 3 pages) never decides and is never
//   completed from a cached deep read: the borrow let a capped read that reached NO bb-review entry pass REVIEWED on a
//   cached success while a newer failure sat beyond page 3, and it cached _listCapped=false so a thrown deadline read
//   passed UNREVIEWED. Instead, when a pass is at stake (a Devin success in hand) the poll re-reads DEEP at once, at
//   most once per Devin verdict (provCache.upgradedKey; a cadence or first-poll deep read under the same verdict
//   already counts), and judges that read; otherwise the unresolved slot waits (hidden or
//   contested) for the cadence deep read or the deadline. (b) a thrown deadline read judges the last good read as
//   before; when that read was a shallow one that left the slot unresolved, a capped slot fails as flooding (gates
//   fail closed; the devin-gate sweep re-runs a failed gate) and the warning says so. (c) accepted limit, by design: a
//   legitimate head with 100+ contexts AND more than 1,000 statuses (the deep read's reach) and no bb-review is
//   indistinguishable from a flood by statuses alone and fails at the deadline (Devin SEC, CT #890: a flood must fail
//   closed); no BB repo has more than ~10 contexts, and a re-push starts a new head with an empty status list.
//   Round 12 (bb-review pre-push round 12): (a) the status-list cache is keyed on the expectBb HINT as well as the
//   Devin + bb-review fingerprint: a flood that fills the combined read (100+ contexts, no bb-review) after a hint-less
//   read was cached forces a re-read with the hint on the next poll (which caps -> hidden slot -> flooding at the
//   deadline), instead of the gate judging a pre-flood read for 3 more polls. (b) a thrown deadline read that falls
//   back on a stale read taken WITHOUT the hint, while the combined read is now full with no bb-review, treats the
//   slot as hidden (the stale read never looked for it) and fails as flooding - the flood may land between the last
//   poll and the deadline. (c) the deadline-read-failed warning follows the stale read's own flags (capped /
//   contested) whether it was a 3-page or a 10-page read, so a capped DEEP read that fails as flooding is never
//   described with the unreviewed-pass wording.
//   Round 13 (bb-review pre-push round 13, P1): the round-12 blind rule asked the wrong question. At a thrown deadline
//   read the slot may be hidden NOW (combined read full, no bb-review in it) whatever the stale read looked like - and
//   with NO stale read at all (every list read in the window threw, the likeliest shape of a flood: the 10-page read is
//   the call that times out) the rule did not fire and the gate passed unreviewed; a stale read taken WITH the hint
//   because a bb-review was in the combined read then (not full) passed the same way once the flood pushed that
//   bb-review out. Round 13 let a stale read taken while the combined read was ALREADY full (provCache.full) vouch.
//   Round 14 (bb-review pre-push round 14, P1 - the fourth round on this fallback, so the rule is rewritten once from
//   its case table, not patched): NO cached read vouches once the combined read is full with no bb-review in it. A
//   full combined read has a fixed fingerprint - a bb-review failure posted after the cached read can never surface
//   in it, the empty-slot hold reuses the cached read, and the deadline read (the one look that could find it) threw.
//   A cached success, a cached empty slot, a hint-less pre-flood read, no read at all: none of them is a look at the
//   slot as it is NOW. The rule: at a thrown deadline read, (1) a stale read holding bb-review failures is judged on
//   them; (2) a stale read that left the slot unresolved fails as flooding (capped) or is contested (foreign top);
//   (3) otherwise, a full combined read with no bb-review is a hidden slot -> listCapped -> fails as flooding;
//   (4) otherwise (an ordinary head, where a bb-review WOULD show in the combined read) the pass is unreviewed, with
//   the warning. provCache.full now only picks the warning's wording (which kind of blind read the fallback had).
//   Round 15 (bb-review pre-push round 15, P1): rule (3) was scoped to a combined read with NO bb-review, so a forged
//   bb-review success posted on top of the harness's real failure (shared token) switched it off: the combined read
//   showed the forgery, every list read threw, and the deadline ended as a contested unreviewed PASS. Now (3) also
//   covers a visible bb-review (not a failure) that no saved read matched - same id and state: that pick was never
//   attributed and a trusted failure may sit beneath it -> listCapped -> flooding fail. Only a saved read holding
//   exactly the pick the combined read shows now keeps the contested unreviewed pass (it looked at that pick).
//   Round 16 (bb-review pre-push round 16; Sam, 2026-10-31: "stop patching, re-evaluate"): rounds 11-15 each added a
//   rule to the thrown-deadline fallback and each rule left a new way for a failure to hide behind the pass path. The
//   fallback is now ONE rule with two outcomes. At a thrown deadline list read: (a) saved bb-review failures (the last
//   good read's) are judged, as before; (b) otherwise the slot had no last look -> deadlineBlind -> it FAILS as status
//   flooding, whatever the combined read shows (a bb-review top, a full page, an ordinary head) and whatever the saved
//   read held (a success, an empty slot, an unresolved slot, nothing). The ordinary-head exception (rule 4) and the
//   exact-match exception (round 15) are gone on purpose: both were a pass on a slot nobody looked at as it is NOW.
//   Cost: a transient 502 at 8:00 costs the 10 minutes until the devin-gate sweep re-runs the gate - never a false
//   pass. Likewise an API outage (the PR or combined read failing after its retries) no longer passes: inside the
//   window the poll goes on (the read may recover), at the deadline it FAILS - the sweep re-runs it once the API
//   answers, and recovery needs no re-push. slotBlind/staleUnresolved/sameId/staleMatched/pickUnmatched are removed.
// v1.11.0 (W3 reviewer provenance): two things.
//   SHA BINDING (already held, now stated and pinned by tests): every verdict input is read against the
//     LIVE head sha each poll - "Devin Review" and `bb-review` are commit statuses, and a commit status is
//     attached to exactly one sha, so a review posted on sha A can never appear in getStatuses(B). Review
//     THREADS are PR-scoped and only ever BLOCK (an unresolved red from an older head still fails the new
//     one); they never satisfy a pass by themselves.
//   PROVENANCE (new): a "Devin Review" status posted by anyone but Devin's own app (creator from the statuses
//     LIST - the combined endpoint omits it) no longer counts as a completed review. The shared GITHUB_TOKEN
//     can forge the context string; a forged "No Issues Found" used to earn a REVIEWED pass - it now degrades
//     to the same unreviewed pass as a Devin skip (never-stuck: a renamed app or an unreadable creator is a
//     label, never a wedge). The verdict now logs and returns a `provenance` record: implementer (PR author),
//     the exact head sha, each reviewer status's creator/id/created_at, the Devin review URL, thread and
//     blocking counts, and the commit each finding was found on (reviewThreads now carry originalCommit and
//     the review's databaseId/url). devin-gate.yml v1.9 passes REVIEW_COMMIT - the sha the triggering review
//     was submitted on - so the log can say when that differs from the head being judged.
// v1.10.4: comment-only touch-up alongside devin-gate.yml v1.8 (ubuntu-slim runner). No behaviour change.
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
// v1.10.2 (2026-10-09) - the SWEEP fails the job when a disarm leaves no record, as HOLD MODE does. A held PR disarmed by
//           the sweep whose record (settleDisarm) or lifted-meanwhile re-arm note (postLiftNote) could not be posted was
//           only logged: the PR sat held and unarmed with nothing for the lift check to find, so lifting the hold never
//           asked for the re-arm, and the job stayed green. Now each such PR is flagged (rearm: true) and, after every PR
//           is processed, runSweep throws one error naming them ("a re-arm may be needed"; err.sweepOut carries the
//           lines). The flag survives a later error on the same PR, and an error escaping the steps after a successful
//           mutation sets it too (bb-review first-push P2). A failed disarm MUTATION is re-read, as HOLD MODE does (Devin,
//           BB_Tools #273 - a lost response left the PR unarmed with no record, green): still armed -> retried next tick
//           (green); auto-merge off -> recorded like a disarm (an open record is reused); unreadable -> red.
//           Still one red run per loss: the next tick sees the PR unarmed and has no way to tell it from one never armed.
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
/** GitHub logins compare case-insensitively: a differently-cased casing of Devin's slug is still Devin. */
export const isDevinLogin = (l) => DEVIN_LOGINS.includes(String(l || '').toLowerCase());
/** v1.12.0 (W3): a reviewer status older than this many hours is stale evidence, not a current verdict. */
export const EVIDENCE_MAX_AGE_H_DEFAULT = 72;
export const UNRECORDED = 'unrecorded';
/**
 * The provider that WROTE a PR, from what the API gives us for free: the author login and the head branch.
 * Devin writes as the Devin app / on devin/ branches. agent/ branches are Claude or Codex (indistinguishable here),
 * so they are 'unknown' - recorded, and never grounds to reject a review. Pure.
 */
export function providerOf({ login, headRef } = {}) {
  if (isDevinLogin(login) || /^devin\//i.test(String(headRef || ''))) return 'devin';
  return 'unknown';
}
/** {provider, model, effort} of a reviewer status. Devin's status names none of model/effort; bb-review's carries none either. Pure. */
export function reviewerIdentity(kind, creator) {
  const forged = !isDevinLogin(creator); // an unknown poster counts as unverified too; a 'Devin Review' status posted by anyone else is not a Devin record
  return { provider: kind === 'devin' && !forged ? 'devin' : UNRECORDED, model: UNRECORDED, effort: UNRECORDED };
}
/** Hours between a status timestamp and now; null when the timestamp is missing or unparseable (judged as before). Pure. */
export function evidenceAgeH(at, nowMs) {
  const t = Date.parse(String(at || ''));
  if (!Number.isFinite(t) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, (nowMs - t) / 3600000);
}
/**
 * Secret shapes scanned in the ADDED lines of a diff before a review request goes out. Each entry is a kind and a
 * regex; the scan reports kind + file + line number only, NEVER the matched text. Pure.
 */
export const SECRET_PATTERNS = Object.freeze([
  ['private key block', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY(?: BLOCK)?-----/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['Anthropic/OpenAI style key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{16,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/],
  ['SendGrid key', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['database URL with password', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:(?!(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|%\([A-Za-z_]+\)s|\{\{[A-Za-z_][A-Za-z0-9_.]*\}\}|\$\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\})@)[^\s@/]{3,}@(?!(?:localhost|host|hostname|db|127\.\d+\.\d+\.\d+|\[::1\]|(?:[\w-]+\.)*example(?:\.(?:com|net|org))?)(?:[:/?\s]|$))/i],
  ['hard-coded secret assignment', /(?:api[_-]?key|secret|token|passw(?:or)?d|role[_-]?key|private[_-]?key)[A-Za-z0-9_-]{0,24}["']?(?:[ \t]*:[ \t]*[A-Za-z_][\w.<>[\]|, ]{0,40})?[ \t]*:?[:=]\s*[fbru]{0,2}["'`]{1,3}(?=[A-Za-z0-9+/_=.-]*[0-9])(?![A-Za-z0-9+/_=.-]*(?:(?<![A-Za-z0-9])(?:example|replace|your|placeholder|change|dummy|sample)(?![A-Za-z0-9])|xxxx))[A-Za-z0-9+/_=.-]{20,}(?<!\.(?:json|ya?ml|pem|txt|toml|ini|env|xml|key|crt|cer|js|ts|md))["'`]/i],
  // v1.12.4: UNQUOTED KEY=value (.env / shell / yaml): 24+ plain chars with a digit touching a letter (N32: a snake_case name ending _1 or a path value is not a secret), ending the token; a call (`x.y(`) is not matched; a dotted value (`MTk4.Cl2FM.ZnCj`, N48) is
  ['unquoted secret assignment', /(?:api[_-]?key|secret|token|passw(?:or)?d|role[_-]?key|private[_-]?key)[A-Za-z0-9_-]{0,24}["']?[ \t]*[:=][ \t]*(?!\/[\w.-]+\/[\w.-]+)(?=[A-Za-z0-9+/_=.-]*(?:[A-Za-z][0-9]|[0-9][A-Za-z]))(?![A-Za-z0-9+/_=.-]*(?:(?<![A-Za-z0-9])(?:example|replace|your|placeholder|change|dummy|sample)(?![A-Za-z0-9])|xxxx))[A-Za-z0-9+/_=.-]{24,}(?![A-Za-z0-9+/_=.(-]|\.[A-Za-z0-9_.-]*\()/i],
]);
/** patches = [{path, patch}] (GitHub's per-file unified diff). Returns [{kind, path, line}], in order. Only '+' lines count. Pure. */
export const SECRET_SCAN_SKIP_PATH_RE = /(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|\.(?:example|sample)$|\.(?:example|sample)\./i;
/** Paths where scanSecrets runs only the high-confidence kinds plus database URLs with passwords (SECRET_TEST_PATH_KINDS): returned so the caller can NAME them - a partial read is never silent. Pure. */
export const secretScanSkippedPaths = (patches) => (patches || []).filter((f) => f && SECRET_SCAN_SKIP_PATH_RE.test(String(f.path || ''))).map((f) => String(f.path));
/** Binary file types that hold credentials (keystores, certificates with keys, password vaults): a diff-less one is flagged unscanned, never read as clean. */
// Files that hold credentials: key containers, AND text config/secret files (a UTF-16 .env or a .gitattributes `binary` file reaches GitHub with no patch and 0 changes, so it must not read as clean).
export const BINARY_SECRET_EXT_RE = /\.(?:p12|pfx|jks|keystore|kdbx|der|p8|pk8|bks|ppk|gpg|pem|key|env|ini|cfg|conf|properties|json|ya?ml|toml|sh|ps1|txt|npmrc|netrc|tfvars|xml)$|(?:^|\/)(?:\.(?:env|npmrc|netrc)[^/]*|id_(?:rsa|dsa|ecdsa|ed25519))$/i;
/** Binary types that cannot hold a pasted credential: the only diff-less files read as clean (images, fonts, archives, media, pdf). */
export const HARMLESS_BINARY_EXT_RE = /\.(?:png|jpe?g|gif|webp|ico|bmp|tiff?|svg|woff2?|ttf|otf|eot|pdf|zip|gz|tgz|bz2|xz|7z|mp[34]|mov|webm|wav|ogg)$/i;
/** A file GitHub gave no diff for that could still hold a secret: not a deletion, not a pure rename or mode change (changes 0), and either it had changed lines (too large to diff) or it is not a known harmless binary type (UTF-16 text, extensionless or dotfile secrets). */
export const fileUnscanned = (f) => {
  if (!f || typeof f.patch === 'string') return false;
  if (f.status === 'removed') return false;
  if ((f.status === 'renamed' || f.status === 'changed') && !(Number(f.changes) > 0)) return false;
  return Number(f.changes) > 0 || !HARMLESS_BINARY_EXT_RE.test(String(f.filename || '')); // fail closed: only a known harmless binary type reads as clean
};
/** Key containers and secret files: a diff-less one withholds the review request (so does every other diff-less file now, see holdsRequest). */
export const SECRET_CONTAINER_RE = /\.(?:p12|pfx|jks|keystore|kdbx|der|p8|pk8|bks|ppk|gpg|pem|key)$|(?:^|\/)(?:\.(?:env|npmrc|netrc)[^/]*|id_(?:rsa|dsa|ecdsa|ed25519))$/i;
/** RAW path (never the display-cleaned one, which truncates): any diff-less (unscanned) entry withholds the request, the placeholders for unlisted or unpinned files included; lockfiles too (a registry token can sit in a resolved URL). */
export const holdsRequest = () => true; // every other diff-less file (any name, any size) may hold a live key: withhold
export const SECRET_ALLOW_MARK = 'devin-gate:allow-secret';
/** Kinds that are near-certain real credentials: these are scanned even inside test/fixture/example paths. */
export const SECRET_HIGH_CONFIDENCE_KINDS = Object.freeze(['private key block', 'AWS access key id', 'GitHub token', 'Anthropic/OpenAI style key', 'Slack token', 'Stripe live key', 'SendGrid key']);
/** A key-body line once a key block is open: strip quotes, escaped newlines, `+`, commas and spaces; 20+ base64 chars with nothing else is body (quoted, concatenated or rewrapped bodies included). Pure. */
const isKeyBodyLine = (raw) => /^[A-Za-z0-9+/=]{20,}$/.test(String(raw).replace(/^\+/, '').replace(/\\[nrt]/g, '').replace(/["'`,;]/g, '').replace(/^\s*\+?\s*/, '').replace(/\s*\+?\s*$/, '')); // inner whitespace stays, so prose never collapses into a "body"
function* addedLines(patches) {
  let pi = -1; // v1.12.5: the index of the patch (one file in one commit) a row came from - keyBodyFollows never joins rows of two patches
  for (const f of patches || []) {
    pi++;
    if (!f || typeof f.patch !== 'string') continue;
    const path = String(f.path || '?'); const skipPath = SECRET_SCAN_SKIP_PATH_RE.test(path); const markOk = skipPath;
    let ln = 0; let hunk = 0; let inKey = false; let keyLn = -1; let addHdr = -1; let addHdrHunk = -1; // inKey: an UNCHANGED (context) key header opened a block, so added base64 lines until its END are a swapped key body
    for (const raw of f.patch.split('\n')) {
      const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
      if (h) { ln = Number(h[1]) - 1; hunk++; continue; }
      if (raw.startsWith('-') || raw.startsWith('\\')) continue;
      ln++;
      const isAdd = raw.startsWith('+');
      if (!isAdd && /-----BEGIN [^-]*PRIVATE KEY(?: BLOCK)?-----/.test(raw)) { inKey = true; keyLn = ln; addHdr = -1; } // also in test/fixture paths and across hunks (Devin red: a swapped key body must not slip through), but only within KEY_SPAN lines
      else if (/-----END [^-]*PRIVATE KEY(?: BLOCK)?-----/.test(raw)) { inKey = false; addHdr = -1; }
      else if (isAdd && /-----BEGIN [^-]*PRIVATE KEY(?: BLOCK)?-----/.test(raw)) { inKey = false; addHdr = ln; addHdrHunk = hunk; } // an added header is judged as itself (with its mark rules); a swapped body under it, in a later hunk of the same file, is still its body
      if (isAdd) yield { raw, path, pi, line: ln, hunk, skipPath, markOk, history: f.history === true, cmpOnly: f.cmpOnly === true, keyBody: ((inKey && ln - keyLn <= KEY_SPAN) || (addHdr >= 0 && hunk !== addHdrHunk && ln - addHdr <= KEY_SPAN)) && isKeyBodyLine(raw) };
    }
  }
}
const KEY_SPAN = 80; // lines: a PEM key body (even RSA-8192) ends well inside this, a base64 line farther away is unrelated
/** A documented sample, not a credential: ends in EXAMPLE (AWS's AKIAIOSFODNN7EXAMPLE) or the part after the prefix is one repeated character (ghp_xxxx...). */
const isSampleValue = (m) => /EXAMPLE$/i.test(m) || /(?:^|[^A-Za-z0-9])(?:your|placeholder|redacted|changeme|replace|token-?here|key-?here|dummy|fake|sample)(?:[^A-Za-z0-9]|$)/i.test(m) || m === 'ghp_' + '16C7e42F292c6912E7710c838347Ae178B4a' || /^[A-Za-z]{2,4}[_-]?(?:ant-)?(.)\1{15,}$/i.test(m);
/** v1.12.1: kinds scanned inside test/fixture/example paths: the high-confidence ones PLUS a database URL with a password (its pattern already exempts localhost, example and placeholder hosts, so only a real-looking host reaches here; Devin SEC_: tests/ must not hide a prod credential). The noisy hard-coded-assignment kind stays skipped there. */
export const SECRET_TEST_PATH_KINDS = Object.freeze([...SECRET_HIGH_CONFIDENCE_KINDS, 'database URL with password']);
/** v1.12.1: in test/fixture/example paths ONLY, a database URL is exempt when EVERY host in its (comma-separated) host list is a local, service-container or exact placeholder name. Elsewhere the pattern's own exemption list is unchanged. */
const TEST_PATH_OK_HOST_RE = /^(?:localhost|host|hostname|db|database|postgres(?:ql)?|mysql|mariadb|mongo(?:db)?|0\.0\.0\.0|your[-_](?:db|database|host|server)(?:[-_]host)?|yourhost|127\.\d+\.\d+\.\d+|\[::1\]|host\.docker\.internal|(?:[\w-]+\.)*localhost|(?:[\w-]+\.)*example(?:\.(?:com|net|org))?)$/i;
const testPathDbUrlIsLocal = (raw, m) => { const hosts = (/^[^\s/?"'`)]*/.exec(raw.slice(m.index + m[0].length)) || [''])[0].split(/[,;]/).filter(Boolean); return hosts.length > 0 && hosts.every((h) => TEST_PATH_OK_HOST_RE.test(h.replace(/:\d*$/, ''))); };
/** v1.12.1, EVERY path: the base pattern exempts a local/service host, so a URL like `@db/app?host=real` or `@localhost:27017,real-host` never reaches testPathDbUrlIsLocal. This catches those two shapes: a host=/hostaddr= query override, or a host list holding a host that is not local/service/placeholder. */
const TEST_PATH_DB_URL_RE = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:(?!(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|%\([A-Za-z_]+\)s|\{\{[A-Za-z_][A-Za-z0-9_.]*\}\}|\$\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\})@)[^\s@/]{3,}@([^\s/?"'`)]*)([^\s"'`)]*)/gi;
const testPathDbUrlOverride = (raw) => { for (const m of raw.matchAll(TEST_PATH_DB_URL_RE)) { for (const q of m[2].matchAll(/[?&]host(?:addr)?=([^&#]*)/gi)) { let dec; try { dec = decodeURIComponent(q[1].replace(/%(?![0-9a-f]{2})/gi, '%25')); } catch { return true; } /* invalid %XX: cannot prove it local, so flag it by name instead of throwing */ const vals = dec.split(/[,;]/).filter(Boolean); if (!vals.length || !vals.every((h) => TEST_PATH_OK_HOST_RE.test(h.replace(/:\d*$/, '')))) return true; } const hosts = m[1].split(/[,;]/).filter(Boolean); if (hosts.length > 1 && !hosts.every((h) => TEST_PATH_OK_HOST_RE.test(h.replace(/:\d*$/, '')))) return true; } return false; };
const VENDOR_SAMPLE = 'ghp_' + '16C7e42F292c6912E7710c838347Ae178B4a';
/** The vendor docs sample is exempt only when the matched VALUE is exactly the sample (a longer value, or a DB URL, that merely contains it is judged normally). */
const vendorSampleValue = (kind, m) => { if (kind === 'database URL with password') return false; const v = kind === 'GitHub token' ? m : m.replace(/^[^:=]*[:=]\s*["']?/, '').replace(/["']$/, ''); return v === VENDOR_SAMPLE; };
/** EVERY secret kind on the line (not just the first), so a mark that clears one kind cannot hide another. */
/** N33: the unquoted KEY=value kind skips SOURCE-CODE files only (in code `token: some_identifier1` is a name, not a secret; the quoted kind still covers code). Every other path - .npmrc, .envrc, Dockerfile, .bat/.cmd/.ps1, yaml, json, unknown - is read. */
/** N35: only files a shell / compose / CI runner expands `$VAR` in; JSON, TOML, .properties, .ini, XML, .env (dotenv) keep the `$` as part of a real password. */
const VAR_EXPAND_PATH_RE = /(?:\.(?:sh|bash|zsh|ya?ml|ps1|mk)|(?:^|\/)(?:Dockerfile[^/]*|Makefile|docker-compose[^/]*))$/i;
const CODE_PATH_RE = /\.(?:m?[jt]sx?|cjs|cts|py|rb|go|java|kt|cs|php|rs|swift|scala|c|cc|cpp|h|hpp|vue|svelte|dart|lua|pl)$/i;
/** N46: an env-style assignment (`STRIPE_WEBHOOK_SECRET=value`: ALL-CAPS key, `=` with no spaces) is read even in a code file (an embedded .env in a template literal or a docstring); a code identifier is `token: x` or `const x = y`. Pure. */
const envStyleKey = (raw, m) => { const pre = (/[A-Za-z0-9_]*$/.exec(raw.slice(0, m.index)) || [''])[0]; const kw = /^[A-Za-z0-9_-]+/.exec(m[0]); return !!kw && /^[A-Z0-9_-]+$/.test(pre + kw[0]) && /^[A-Za-z0-9_-]+["']?[ \t]*=/.test(m[0]); }; // N46/N54: the whole ALL-CAPS name (digits allowed, `STRIPE_SECRET_2`) with `=` (spaces around it allowed, dotenv accepts them)
/** v1.12.5: a key such as secretName, existingSecret or a Ref-suffixed key; the KEY names a Kubernetes/Helm object and the VALUE is a lowercase hyphenated object name (needs a hyphen), never a credential. A mixed-case or hyphen-less value, or a plain `secret:` key, still hits. Pure. */
const K8S_NAME_KEY_RE = /(?:secretname|tokenname|existingsecret|(?:secret|token|password|credentials?)ref)$/i; // round 3: bare `ref` dropped (any key ending ref), and only YAML paths (see k8sRefName)
const K8S_RESOURCE_WORDS = new Set(['secret', 'secrets', 'credential', 'credentials', 'creds', 'tls', 'cert', 'certs', 'certificate', 'auth', 'token', 'tokens', 'apikey', 'webhook', 'smtp', 'ldap', 'dsn', 'signing', 'postgres', 'postgresql', 'mysql', 'mariadb', 'redis', 'mongodb', 'rabbitmq', 'oauth', 'registry', 'jwt', 'ssh', 'sealed']);
const k8sRefName = (raw, m, path) => {
  if (path === undefined || !/\.ya?ml$/i.test(String(path))) return false; // round 3: Kubernetes/Helm names live in YAML; code and .env keep the full read
  const kw = /^[A-Za-z0-9_-]+/.exec(m[0]); const val = /([A-Za-z0-9+/_=.-]+)["'`]?$/.exec(m[0]);
  if (!kw || !val) return false;
  // round 5 (bb-review P2): the match must be ONE plain `key: value` pair (an optional quote around the key, then the separator, then the value); a type-annotation tail such as `, password` inside the match means a second key was swallowed, so the exemption must not apply.
  if (!/^["']?[ \t]*[:=]\s*[fbru]{0,2}["'`]{0,3}[A-Za-z0-9+/_=.-]+["'`]?$/i.test(m[0].slice(kw[0].length))) return false;
  const key = (/[A-Za-z0-9_-]*$/.exec(raw.slice(0, m.index)) || [''])[0] + kw[0];
  // round 2 (Devin SEC_ + bb-review P3): a lowercase hyphenated value is also the shape of a UUID key or a passphrase, so the VALUE must read as an object name: at most 5 segments, no UUID shape, and one segment is a resource word (secret, credentials, tls ...). A bare passphrase or UUID under a Ref/Name key is a hit. Residual: a passphrase containing a resource word (limit L3).
  return K8S_NAME_KEY_RE.test(key) && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(val[1]) && val[1].split('-').length <= 5 && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(val[1]) && val[1].split('-').some((w) => K8S_RESOURCE_WORDS.has(w)) && val[1].split('-').every((w) => /^(?:(?:\d{1,2})?[a-z]{1,14}\d{0,4}|v?\d{1,8}|k8s|m2m|b2b|e2e|oauth2)$/.test(w)); // round 8 (Devin + bb-review P2): a short word may carry up to 2 leading and 4 trailing digits (2fa, prod2024); a version or date is up to 8 digits; round 6 (bb-review P2): every part is a short word (letters, at most 2 trailing digits) or a short version number, so a random token after a resource word (k3j9x8f2h1q7-secret) is a hit
};
const allKinds = (raw, skipPath, path) => {
  const kinds = [];
  for (const [kind, re] of SECRET_PATTERNS) {
    if (skipPath && !SECRET_TEST_PATH_KINDS.includes(kind)) continue;
    const codeUnquoted = kind === 'unquoted secret assignment' && path !== undefined && CODE_PATH_RE.test(String(path)); // N33: in code only a URL query parameter (`?api_key=...`, `&token=...`) is read, anything else unquoted is a name
    const all = new RegExp(re.source, re.flags.replace('g', '') + 'g');
    for (const m of raw.matchAll(all)) {
      if (codeUnquoted && !/[?&][\w.-]*$/.test(raw.slice(0, m.index)) && !envStyleKey(raw, m)) continue; // the key name may carry a prefix (`?access_token=`)
      if (kind === 'database URL with password' && (path === undefined || VAR_EXPAND_PATH_RE.test(String(path))) && /^\w+(?:\+\w+)?:\/\/[^\s:@/]+:\$[A-Z_]+(?:_[0-9]+)?@/.test(m[0])) continue; // N35: a bare UPPERCASE shell variable is a template (case-sensitive here: the pattern carries /i, so it cannot be told apart in the regex); $uperS3cret still hits
      if (skipPath && kind === 'database URL with password' && testPathDbUrlIsLocal(raw, m)) continue; // test paths: local / service / placeholder hosts only
      if ((kind === 'unquoted secret assignment' || kind === 'hard-coded secret assignment') && k8sRefName(raw, m, path)) continue; // v1.12.5: a Kubernetes/Helm reference NAME is not a secret
      if ((SECRET_HIGH_CONFIDENCE_KINDS.includes(kind) && isSampleValue(m[0])) || vendorSampleValue(kind, m[0])) continue; // v1.12.4: the vendor docs sample is exempt under every kind (an assignment pattern matches it too) // never stuck on a documented sample key; but check every match on the line
      kinds.push(kind); break;
    }
  }
  if (!kinds.includes('database URL with password') && testPathDbUrlOverride(raw)) kinds.push('database URL with password');
  return kinds;
};
/** True when the line has a database URL and EVERY such host is a single-label name (no dot): a docker service or placeholder, never a real server or IP. */
const DB_HOST_RE = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:(?!(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|%\([A-Za-z_]+\)s|\{\{[A-Za-z_][A-Za-z0-9_.]*\}\}|\$\{\{[A-Za-z_][A-Za-z0-9_.-]*\}\})@)[^\s@/]{3,}@([^\s"'`)]*)/gi;
const DB_MARK_TAIL_RE = /^[A-Za-z][A-Za-z0-9_-]*(?::[0-9]{1,5})?(?:\/[A-Za-z0-9_-]*)?(?:\?(?:(?!host|socket|service)[A-Za-z_]+=[A-Za-z0-9_-]*(?:&|$))*)?$/i; /* allowlist: a dot, comma, IPv6, %-escape, numeric host, second URL or host=/socket= can never match */
const dbMarkable = (raw) => { let any = false; for (const m of raw.matchAll(DB_HOST_RE)) { any = true; const end = m.index + m[0].length; if (/["'`)]/.test(raw.charAt(end)) && !/^["'`)]+[\s;,}\]]*(?:\/\/|#|\/\*(?:(?!\*\/).)*(?:\*\/\s*)?$|$)/.test(raw.slice(end))) return false; if (!DB_MARK_TAIL_RE.test(m[1].replace(/[;,]+$/, '')) || /^[0-9]+(?::|\/|$)/.test(m[1])) return false; } return any; };
/** May the allow mark clear this kind here? Never a high-confidence kind in any path (except a bare private-key header); a database URL with a password only when dbMarkable(raw) (single-label hosts); other noisy kinds anywhere. */
const markClears = (kind, skipPath, bodyFollows, raw) => kind === 'private key block' ? !bodyFollows : SECRET_HIGH_CONFIDENCE_KINDS.includes(kind) ? false : kind === 'database URL with password' ? dbMarkable(raw) : true;
/** Does a base64 key body sit on this line (after the header) or on the next added line of the same file? A marked header with a body is a real key. */
const B64_RUN_RE = /[A-Za-z0-9+/]{40,}/;
const keyBodyFollows = (ls, i) => { const l = ls[i]; const after = l.raw.split(/-----BEGIN [^-]*-----/)[1] || ''; if (B64_RUN_RE.test(after)) return true; for (let j = i + 1; j <= i + KEY_SPAN; j++) { const nx = ls[j]; if (!nx || nx.pi !== l.pi || nx.path !== l.path || nx.hunk !== l.hunk || nx.line - l.line > KEY_SPAN) break; if (B64_RUN_RE.test(nx.raw) || isKeyBodyLine(nx.raw)) return true; if (/-----END /.test(nx.raw)) break; } return false; }; // up to 8 added lines ahead in the same file: a comment or blank line between header and body does not hide it
/** v1.12.5: a line with the allow mark removed and a trailing comment opener/closer and spaces dropped, so the marked copy and the unmarked earlier copy compare equal. Pure. */
const markNorm = (raw) => String(raw).split(SECRET_ALLOW_MARK).join('').replace(/\s*(?:\/\/|#|--|\/\*|<!--)\s*$/, '').replace(/\s*(?:\*\/|-->)\s*$/, '').replace(/\s*(?:\/\/|#|--|\/\*|<!--)\s*$/, '').trim(); // round 8 (bb-review P3): whitespace INSIDE the line is kept, so a mark never clears a different value
/** v1.12.5: the pushed (net) lines whose allow mark may clear the same line in an earlier commit (path + normalized text). Pure. */
const netMarkSet = (ls) => new Set(ls.filter((l, i) => { if (l.history || !l.raw.includes(SECRET_ALLOW_MARK)) return false; const ks = allKinds(l.raw, l.skipPath, l.path); const body = ks.includes('private key block') && keyBodyFollows(ls, i); return ks.length > 0 && ks.every((k) => markClears(k, l.markOk, body, l.raw)); }).map((l) => l.path + LF + markNorm(l.raw)));
/** Returns [{kind, path, line}] for ADDED lines. Test/fixture/example paths only get SECRET_TEST_PATH_KINDS (high-confidence + database URL with password); a line carrying the allow mark is not a hit unless the mark may clear its kind: never a high-confidence kind, a database URL only when dbMarkable (see markClears, scanAllowedMarks). Pure. */
export function scanSecrets(patches) {
  const hits = [];
  const ls = [...addedLines(patches)];
  // v1.12.5: an allow mark on a PUSHED (net) line also clears the same line (same path, same text apart from the mark) in an EARLIER commit; only net rows are sources, and markClears still refuses high-confidence kinds
  // round 3: a pushed line is a source ONLY when scanAllowedMarks would list it (secret-shaped, every kind clearable), so a clearing mark is always named and the pass unreviewed
  const netMarks = netMarkSet(ls);
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    if (l.keyBody) { hits.push({ kind: 'private key block', path: l.path, line: l.line, history: l.history === true, cmp: l.cmpOnly === true }); continue; } // body of a key whose header line did not change: no mark can be on it
    let kinds = allKinds(l.raw, l.skipPath, l.path);
    // v1.12.4: an earlier commit's line is judged on EVERY kind, exactly like the net diff (history hit on any kind = hold); only a mark already ON the pushed line can clear it
    if (!kinds.length) continue;
    // the mark clears a line only when EVERY kind on it is clearable (a bare BEGIN header is not the key; a database URL only for ONE single-label host, dbMarkable; never a high-confidence kind); the line is named + the pass unreviewed
    const marked = l.raw.includes(SECRET_ALLOW_MARK) || (l.history && netMarks.has(l.path + LF + markNorm(l.raw)));
    const body = marked && kinds.includes('private key block') && keyBodyFollows(ls, i);
    const left = marked ? kinds.filter((k) => !markClears(k, l.markOk, body, l.raw)) : kinds;
    if (left.length) hits.push({ kind: left[0], path: l.path, line: l.line, history: l.history === true, cmp: l.cmpOnly === true });
  }
  return hits;
}
/** Allow-marked added lines that WOULD have been hits: the gate names each one and downgrades the pass to unreviewed, so a person sees every declared fake. Pure. */
export function scanAllowedMarks(patches) {
  const out = [];
  const ls = [...addedLines(patches)];
  const netMarks = netMarkSet(ls); // bb-review P3: an earlier commit's copy that a pushed mark clears is named too ([earlier commit])
  for (let i = 0; i < ls.length; i++) { const l = ls[i]; if (!l.raw.includes(SECRET_ALLOW_MARK) && !(l.history && netMarks.has(l.path + LF + markNorm(l.raw)))) continue; const ks = allKinds(l.raw, l.skipPath, l.path); const body = ks.includes('private key block') && keyBodyFollows(ls, i); if (ks.length && ks.every((k) => markClears(k, l.markOk, body, l.raw))) out.push({ path: l.path, line: l.line, history: l.history === true }); }
  return out;
}
/**
 * Who may post a `bb-review` verdict: the local pre-push reviewer (Sam's token) or CI itself. The combined
 * read shows only the LATEST status per context, so a foreign "success" can sit on top of a real failure;
 * getStatusDetails therefore also returns the newest entry by a TRUSTED poster, and the gate judges that
 * entry instead of whatever a foreign actor put on top (bb-review P2 x2).
 */
export const BB_REVIEW_LOGINS = Object.freeze(['samjonaidi-ship-it']); // bb-review.mjs posts via gh api under this login only; github-actions[bot] IS the shared-token forger
export const isBbReviewPoster = (l) => BB_REVIEW_LOGINS.includes(String(l || '').toLowerCase());
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
const HISTORY_MAX_COMMITS = 50; // per-commit history reads per gate run (API allowance)
const LF = String.fromCharCode(10); // key separator for the per-commit duplicate check

/** HTTP status only ('read error' if none): the error text of a read that carries patches can echo a credential. */
const errStatus = (e) => /-> ([45]\d\d)\b/.exec(String(e && e.message))?.[1] || /^([45]\d\d)\b/.exec(String(e && e.message))?.[1] || 'read error';
const errLine = (e) => String(e?.message || e).split(/\r?\n/)[0];
// v1.11.2: control characters U+0000-U+001F as a regex-class range built from char codes (DEL \x7f is not one and
// stays literal). An escaped \x00-\x1f fails eslint no-control-regex in a literal AND in a RegExp string, and
// universal-auth lints scripts/ - so the class is assembled at load time. Same characters, same replacement.
const CTRL_RANGE = `${String.fromCharCode(0)}-${String.fromCharCode(31)}`;
const CTRL_RE = new RegExp(`[\`${CTRL_RANGE}\x7f]`, 'g');
const MD_CTRL_RE = new RegExp(`[\`${CTRL_RANGE}\x7f()!<>|]`, 'g');

/**
 * A status's description/creator/target_url are attacker-influenceable (a forged status controls them), and
 * every reason/provenance string is printed raw to the job log and the step summary: strip control chars,
 * newlines and backticks so a field can never start a `::command::` line or break a code span (bb-review P2).
 */
// Round-7 P3: a foreign poster's failure is honoured as a block, so its description reaches the PR's failure reason -
// a markdown link keeps only its text, an @mention loses its '@' (no notification, no link) and HTML comment
// markers go (a planted gate marker must never read as the gate's own).
const clean = (v) => {
  let s = String(v ?? '');
  // Round-9 P2: one pass left a nested link alive ([[x](y)](http://evil) -> [x](http://evil)), and autolinks
  // (<https://evil>), raw HTML and bare URLs went through untouched - the reason is rendered as markdown in the step
  // summary. Strip until the text stops changing (bounded), drop every <...> run (tags, autolinks, comment markers),
  // then neutralize what is left: no URL scheme or bare "www." host survives and no "](" pair can form a link.
  for (let i = 0, prev; i < 10 && prev !== s; i++) {
    prev = s;
    s = s
      // Round-8 P3: a link target may itself hold one level of parentheses (wiki-style URLs): the whole target goes.
      .replace(/\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1')
      .replace(/<!--|-->/g, ' ')
      .replace(/<[^<>]*>/g, ' ')
      // Round-8 P3: '@@name' used to keep one '@' and still ping; every run of '@' goes.
      .replace(/(^|[^\w])@+([\w-]+)/g, '$1$2');
  }
  return s
    .replace(/\b(?:https?|ftp):\/\//gi, '')
    // Round-10 P3: GitHub autolinks a bare "www." host without a scheme - break it too.
    .replace(/\bwww\./gi, 'www ')
    .replace(/\]\(/g, '] (')
    .replace(CTRL_RE, ' ').slice(0, 300);
};
// A field that IS a url (a thread url, a review url, a status target_url) keeps a well-formed https url and
// nothing else: one token, https only, url characters only (no whitespace, quotes, brackets, backticks or
// angle brackets), bounded. Anything else renders as an empty url - never as text that could carry markup.
const cleanUrl = (v) => {
  const u = String(v ?? '').trim();
  return /^https:\/\/[\w.~:/?#@!$&*+,;=%()-]{1,290}$/.test(u) ? u : '';
};
// A status id is a finite number or a decimal-digit string; anything else (missing, blank, hex, boolean) is null.
// Ids compare as numbers everywhere (the list-entry match and the override): a combined 50 and a list "50" are
// the same status, and "10" is newer than "9" (bb-review round-3 P3, round-5 P3).
// Only SAFE integers parse (round-6 P3): a digit string above 2^53 would lose its last digits in Number(), so two
// distinct ids could compare equal. Both forms take the SAME test (round-7 P3): a digit string is parsed first,
// then Number.isSafeInteger decides for string and number alike - a 16-digit safe id attributes whichever read
// carries it as a string. Anything else is null (= unparseable, fail closed).
const idNum = (v) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^[0-9]+$/.test(v.trim()) ? Number(v.trim()) : NaN);
  return Number.isSafeInteger(n) ? n : null;
};
const isFailState = (e) => !!e && /^(failure|error)$/i.test(e.state || '');
const lowerState = (v) => String(v || '').toLowerCase();
export const nudgeMarker = (sha) => `<!-- devin-gate nudge ${sha} -->`;

/** Has a nudge for THIS sha already been posted? `comments` = [{body}]. Pure. */
export function hasNudge(comments, sha) {
  const m = nudgeMarker(sha);
  return (comments || []).some((c) => typeof c?.body === 'string' && c.body.includes(m));
}

/**
 * Marker left when the sweep re-runs a stale-green gate: repeat corrections are detected exactly, not guessed.
 * `ev` = the evidence the correction fired on (sweepEvidence): a marker suppresses only a repeat on the SAME
 * evidence, so a NEW bb-review failure on unchanged threads is a first correction, not a cooldown repeat
 * (BB_Tools #216). Omitted = a pre-#216 marker, which matches on the thread fingerprint alone.
 */
export const sweepCorrectedMarker = (runId, atIso, fp, ev) => `<!-- devin-gate sweep-corrected run=${runId} at=${atIso} fp=${fp || 'none'}${ev ? ` ev=${ev}` : ''} -->`;

/**
 * The evidence that made a green gate stale, as one token. A failed bb-review is keyed by its status id (each
 * POST is a new id; created_at when the id is absent), so a later failure is new evidence even when the thread
 * state never moved. Otherwise the threads are the evidence and the fingerprint already keys them. Pure.
 */
export function sweepEvidence(bbReview) {
  if (!bbReview || !/^(failure|error)$/i.test(bbReview.state || '')) return 'threads';
  return `bb:${String(bbReview.id ?? bbReview.created_at ?? bbReview.updated_at ?? 'unknown').replace(/\s+/g, '')}`;
}

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
    .filter((t) => t && isDevinLogin(t.author))
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
    const m = body.match(/devin-gate sweep-corrected run=(\d+) at=(\S+?)(?: fp=(\S+?))?(?: ev=(\S+?))? -->/);
    if (m && Number(m[1]) === runId) {
      const t = Date.parse(m[2]);
      if (Number.isFinite(t) && (!newest || t > newest.at)) newest = { at: t, fp: m[3] || 'none', ...(m[4] ? { ev: m[4] } : {}) };
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
    .filter((t) => t && isDevinLogin(t.author) && !t.isResolved && !t.isOutdated)
    .filter(isRedThread)
    .map((t) => {
      const lines = String(t.body || '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
      const line = lines.find((l) => /🔴/u.test(l)) || lines.find((l) => l.trim()) || '(untitled finding)';
      // v1.11.0: `sha` is the commit the finding was posted on (originalCommit) - provenance only.
      return { path: t.path || '?', line: t.line ?? null, url: t.url || '', title: line.replace(/\*\*/g, '').replace(/🔴/gu, '').trim().slice(0, 140), sha: t.commit || null, reviewId: t.reviewId ?? null, reviewUrl: t.reviewUrl || '' };
    });
}

/** STRICT mode: every unresolved, non-outdated Devin thread, any severity. Same output shape as redFindings. Pure. */
export function openDevinThreads(threads) {
  return (threads || [])
    .filter((t) => t && isDevinLogin(t.author) && !t.isResolved && !t.isOutdated)
    .map((t) => {
      const lines = String(t.body || '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
      const line = lines.find((l) => l.trim()) || '(untitled finding)';
      return { path: t.path || '?', line: t.line ?? null, url: t.url || '', title: line.replace(/\*\*/g, '').trim().slice(0, 140), sha: t.commit || null, reviewId: t.reviewId ?? null, reviewUrl: t.reviewUrl || '' };
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
export function decide({ devin, bbReview, threads, elapsedMin = 0, nudged = false, nudgeMin = NUDGE_MIN_DEFAULT, maxMin = MAX_MIN_DEFAULT, strict = false, fastPass = false, implementer = '', headRef = '', nowMs = NaN, maxAgeH = EVIDENCE_MAX_AGE_H_DEFAULT }) {
  let dv = devinVerdict({ devin, threads, elapsedMin, nudged, nudgeMin, maxMin, strict, implementer, headRef, nowMs, maxAgeH });
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
    const bb = `bb-review status is ${clean(bbReview.state)} on this head${bbReview.description ? ` (${clean(bbReview.description)})` : ''}`;
    const unreviewed = dv.action === 'wait' ? true : dv.action === 'fail' ? false : !!dv.unreviewed;
    const out = { action: 'fail', unreviewed, reason: `${bb}; Devin: ${dv.reason}` };
    if (dv.findings) out.findings = dv.findings;
    return out;
  }
  return dv;
}

/** The Devin side of the verdict alone (no bb-review). Pure. */
function devinVerdict({ devin, threads, elapsedMin, nudged, nudgeMin, maxMin, strict = false, implementer = '', headRef = '', nowMs = NaN, maxAgeH = EVIDENCE_MAX_AGE_H_DEFAULT }) {
  if (!devin) {
    if (elapsedMin >= maxMin) return { action: 'pass', unreviewed: true, reason: `No "${STATUS_CONTEXT}" status appeared within ${maxMin} min - passing WITHOUT a Devin review` };
    return { action: 'wait', nudge: elapsedMin >= nudgeMin && !nudged, reason: `no "${STATUS_CONTEXT}" status on this head yet (${elapsedMin.toFixed(1)} min)` };
  }
  const desc = clean(devin.description || '');
  const state = clean(devin.state || '');
  // v1.11.0 provenance: only a status posted by Devin's own app counts as Devin's verdict - the context string
  // alone is forgeable with the shared GITHUB_TOKEN. `creator` comes from the statuses LIST (the combined read
  // omits it); an io that cannot supply it leaves the field undefined and the old behaviour stands. A status
  // PROVABLY not Devin's is not a completed review - never-stuck: it passes unreviewed with the label, whatever
  // state or description it carries (a forged "pending" must not stall the window either).
  if (devin.creator !== undefined && !isDevinLogin(devin.creator)) {
    const who = devin.creator ? `posted by ${clean(devin.creator)}` : 'posted under an unnamed account';
    return { action: 'pass', unreviewed: true, reason: `the "${STATUS_CONTEXT}" status on this head ("${desc || state}") was ${who}, not by Devin - not a completed review; passing WITHOUT a Devin review` };
  }
  // The enrichment READ failed or named a different entry: the creator is unknown, not merely absent on a
  // legacy io. That is not evidence either way - whatever state or description the status carries - so the
  // run KEEPS WAITING: the next poll's read may attribute it, or the real verdict may arrive. Only at the
  // deadline does it pass unreviewed (bb-review P2: an early "skipped"-style pass would merge a PR before
  // the real Devin was ever asked).
  if (devin.unverifiable) {
    // An open red finding the gate already read still fails NOW: an unattributable status must never buy
    // the window to sit on a blocking verdict (bb-review P3).
    const f = Array.isArray(threads) ? blockingFindings(threads, { strict }) : [];
    if (f.length) return { action: 'fail', findings: f, reason: `${f.length} unresolved red finding(s) - the "${STATUS_CONTEXT}" status is unattributable, but the finding blocks regardless` };
    if (elapsedMin >= maxMin) return { action: 'pass', unreviewed: true, reason: `the "${STATUS_CONTEXT}" status on this head ("${desc || state}") still could not be attributed to Devin's app after ${maxMin} min (its creator was unreadable) - passing WITHOUT a verified Devin review` };
    return { action: 'wait', reason: `the "${STATUS_CONTEXT}" status on this head ("${desc || state}") could not be attributed yet (its creator was unreadable) - re-checking` };
  }
  if (/skip/i.test(desc) || /^(cancel|neutral)/i.test(state)) {
    return { action: 'pass', unreviewed: true, reason: `Devin skipped this head (${desc || state}) - passing WITHOUT a Devin review` };
  }
  if (/^pending$/i.test(state)) {
    if (elapsedMin >= maxMin) return { action: 'pass', unreviewed: true, reason: `Devin still running after ${maxMin} min (${desc || 'pending'}) - passing WITHOUT its verdict` };
    return { action: 'wait', reason: `Devin is running (${desc || 'pending'})` };
  }
  if (/^(failure|error)$/i.test(state)) {
    return { action: 'pass', unreviewed: true, reason: `Devin Review status is ${state} (${desc}) - it did not review; passing WITHOUT a Devin review` };
  }
  if (!REAL_REVIEW_RE.test(desc)) {
    return { action: 'pass', unreviewed: true, reason: `Devin Review status "${desc}" is not a completed review - passing WITHOUT a Devin review` };
  }
  if (threads === null || threads === undefined) {
    return { action: 'pass', unreviewed: true, reason: 'Devin finished but its review threads could not be read - passing WITHOUT checking its findings' };
  }
  const findings = blockingFindings(threads, { strict });
  if (findings.length) return { action: 'fail', findings, reason: `${findings.length} ${findingWord(strict)} on this head` };
  // v1.12.0 (W3): the next two checks judge only a FINISHED review whose findings are already read - they come after the
  // pending/unverifiable waits (a running Devin must keep the gate waiting) and after the red-finding fail (never hide one).
  // v1.12.0 (W3) independence: the provider that wrote the PR cannot be the independent reviewer of it. Never-stuck,
  // like a forged status: an unreviewed pass plus the label. 'unknown' authors (agent/ branches) are not rejected.
  if (providerOf({ login: implementer, headRef }) === 'devin') {
    return { action: 'pass', unreviewed: true, reason: `the "${STATUS_CONTEXT}" status on this head ("${desc || state}") comes from the same provider that wrote this PR (Devin) - not independent evidence; passing WITHOUT an independent review` };
  }
  // v1.12.0 (W3) expiry: a status older than the age limit is stale evidence (same never-stuck outcome).
  const ageH = evidenceAgeH(devin.created_at, nowMs);
  if (ageH !== null && ageH > maxAgeH) {
    return { action: 'pass', unreviewed: true, reason: `the "${STATUS_CONTEXT}" status on this head is ${ageH.toFixed(1)} h old (limit ${maxAgeH} h) - expired evidence; passing WITHOUT a current review` };
  }
  return { action: 'pass', unreviewed: false, reason: `Devin completed (${desc}) with no ${strict ? 'unresolved Devin threads (strict)' : 'unresolved red findings'}` };
}

/** Markdown for the job summary. Pure. Status-derived text is clean()ed AND markdown-escaped: a forged
 * status description must not render a link/image in the summary a reviewer reads (bb-review P3). */
const mdSafe = (v) => String(v ?? '').replace(MD_CTRL_RE, ' ');
export function summaryMarkdown({ sha, result, elapsedMin, warnings = [], provenance } = {}) {
  const head = result.action === 'fail' ? 'FAIL' : result.unreviewed ? 'PASS (unreviewed)' : 'PASS';
  const out = [`## devin-gate: ${head}`, '', `Head \`${String(sha).slice(0, 8)}\` after ${elapsedMin.toFixed(1)} min. ${mdSafe(result.reason)}.`];
  if (provenance) out.push('', `\`${provenanceLine(provenance)}\``);
  if (result.unreviewed) {
    const devinVouched = provenance && provenance.devin && provenance.devin.state === 'success' && isDevinLogin(provenance.devin.creator);
    const parts = [];
    if (!devinVouched) parts.push('nobody at Devin vouched for this head');
    if (provenance && provenance.bbContested) parts.push('the bb-review verdict on this head could not be attributed');
    out.push('', `Label \`${LABEL}\` is on this PR: ${parts.join('; and ') || 'the gate could not confirm a reviewer vouched for this head'}. Read the diff yourself.`);
  }
  if (result.findings?.length) {
    out.push('', '| Finding | Where |', '|---|---|');
    for (const f of result.findings) out.push(`| [${mdSafe(f.title)}](${cleanUrl(f.url)})${f.reviewId != null && f.reviewId !== '' ? ` (review ${mdSafe(String(f.reviewId))})` : f.reviewUrl ? ` (${mdSafe(String(f.reviewUrl))})` : ''} | \`${mdSafe(f.path)}${f.line ? `:${f.line}` : ''}\` |`);
    out.push('', 'Fix it and resolve the thread (or push a change that outdates it); this check re-runs on every push and review.');
  }
  for (const w of warnings) out.push('', `> WARNING: ${mdSafe(w)}`);
  return out.join('\n') + '\n';
}

/**
 * v1.11.0: the record of WHO vouched for this verdict, derivable from the API reads the gate already makes.
 *   head          the exact sha the verdict was judged on (statuses are per-sha: bound, never stale)
 *   implementer   the PR author
 *   devin/bbReview  the reviewer status ON THAT HEAD: {state, description, creator, id, at, url}
 *                   (creator/id/at/url come from the statuses LIST via getStatusDetails; undefined fields
 *                   mean the read could not supply them - recorded, never guessed)
 *   threads/blocking  counts at verdict time;  foundOn  the commit(s) the blocking findings were posted on
 *   reviewCommit  the sha the triggering pull_request_review was submitted on (env REVIEW_COMMIT), when it
 *                 differs from the head the run judged - the evidence the run re-evaluated was read for the
 *                 NEW head, but the record shows the event that started it (Devin, BB_Tools #968)
 * Pure.
 */
export function buildProvenance({ pr, sha, devin, bbReview, threads, findings, reviewCommit, bbContested } = {}) {
  const st = (s, kind) => (s ? { state: s.state || '', description: s.description || '', creator: s.creator, id: s.id ?? null, at: s.created_at || '', url: s.target_url || '', ...reviewerIdentity(kind, s.creator) } : null);
  const foundOn = [...new Set((findings || []).map((f) => f && f.sha).filter(Boolean))];
  // Per-review identity (Devin, BB_Tools #351): the pull_request_review each blocking thread belongs to,
  // id paired with its url so the line can never imply one url covers every review.
  // Findings that carry BOTH id and url teach the url->id alias, so a later url-only sighting of the same
  // review still merges; the line stays bounded at 3 entries (+N more).
  const idForUrl = new Map();
  for (const f of findings || []) { if (f && f.reviewId != null && f.reviewUrl) idForUrl.set(f.reviewUrl, String(f.reviewId)); }
  const byReview = new Map();
  for (const f of findings || []) {
    if (!f) continue;
    let id = f.reviewId != null ? String(f.reviewId) : ''; const url = f.reviewUrl || '';
    if (!id && url && idForUrl.has(url)) id = idForUrl.get(url);
    if (!id && !url) continue;
    const key = id || url;
    const prev = byReview.get(key);
    byReview.set(key, { id: id || (prev && prev.id) || '', url: url || (prev && prev.url) || '' });
  }
  const reviews = [...byReview.values()].slice(0, 3);
  if (byReview.size > 3) reviews.push({ id: `+${byReview.size - 3} more`, url: '' });
  // Findings with no review identity at all are counted so the line can never imply a listed review
  // covered every finding.
  const noReview = (findings || []).filter((f) => f && (f.reviewId == null || f.reviewId === '') && !f.reviewUrl).length;
  if (noReview) reviews.push({ id: `+${noReview} without review id`, url: '' });
  return {
    head: sha || '',
    implementer: (pr && pr.author) || '',
    implementerProvider: providerOf({ login: pr && pr.author, headRef: pr && pr.headRef }),
    devin: st(devin, 'devin'),
    bbReview: st(bbReview, 'bb-review'),
    threads: Array.isArray(threads) ? threads.length : null,
    blocking: (findings || []).length,
    ...(foundOn.length ? { foundOn } : {}),
    ...(reviews.length ? { reviews } : {}),
    ...(bbContested ? { bbContested: true } : {}),
    ...(reviewCommit && reviewCommit !== sha ? { reviewCommit } : {}),
  };
}

/** The one-line form of buildProvenance for the job log and the step summary. Pure. */
export function provenanceLine(p = {}) {
  const st = (s, tag = '') => (s ? `${clean(s.state) || '-'}${s.description ? ` "${clean(s.description)}"` : ''} by ${clean(s.creator) || '?'}${s.id != null ? ` id=${clean(s.id)}` : ''}${s.at ? ` at ${clean(s.at)}` : ''}${s.url ? ` (${cleanUrl(s.url)})` : ''} [${clean(s.provider) || UNRECORDED}/${clean(s.model) || UNRECORDED}/${clean(s.effort) || UNRECORDED}]${tag}` : 'none');
  // bb-review's creator is RECORDED, never verified (a forged bb-review can only block, never pass) - the
  // line says so, or "by github-actions[bot]" would read as proof a review ran.
  return `provenance: head ${clean(p.head).slice(0, 8) || '?'} implementer @${clean(p.implementer) || '?'} (${clean(p.implementerProvider) || '?'}) | devin: ${st(p.devin)} | bb-review: ${st(p.bbReview, ' (creator unverified)')}${p.bbContested ? ' [contested]' : ''} | threads ${p.threads ?? '?'}, blocking ${p.blocking ?? 0}${p.foundOn ? `, found on ${p.foundOn.map((s) => clean(s).slice(0, 8)).join(',')}` : ''}${p.reviews ? `, in reviews ${p.reviews.map((r) => `${clean(r.id) || '?'}${r.url ? `(${cleanUrl(r.url)})` : ''}`).join(', ')}` : ''}${p.reviewCommit ? ` | triggering review was on ${clean(p.reviewCommit).slice(0, 8)}` : ''}`;
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
 *     getStatusDetails?(sha, {expectBb, deep}) -> {context: {state,description,id,creator,created_at,target_url}} (optional:
 *       the status LIST enriches devin/bbReview with provenance; absent io = no enrichment, old behaviour; expectBb =
 *       the combined read saw a bb-review or was full, so page until the bb-review slot resolves; deep = allow the
 *       10-page read, else 3 pages - round 8);
 *     getFiles?(expectedCount) -> [path]; getCanonicalStatus?(sha) -> {state, creator}|null (optional: absent = files unknown -> strict);
 *     getThreads() -> threads; listComments() -> [{body}]; postComment(body);
 *     setLabel(on:boolean); sleep(ms); now() -> ms; log(line)
 * cfg.reviewCommit = the sha the triggering review was submitted on (env REVIEW_COMMIT; provenance only).
 * Returns {result, sha, elapsedMin, warnings, provenance}. API errors never pass (round 16): inside the window the poll
 * goes on after the retries (the read may recover); at the deadline an outage FAILS the gate - gates fail closed, the
 * devin-gate sweep re-runs it once the API answers.
 */
export async function runGate(io, cfg = {}) {
  const nudgeMin = cfg.nudgeMin ?? NUDGE_MIN_DEFAULT;
  const maxMin = cfg.maxMin ?? MAX_MIN_DEFAULT;
  const pollMs = (cfg.pollS ?? POLL_S_DEFAULT) * 1000;
  const t0 = io.now();
  // Past the gate window (+1 min grace) stop retrying: the deadline verdict must land well before the job timeout.
  const pastWindow = () => (io.now() - t0) / 60000 > maxMin + 1;
  const retry = (fn) => withRetries(fn, { sleep: io.sleep, backoffMs: cfg.backoffMs ?? 2000, shouldStop: pastWindow });
  const warnings = [];
  const wallNow = () => (cfg.wallNow ? cfg.wallNow() : Date.now());
  const maxAgeH = cfg.evidenceMaxAgeH ?? EVIDENCE_MAX_AGE_H_DEFAULT;
  // v1.12.0: the PR facts the independence / expiry rules judge on, added to every decide() call.
  const ctxFor = (p) => ({ implementer: (p && p.author) || '', headRef: (p && p.headRef) || '', nowMs: wallNow(), maxAgeH });
  let scannedSha = null; let scanClear = false; let secretHit = null; const scanWarnedSet = new Set(); let scanGap = null; let scanSkipped = 0; let scanMerged = 0; let scanHold = false; let holdWarned = false; let scanAllowed = 0; let draftExit = false; let failSeen = null; let cmpHeld = 0;
  const seenWarn = new Set();
  const warnOnce = (m) => { if (!seenWarn.has(m)) { seenWarn.add(m); warnings.push(m); } };
  let sha = '?';
  // Round 16: an outage never passes. Inside the window it is said once and the poll goes on (the next poll retries the
  // read); at the deadline it FAILS - no verdict could be read, so nothing vouches for the head. The devin-gate sweep
  // re-runs a failed gate every 10 min, so a real outage costs minutes and recovery needs no re-push.
  const apiOutage = (e) => {
    const err = String(e?.message || e).split('\n')[0];
    if ((io.now() - t0) / 60000 < maxMin) {
      warnOnce(`GitHub API error after ${API_RETRIES} retries (${err}); the read may recover - polling on until the ${maxMin}-min deadline, where an outage FAILS the gate`);
      return null;
    }
    const msg = `GitHub API error after ${API_RETRIES} retries (${err}) at the ${maxMin}-min deadline - gates fail closed: no verdict could be read, so this run FAILS (the devin-gate sweep re-runs it once the API answers; recovery needs no re-push)`;
    warnings.push(msg);
    return { action: 'fail', unreviewed: true, reason: msg };
  };
  let result;
  let filesSha = null;
  let files = null;
  // v1.11.0: the inputs the verdict was judged on, kept for the provenance record (set every poll).
  let lastPr = null; let lastDevin; let lastBb; let lastThreads; let lastBbContested;
  let provWarned = false;
  // Cache for the status-list read: statuses only append, so (sha, state|description) identifies the set.
  // Round-8 P2 (paging cost): a hot slot is re-read every poll, so the 10-page read ran up to 32 x 10 pages x retries
  // per window. The deep read now runs on the first poll of a head, then at most once per DEEP_READ_MS, and always
  // at the deadline; the polls between read 3 pages. Round 11: a shallow read that leaves the bb-review slot
  // unresolved stands as read - it is never completed from a cached deep read (the round-9 borrow is gone). When a
  // pass is at stake (Devin success) and the slot is unresolved with no failure in sight, the poll re-reads DEEP at
  // once, once per Devin verdict (upgradedKey), and judges that read. detDeep says whether the cached det came from a
  // deep read: the stale fallback at a failed deadline read fails an unresolved shallow det closed. The cadence runs
  // on the last deep ATTEMPT (deepTriedAt), not the last success: a read that keeps failing is retried deep once per
  // 2 minutes, not 10 pages on every poll.
  const DEEP_READ_MS = 120000;
  let provCache = { sha: null, fp: null, det: null, detDeep: false, hint: false, full: false, hold: 0, deepTriedAt: null, upgradedKey: null };
  for (;;) {
    const elapsedMin = (io.now() - t0) / 60000;
    try {
      const pr = await retry(() => io.getPr());
      if (sha !== '?' && pr.sha !== sha) {
        warnings.push(`head moved ${sha.slice(0, 8)} -> ${pr.sha.slice(0, 8)}; a newer run judges the new head`);
        // Provenance belongs to the head it was read on: drop the old head's reviewer data so the record
        // can never pair a new sha with a verdict read for the old one (bb-review P2).
        lastDevin = null; lastBb = null; lastThreads = undefined; provWarned = false;
      }
      sha = pr.sha;
      lastPr = pr; // set before the held/draft exits: the implementer is recorded on every verdict
      lastDevin = null; lastBb = null; lastThreads = undefined; lastBbContested = false; // reset per poll
      if (isHeld(pr)) { result = { action: 'fail', unreviewed: null, reason: HELD_REASON }; break; }
      if (pr.draft) { draftExit = true; result = { action: 'pass', unreviewed: false, reason: 'draft PR - not gated' }; break; } // not gated, so the secret-scan checks after the loop do not apply
      if (filesSha !== sha || (files === null && io.getFiles)) {
        // Read once per head, and again on every poll while it is unreadable (a transient 502 must not pin an ordinary
        // PR to strict for the whole run; Devin, #237). Unreadable (or an io without getFiles) leaves files null:
        // strict, never the fast path.
        filesSha = sha;
        files = null;
        if (io.getFiles) { try { files = await retry(() => io.getFiles(pr.changedFiles)); } catch (e) { warnings.push(`could not read the changed files (${errStatus(e)}; error text withheld, it can echo a patch); judging STRICTLY (any open Devin thread blocks)`); } }
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
      // Round-8 P2: the combined endpoint returns ONE page of latest-per-context statuses (per_page=100). With 100
      // or more contexts on the head a context - the bb-review - can be missing from it, so "no bb-review in the
      // combined read" is only proof of absence when that read is not full.
      const combinedFull = (statuses || []).length >= 100;
      // v1.11.0 provenance: the combined status omits only `creator` (id/created_at/target_url are present),
      // so a LIST read supplies it - and lets devinVerdict refuse a "Devin Review" status Devin's app never
      // posted. The read is
      // cached per (sha, status fingerprint): statuses only append, so a change in state or description means
      // a new entry to attribute. A failed or partial read marks the Devin status `unverifiable` - the verdict
      // then passes UNREVIEWED, never reviewed on evidence nobody could check (bb-review P2).
      let trustedBb = null; // newest bb-review entry by a trusted poster, from the list read (if any)
      let bbUnverifiable = false; // a foreign bb-review on top, real verdict beyond the page cap
      let listBb = null; // the list read's newest bb-review entry, whoever posted it (round-5 P2)
      let listUnreadable = false; // the DEADLINE list read failed: the bb-review slot had no last look (round-6 P3)
      let listCapped = false; // the list read hit its page cap with a bb-review slot unresolved (round 7, status flooding)
      let deadlineBlind = false; // round 16: the DEADLINE list read threw with no saved bb-review failure in hand - the slot had no last look; fails as flooding
      let deadlineBlindNote = ''; // round 16: which fallback the deadline had (a saved read with no failure, or none) - for the warning and the verdict
      // v1.11.1: the DEADLINE poll reads the list even when the combined read is empty - a trusted failure posted
      // between a stale combined view and this poll has no next poll to be seen in (bb-review P2). The window's
      // earlier empty polls still skip it (no evidence to attribute).
      if (io.getStatusDetails && (devin || bbReview || combinedFull || elapsedMin >= maxMin)) {
        // Round 8: the list read takes two hints - expectBb (a bb-review was seen, or the combined read is full and
        // may be hiding one: page until the slot resolves) and deep (the 10-page read, on the cadence above).
        const expectBb = !!bbReview || combinedFull;
        // The fingerprint keys the cache: id first (the combined read carries it), so an identical-text
        // re-post by a DIFFERENT actor is still a new entry to attribute; state|description cover ios that
        // cannot supply an id at all. Round 12 (P2): the expectBb hint is part of the key - a flood that fills the
        // combined read (100+ contexts, no bb-review) does not change the Devin + bb-review fingerprint, and a
        // hint-less read cached before it must not be judged for 3 more polls: the flip forces a re-read WITH the
        // hint, which caps under the flood and leaves the slot hidden for the deadline to fail.
        const fp = [devin, bbReview].map((s) => (s ? `${s.id ?? ''}|${s.state}|${s.description || ''}` : '')).join('~') + (expectBb ? '~hint' : '~');
        // Round 11: the Devin verdict a deep read ran under - the pass-at-stake upgrade below reads deep at most once
        // per verdict, and a cadence, first-poll or deadline deep read under the same verdict counts as that read.
        const devinKey = devin ? `${devin.id ?? ''}|${lowerState(devin.state)}` : null;
        let det;
        // v1.11.1: the DEADLINE poll always re-reads (round-5 P2) - it is the last look, and a failure that landed
        // under an unchanged combined fingerprint (an empty slot never changes it) must not hide in the cache.
        const deep = elapsedMin >= maxMin || !(provCache.sha === sha && provCache.deepTriedAt != null && io.now() - provCache.deepTriedAt < DEEP_READ_MS);
        if (provCache.sha === sha && provCache.fp === fp && provCache.hold > 0 && elapsedMin < maxMin) { det = provCache.det; provCache.hold -= 1; }
        else {
          // Round-9 P3: the deep attempt is recorded BEFORE the read, so a failing read does not make every poll deep.
          if (deep) provCache = provCache.sha === sha ? { ...provCache, deepTriedAt: io.now() } : { sha, fp: null, det: null, detDeep: false, hint: false, full: false, hold: 0, deepTriedAt: io.now(), upgradedKey: null };
          try {
            det = await retry(() => io.getStatusDetails(sha, { expectBb, deep }));
            // Round 11: the read stands as read. A shallow read that left the bb-review slot unresolved is never
            // completed from a cached deep read (rounds 9-10 did, and passed over a failure the shallow read never
            // reached); the upgrade below re-reads deep when a pass is at stake, and the deadline read is always deep.
            provCache = { ...provCache, sha, fp, det, detDeep: deep, hint: expectBb, full: combinedFull, hold: 1e9, upgradedKey: deep ? devinKey : provCache.upgradedKey };
          }
          catch (e) {
            // The deadline read is the last look (round-6 P3): its failure is said every time, not deduped behind an
            // earlier provenance warning. Round 16: unless a saved bb-review failure is in hand (judged below), the slot
            // had no last look and the run FAILS as flooding - a bb-review failure that landed under an empty or
            // unattributable slot could not be seen, and no earlier read is a look at the slot as it is now.
            if (elapsedMin >= maxMin) {
              listUnreadable = true;
              // Round-7 P1: the last GOOD read is not forgotten. Its failures (trusted or foreign) are judged below as
              // if read now; its successes are NOT borrowed (a stale success must never vouch), so the pick stays
              // unverifiable and the deadline override fails on the failure.
              const stale = provCache.sha === sha && provCache.det ? provCache.det : null;
              // Round-9 P3: the trusted entry is usually ALSO the newest bb-review entry - one failure, counted once.
              const staleFailList = stale ? [stale._trustedBb, stale[BB_REVIEW_CONTEXT]].filter(isFailState) : [];
              const staleFails = staleFailList.filter((f, i) => staleFailList.findIndex((g) => g === f || (idNum(g.id) != null && idNum(g.id) === idNum(f.id))) === i).length;
              // Round-8 P2: the combined read may show a bb-review NEWER than the stale failure (a later entry this poll
              // could not attribute). The failure still stands - a newer id is not proof it cleared, and a stale success
              // never vouches - but the reason says so and names the way out.
              const superseded = (f) => !!(f && bbReview && idNum(bbReview.id) != null && idNum(f.id) != null && idNum(bbReview.id) > idNum(f.id));
              const supersededNote = (f) => (superseded(f) ? `; the combined read shows a newer bb-review (id ${clean(bbReview.id)}) that could not be attributed - this failure may be superseded; recovery: a re-push (a new head starts with an empty status list)` : '');
              const staleNote = ' - from the last good status-list read; the deadline read failed';
              if (stale) {
                trustedBb = isFailState(stale._trustedBb) ? { ...stale._trustedBb, description: `${stale._trustedBb.description || stale._trustedBb.state}${staleNote}${supersededNote(stale._trustedBb)}` } : null;
                listBb = isFailState(stale[BB_REVIEW_CONTEXT]) ? { ...stale[BB_REVIEW_CONTEXT], description: `${stale[BB_REVIEW_CONTEXT].description || stale[BB_REVIEW_CONTEXT].state}${staleNote}${supersededNote(stale[BB_REVIEW_CONTEXT])}` } : null;
                bbUnverifiable = bbUnverifiable || !!stale._bbUnverifiable;
                listCapped = listCapped || !!stale._listCapped;
              }
              const anySuperseded = !!(stale && (superseded(isFailState(stale._trustedBb) ? stale._trustedBb : null) || superseded(isFailState(stale[BB_REVIEW_CONTEXT]) ? stale[BB_REVIEW_CONTEXT] : null)));
              // Round 16: no saved failure -> no last look -> fail closed (the flooding block below). A saved success,
              // empty slot or unresolved slot never vouches; neither does "a bb-review would show in the combined read":
              // a failure posted under a forged top is exactly what only the deadline list read could have attributed.
              if (!staleFails) {
                deadlineBlind = true;
                deadlineBlindNote = stale ? 'the last good read held no bb-review failure (a stale success never vouches)' : 'no earlier read to fall back on';
              }
              warnings.push(`the status-list read failed at the DEADLINE poll (${errLine(e)}); the bb-review slot (${bbReview ? 'unattributable' : 'empty'}) had no last look - ${staleFails ? `judging the ${staleFails} bb-review failure(s) the last good read held${anySuperseded ? ` (the combined read shows a newer bb-review id ${clean(bbReview.id)} that could not be attributed: the failure may be superseded; recovery: a re-push)` : ''}` : `${deadlineBlindNote}; judged as status flooding (gates fail closed; the devin-gate sweep re-runs this gate when the read recovers)`}`);
            }
            else if (!provWarned) { provWarned = true; warnings.push(`could not read status provenance (${errLine(e)}); judging without it`); }
          }
          if (det && det._truncated && !provWarned) { provWarned = true; warnings.push('status provenance read was truncated (the status list ran past its page cap); a reviewer status may be unattributed'); }
        }
        // Round 11 (replaces the round-9 deep-slot borrow): a pass is at stake - Devin succeeded - and the det in hand
        // is a SHALLOW read that left the bb-review slot unresolved (capped, or a foreign top with no trusted entry
        // inside its 3 pages) with no failure in sight. Neither a reviewed pass on it (a failure may sit beyond page 3)
        // nor a 2-minute wait for the cadence (Devin's verdict is the moment the gate decides) is right: read DEEP now
        // and judge that read. At most one deep read per Devin verdict (upgradedKey: a deep read of any kind under this
        // verdict already counts), so a flood that caps even the deep read costs one extra 10-page read, not one per
        // poll; the cadence and the deadline read keep looking. A failure the shallow read saw is kept as read
        // (round-5 rule) - the list-failure override judges it; no deep read is needed to fail.
        if (det && provCache.sha === sha && !provCache.detDeep && (det._listCapped || det._bbUnverifiable) && !isFailState(det._trustedBb) && !isFailState(det[BB_REVIEW_CONTEXT]) && devin && lowerState(devin.state) === 'success') {
          if (provCache.upgradedKey !== devinKey) {
            provCache = { ...provCache, deepTriedAt: io.now(), upgradedKey: devinKey };
            try {
              det = await retry(() => io.getStatusDetails(sha, { expectBb, deep: true }));
              provCache = { ...provCache, fp, det, detDeep: true, hint: expectBb, full: combinedFull, hold: 1e9 };
            }
            catch (e) {
              // The shallow read stands (unresolved: hidden or contested, never a pass); the cadence or the deadline resolves it.
              if (!provWarned) { provWarned = true; warnings.push(`the deep status-list read for a pass at stake failed (${errLine(e)}); the bb-review slot stays unresolved until the next deep read or the deadline`); }
            }
          }
        }
        // Only provenance fields are merged, and only when the list entry IS the status the combined read
        // judged (a status posted between the reads puts a different entry first). A lagging list read -
        // an older entry, or the Devin context not yet indexed - leaves the status unattributable, and that
        // det is NOT cached: the next poll re-reads, so a recovered view verifies the review inside the
        // window instead of holding it unverifiable to the deadline (bb-review P2).
        if (det) {
          trustedBb = det._trustedBb || null;
          listBb = det[BB_REVIEW_CONTEXT] || null;
          bbUnverifiable = bbUnverifiable || !!det._bbUnverifiable;
          listCapped = listCapped || !!det._listCapped;
          for (const s of [devin, bbReview]) {
            const d = s && det[s.context];
            if (!d) continue;
            // v1.11.1: a matching id must also carry the same state - one status id with two states is corrupt
            // data, and merging the list's provenance onto the combined pick would vouch for a verdict the list
            // never showed. Left unattributable, the trusted-failure override below judges it (round-4 P2).
            // Ids match as numbers when both parse (a combined 50 IS a list "50" - round-5 P3), strictly otherwise;
            // states match case-insensitively in both branches.
            const sid = idNum(s.id), did = idNum(d.id);
            const same = s.id != null && d.id != null
              ? ((sid != null && did != null ? sid === did : s.id === d.id) && lowerState(d.state) === lowerState(s.state))
              : (lowerState(d.state) === lowerState(s.state) && d.description === (s.description || ''));
            if (!same) { s.unverifiable = true; continue; }
            s.id = d.id; s.creator = d.creator; s.created_at = d.created_at; s.target_url = d.target_url;
          }
        }
        // Enrichment ran (or was attempted): a Devin status still without a creator cannot be attributed -
        // a context the list never echoed, or a read that failed. Provably-not-Devin (null) is handled above.
        if (devin && devin.creator === undefined) devin.unverifiable = true;
        if (bbReview && bbReview.creator === undefined) bbReview.unverifiable = true;
        // A det that could not attribute a status is retried, but not every poll (bb-review P3): it is
        // reused for 3 polls so a recovered view still verifies inside the window without 3x30 API calls.
        // An EMPTY bb-review slot is held the same way (round-5 P2): its fingerprint cannot change when a bb-review
        // status lands that the combined read has not shown yet, so the list is the only view of it.
        if (det && provCache.det === det && (!bbReview || (devin && devin.unverifiable) || (bbReview && bbReview.unverifiable))) provCache.hold = Math.min(provCache.hold, 3);
        // A foreign or unattributable bb-review on top makes _trustedBb the verdict's only view of the real
        // history: re-read EVERY poll (hold 0), because a NEW trusted failure under an unchanged combined
        // pick must not hide in a cached det (Devin + bb-review, BB_Tools #351).
        // Unattributable or foreign reviewer entries re-read EVERY poll while hot: any partial bound
        // (every-4-polls, early-window-only) leaves a stale-det window a trusted failure can hide in, and
        // the deadline poll is the one most likely to use it (bb-review P1, Devin :769). Bounded by the
        // window itself (~32 reads at the default poll) - acceptable.
        const hot = (devin && (devin.unverifiable || (devin.creator !== undefined && !isDevinLogin(devin.creator)))) || (bbReview && (bbReview.unverifiable || (bbReview.creator !== undefined && !isBbReviewPoster(bbReview.creator))));
        if (det && provCache.det === det && hot) provCache.hold = 0;
      }
      // A status PROVABLY not posted by Devin's app is not evidence at all: treat it as absent so the run
      // keeps its window and still nudges the real Devin - an early unreviewed pass would merge a PR before
      // Devin was ever asked (bb-review P2). The record below still shows exactly what was posted, by whom.
      const devinEvidence = devin && devin.creator !== undefined && !isDevinLogin(devin.creator) ? null : devin;
      // bb-review evidence = the combined pick when its poster is trusted or unreadable; when the latest
      // entry is foreign, the verdict judges the newest TRUSTED-poster entry from the list instead - a
      // foreign "success" cannot hide a real failure, and a foreign "failure" earns no block (P2).
      // bb-review evidence: gates fail CLOSED. A failure/error blocks whoever posted it - a forged failure
      // only costs a red, while a dropped real failure costs a merged P1 (bb-review P2). Only a foreign
      // NON-failure is set aside (a foreign "success" must not hide the newest trusted entry's verdict).
      let bbEvidence = bbReview;
      // v1.11.1: the list read already holds a NEWER trusted failure than the combined pick (a failure posted
      // between the two reads). The pick is unattributable, but the failure is not in doubt - honour it now,
      // not at a later sweep: at the deadline poll a contested slot would otherwise pass unreviewed (codex P1).
      // Same race, empty slot: the combined read ran before bb-review posted anything, and the list read (taken
      // for the Devin status) already holds the trusted failure - a clean reviewed pass in that poll would merge
      // the P1, so the failure is the evidence there too (bb-review P2). With no bb-review AND no Devin status the
      // list is not read at all; the next poll's combined read sees the failure (unchanged).
      // An id is a finite number or a decimal-digit string; anything else (missing, blank, hex, boolean) is "not
      // provably older" and the failure wins - fail closed. Ids compare as numbers: a string io ("10" > "9" is
      // false lexically) must not hide the newer failure (P3). EQUAL ids are an override too: one status id
      // carrying two states is corrupt data, and a gate judges corrupt data closed (round-4 P2).
      // At the DEADLINE poll the failure wins whatever its age: the window was waited so a lagging list could
      // catch up (the slot is re-read every poll while hot), and an unreviewed pass with a trusted failure in
      // hand is never safe - a success the list never showed is a success nobody attributed (round-4 P2).
      // The failure the override judges is the NEWEST failure/error in the list read, by ANY poster (round-5 P2):
      // the combined-pick rule already honours a foreign failure as a block, and a foreign failure the list saw
      // first must not fall between the two rules (the pick has no creator, so the foreign-poster rule below
      // cannot see it, and _trustedBb skips foreign entries).
      const newerId = (a, b) => { const x = idNum(a), y = idNum(b); return x == null || y == null || x >= y; };
      const isFail = isFailState;
      const listFails = [trustedBb, listBb].filter(isFail);
      const listFail = listFails.length ? listFails.reduce((a, b) => (a === b || !newerId(b.id, a.id) ? a : b)) : null;
      if (io.getStatusDetails && (!bbReview || bbReview.unverifiable) && listFail
          && (!bbReview || newerId(listFail.id, bbReview.id) || elapsedMin >= maxMin)) {
        const atDeadline = !!bbReview && !newerId(listFail.id, bbReview.id);
        const by = `posted by ${clean(listFail.creator) || 'an unnamed account'}${isBbReviewPoster(listFail.creator) ? '' : ' (not a review-harness login)'}`;
        // The competing entry, for the operator: a misconfigured poster login (a success the harness posted under
        // a new login) reads differently from a real problem (round-5 P3).
        const top = listBb ? `newest list entry: ${clean(listBb.state)} id ${clean(listBb.id)} by ${clean(listBb.creator) || 'an unnamed account'}` : 'the list read holds no bb-review entry on top';
        // At the deadline the evidence text carries BOTH: the failure the list read holds and the combined pick it
        // outranks, so the operator sees the in-flight run as well as the stale failure (round-6 P3).
        bbEvidence = atDeadline
          ? { ...listFail, description: `${clean(listFail.description) || clean(listFail.state)} - from the status list; the combined read shows ${clean(bbReview.state)} id ${clean(bbReview.id)} ("${clean(bbReview.description)}") that could not be attributed` }
          : { ...listFail };
        warnOnce(atDeadline
          ? `the status-list read holds a "bb-review" ${clean(listFail.state)} (id ${clean(listFail.id)}, ${by}) that the combined read's unattributable ${clean(bbReview.state)} (id ${clean(bbReview.id)}, creator unknown) never outranked inside the window; at the deadline, judging the failure (gates fail closed; ${top}; recovery: a re-push - a new head starts with an empty status list; a success the harness posts under a NEW login needs that login in BB_REVIEW_LOGINS)`
          : `the status-list read holds a newer "bb-review" ${clean(listFail.state)} (id ${clean(listFail.id)}, ${by}) than the combined read's ${bbReview ? clean(bbReview.state) : 'empty bb-review slot'}; judging the failure (gates fail closed)`);
      }
      // The foreign-poster rule below judges the COMBINED pick; it never runs over an override. `unverifiable` is set
      // exactly when the pick has no creator (the list read disagreed on id/state, or never attributed it), and a
      // pick WITH a creator is the list's own newest bb-review entry, so no newer trusted failure can exist for it -
      // the two rules were already exclusive; the guard makes that explicit (P2).
      if (bbEvidence === bbReview && io.getStatusDetails && bbReview && bbReview.creator !== undefined && !isBbReviewPoster(bbReview.creator)) {
        if (/^(failure|error)$/i.test(bbReview.state || '')) {
          warnOnce(`a "bb-review" ${bbReview.state} status posted by ${clean(bbReview.creator) || 'an unnamed account'} is being honoured as a block even though that login is not the review harness - gates fail closed`);
        } else {
          bbEvidence = trustedBb ? { ...trustedBb } : null;
          warnOnce(`a "bb-review" ${bbReview.state} status posted by ${clean(bbReview.creator) || 'an unnamed account'} was set aside - that login is not the review harness; if bb-review now runs under a new login, add it to BB_REVIEW_LOGINS`);
        }
      }
      // Contested bb-review evidence - a foreign non-failure set aside, or a read that could not attribute
      // the slot: no clean green pass on a verdict slot it cannot honour. Wait the window, then pass
      // UNREVIEWED with the label (gates fail closed - bb-review P2).
      // STATUS FLOODING (Devin SEC on CT #890, round 7): the combined read shows a bb-review whose real verdict the
      // list read could not reach - a foreign entry on top with the trusted entry beyond the page cap
      // (_bbUnverifiable), or a bb-review the capped list never echoed at all. Enough foreign statuses hide a
      // trusted FAILURE, and a contested pass would let auto-merge land it: a verdict that could not be read is
      // judged as a failure at the deadline. Inside the window the slot stays contested (the list may still catch
      // up, and the deeper paging usually resolves it). A lagging list that is NOT capped is not flooding: it stays
      // the contested unreviewed pass (never stuck on an ordinary indexing delay).
      // Round-8 P2, the HIDDEN slot: no bb-review in the combined read is proof of absence only when that read is not
      // full. A FULL combined read with no bb-review, plus a list read that hit its cap without reaching one (or with
      // a foreign entry on top), may be hiding a trusted failure behind 100+ contexts - the same flooding, one read
      // earlier. Guard: a combined read that is not full and shows no bb-review is an ordinary head (never fails).
      // Round-9 P2: "beyond the cap" is claimed only when the list read DID hit its cap (_listCapped). _bbUnverifiable
      // alone (a foreign top, no trusted entry, the list read in full or stopped early) is not flooding: the slot is
      // contested - the foreign top is never honoured, the run waits out the window and ends contested (a verified
      // Devin pass keeps its flag; nothing passes on the foreign entry). githubIo sets _bbUnverifiable only on a
      // 100-entry page with the slot unresolved, which exits by exhaustion or the cap - so there it implies _listCapped;
      // the gate no longer relies on that, and a renamed harness login cannot turn every head red on its own.
      const bbSlotHidden = !bbReview && listCapped && (bbUnverifiable || (!listBb && combinedFull));
      const floodedByCap = listCapped && (bbReview ? (bbUnverifiable || bbReview.unverifiable) : bbSlotHidden);
      // Round 16: a thrown deadline read with no saved failure in hand (deadlineBlind) is flooding too - the one look
      // that could attribute or rule out a bb-review failure never happened, so the slot is judged hidden.
      const flooded = !!(io.getStatusDetails && !(bbEvidence && isFail(bbEvidence)) && (floodedByCap || deadlineBlind));
      if (flooded && elapsedMin >= maxMin) {
        // Round-8 P3: the synthetic failure is the GATE's verdict, not the foreign entry's - it carries none of that
        // entry's identity (no id, url or timestamp), so provenance never cites a foreign success as the failure.
        if (!floodedByCap) {
          // deadlineBlind alone: the warning was pushed by the catch (said every time); the verdict carries the same facts.
          bbEvidence = { context: BB_REVIEW_CONTEXT, state: 'failure', creator: undefined, id: null, target_url: '', created_at: '', synthetic: true, description: `status flooding: the status-list read failed at the deadline, so the bb-review slot (${bbReview ? `the combined read shows ${clean(bbReview.state)} id ${clean(bbReview.id)} "${clean(bbReview.description)}", never attributed` : 'empty in the combined read'}) had no last look - ${deadlineBlindNote}; a trusted failure may sit beneath or beyond it, so it is judged failed (gates fail closed; the devin-gate sweep re-runs this gate when the read recovers)` };
        } else if (bbReview) {
          bbEvidence = { context: BB_REVIEW_CONTEXT, state: 'failure', creator: undefined, id: null, target_url: '', created_at: '', synthetic: true, description: `status flooding: the bb-review verdict sits beyond the status-list cap (the combined read shows ${clean(bbReview.state)} id ${clean(bbReview.id)} "${clean(bbReview.description)}" that ${bbUnverifiable ? 'a foreign poster\'s entry tops in the list, with no review-harness entry inside the cap' : listUnreadable ? 'the status-list read failed at the deadline, so no read attributed or looked beneath' : 'the capped list read never reached'}); the real verdict could not be read, so it is judged failed` };
          warnOnce(`status flooding on this head: the list read hit its page cap with the "bb-review" verdict unresolved (${bbUnverifiable ? 'a non-harness poster on top, no review-harness entry inside the cap' : 'the combined read\'s bb-review never reached'}); gates fail closed - judging it failed. Recovery: a re-push (a new head starts with an empty status list), or add a renamed harness login to BB_REVIEW_LOGINS`);
        } else {
          bbEvidence = { context: BB_REVIEW_CONTEXT, state: 'failure', creator: undefined, id: null, target_url: '', created_at: '', synthetic: true, description: `status flooding: the bb-review slot is hidden - the combined read is full (${(statuses || []).length} contexts on one page, no bb-review among them) and the status-list read hit its page cap without ${bbUnverifiable ? 'a review-harness entry inside the cap (a foreign poster\'s on top)' : 'one'}; a verdict may sit beyond both reads, so it is judged failed` };
          warnOnce(`status flooding on this head: the combined read is full (${(statuses || []).length} contexts) with no "bb-review" among them and the list read hit its page cap without resolving the slot - a verdict may be hidden; gates fail closed - judging it failed. Recovery: a re-push (a new head starts with an empty status list), or add a renamed harness login to BB_REVIEW_LOGINS`);
        }
      } else if (bbEvidence === null && bbReview && bbUnverifiable && listCapped) {
        warnOnce('the newest "bb-review" status is not from the review harness and its real verdict sits beyond the status-list page cap; waiting out the window - at the deadline this is status flooding and fails');
      } else if (bbEvidence === null && bbReview && bbUnverifiable) {
        warnOnce('the newest "bb-review" status is not from the review harness and the list read found no trusted bb-review verdict (the list was not capped); the foreign entry is not honoured - waiting out the window; at the deadline the slot is recorded contested');
      } else if (bbEvidence === null && bbSlotHidden) {
        warnOnce('the bb-review slot is hidden (the combined read is full with no bb-review, and the capped list read found none); waiting out the window - at the deadline this is status flooding and fails');
      }
      const bbContested = !!(io.getStatusDetails && !(bbEvidence && /^(failure|error)$/i.test(bbEvidence.state || '')) && (bbReview ? (bbEvidence !== bbReview || bbReview.unverifiable) : (bbSlotHidden || bbUnverifiable)));
      lastBbContested = bbContested; // recorded in provenance: the bb-review slot could not be honoured
      // (warned at the deadline pass below, only when the run actually ends contested)
      lastPr = pr; lastDevin = devin; lastBb = bbEvidence; // record what the verdict judged, not what sat on top
      lastThreads = undefined; // reset per poll: a count from an earlier poll must not outlive a failed read
      let d;
      // Branch on the TRUSTED bb-review evidence, not the raw pick: a foreign failure takes the reduced
      // failure path while decide ignores it - a fail-open over red threads and a nudge storm (bb-review P1).
      if (bbEvidence && /^(failure|error)$/i.test(bbEvidence.state || '')) {
        // A failed bb-review fails the gate no matter what: no request here can turn it into an outage verdict. Devin's threads are
        // read best-effort only so the reason can report Devin's side too (a read failure just leaves that side "unknown").
        let bbThreads;
        if (devinEvidence && REAL_REVIEW_RE.test(devinEvidence.description || '') && !/skip/i.test(devinEvidence.description || '')) {
          try { bbThreads = await retry(() => io.getThreads()); } catch { bbThreads = null; }
        }
        d = decide({ devin: devinEvidence, bbReview: bbEvidence, threads: bbThreads, elapsedMin, nudgeMin, maxMin, strict, fastPass, ...ctxFor(pr) });
        lastThreads = bbThreads;
      } else {
        let nudged = true;
        if (!devinEvidence && elapsedMin >= nudgeMin) {
          try { nudged = hasNudge(await retry(() => io.listComments()), sha); } catch (e) { warnings.push(`could not list comments to check for a nudge (${errLine(e)}); not nudging this poll`); }
        }
        let threads;
        if (devinEvidence && REAL_REVIEW_RE.test(devinEvidence.description || '') && !/skip/i.test(devinEvidence.description || '')) {
          // Only the verdict that depends on the threads degrades (decide: null -> pass unreviewed); it never masks bb-review.
          try { threads = await retry(() => io.getThreads()); } catch (e) { threads = null; warnings.push(`could not read Devin review threads (${errLine(e)})`); }
        } else if (fastPass || strict) {
          // The fast path passes before Devin's verdict, and strict mode must not pass a timeout/skip over a finding
          // already posted, so both read what Devin has posted so far (decide refuses to fast-pass unread threads).
          try { threads = await retry(() => io.getThreads()); } catch (e) { threads = null; warnings.push(`could not read Devin review threads (${errLine(e)})${fastPass ? '; not fast-passing' : ''}`); }
        }
        d = decide({ devin: devinEvidence, bbReview: bbEvidence, threads, elapsedMin, nudged, nudgeMin, maxMin, strict, fastPass, ...ctxFor(pr) });
        if (d.action === 'pass' && d.unreviewed && threads === undefined) {
          // About to pass WITHOUT Devin's verdict and the threads were never read: read them once now, so a red thread
          // Devin already posted fails the gate instead of a sweep re-run that would pass again (Devin, #237).
          try { threads = await retry(() => io.getThreads()); } catch (e) { threads = null; warnings.push(`could not read Devin review threads (${errLine(e)})`); }
          d = decide({ devin: devinEvidence, bbReview: bbEvidence, threads, elapsedMin, nudged, nudgeMin, maxMin, strict, fastPass, ...ctxFor(pr) });
        }
        lastThreads = threads;
      }
      if (d.action === 'pass' && bbContested) {
        // Keep the wait (contested evidence must not pass early), but keep the verdict's own unreviewed
        // flag: a VERIFIED Devin review stays reviewed - the bb-review slot's uncertainty is not Devin's
        // (Devin, BB_Tools #351).
        // unreviewed is false ONLY when the verdict was a verified review - an absent or null field is
        // treated as unreviewed (never coerced into a clean pass).
        if (elapsedMin >= maxMin) {
          warnOnce('the "bb-review" verdict on this head could not be attributed to the review harness; it is recorded contested');
          // Post the contested note once per head BEFORE the pass: a verified pass keeps its reviewed flag
          // and drops the label, so the PR page needs SOME visible mark. If the note cannot be posted the
          // pass degrades to unreviewed - the label becomes the durable mark (bb-review P1).
          const unseen = bbUnverifiable || (bbReview && bbReview.unverifiable);
          let noted = false;
          try {
            const cm = `<!-- devin-gate bb-contested ${sha} -->`;
            // Only the gate's OWN marker dedupes: anyone can paste the marker text into a comment, so a
            // comment carrying a different author (when the io exposes it) never suppresses the note.
            // Only a bot-authored marker dedupes - GitHub app identities end in '[bot]' (or are the
            // Actions account itself); a user account can never forge the mark, and a missing author
            // can never match (bb-review P1/P2).
            const hasNote = (list) => list.some((c) => String(c && c.body || '').includes(cm) && c.user && /^(github-actions|github-actions\[bot\])$/i.test(String(c.user.login || '')));
            noted = hasNote(await retry(() => io.listComments()));
            if (!noted) {
              // A failed post can have landed (ambiguous timeout), so every RETRY re-lists first and skips
              // when the note already exists - the same idiom as the nudge below (Devin, BB_Tools #351).
              let firstPost = true;
              await retry(async () => {
                if (!firstPost && hasNote(await io.listComments())) return;
                firstPost = false;
                await io.postComment(`the "bb-review" verdict on this head could not be attributed to the review harness; the gate waited its window before passing - treat the bb-review status on this head with care.\n\n${cm}`);
              });
              noted = true;
            }
          } catch (e) { warnings.push(`could not post the contested bb-review note (${errLine(e)})`); }
          // Reviewed only when ALL three hold: the contested note is on the PR, the bb verdict was READ
          // (not unseen), and Devin itself is a verified success - the same vouch definition the summary
          // uses, not whatever decide() happened to carry (bb-review P2).
          const verifiedDevin = !!(devin && devin.state === 'success' && devin.creator !== undefined && isDevinLogin(devin.creator));
          d = { ...d, action: 'pass', nudge: false, unreviewed: d.unreviewed !== false || !(noted && !unseen && verifiedDevin), reason: `${d.reason || 'passed'} - plus: a "bb-review" status on this head could not be attributed to the review harness after ${maxMin} min` };
        }
        else d = { action: 'wait', reason: 'a "bb-review" status on this head is unattributable - waiting out the window' };
      }
      // Round-7 P2: every non-fail outcome, not only a literal 'pass' - whatever shape the deadline verdict takes, the
      // bb-review slot had no last look, so it is never reported as reviewed. Since round 16 a thrown deadline read
      // fails closed (deadlineBlind -> flooding) unless a saved failure is judged, so a non-fail verdict with
      // listUnreadable set has no reachable path; the line stays as belt and braces for any future verdict shape.
      if (listUnreadable && d.action !== 'fail') d = { ...d, unreviewed: true, reason: `${d.reason || 'passed'} - plus: the status-list read failed at the deadline, so the bb-review slot had no last look` };
      // v1.12.0 (W3): scan the ADDED lines of EVERY head for secret shapes before any verdict leaves this loop - not only
      // before the gate's own review request. A hit fails the gate (see after the loop) and withholds the request; a diff
      // that cannot be read is retried each poll (warned once) and, if still unread when the window ends, FAILS the gate (see after the loop); a file GitHub gave no patch
      // for (too large or binary) is named in a warning and skipped, the readable files are still scanned. An io without getPatches
      // predates the scan. Values are never printed.
      if (io.getPatches && scannedSha !== sha) {
        scanClear = false; scanHold = false; cmpHeld = 0; // round 14 (bb-review P3): the held-hit count belongs to ONE read of ONE head
        try {
          const patches = await retry(() => io.getPatches(pr.changedFiles, sha, pr.baseSha, elapsedMin >= maxMin / 2));
          const hits = scanSecrets(patches);
          const cmpWait = elapsedMin < maxMin && hits.length > 0 && hits.every((h) => h.cmp); // round 11 (bb-review P2): a hit seen ONLY in compare-only rows may be a lagging PR list or a moved base: re-read next poll, fail only at the deadline
          const after = await io.getPr(); // the head must not have moved while the diff was read, or the diff may belong to another commit
          if (after && after.sha && after.sha !== sha) throw new Error(`head moved from ${sha} to ${after.sha} while the diff was read`);
          if (!Array.isArray(patches)) throw new Error('diff unreadable'); // a bad read is retried, never recorded as scanned
          // v1.12.3: the hit is recorded FIRST, so nothing below (scanAllowedMarks, clean) can throw and leave a scanned-but-hit-less head
          if (hits.length && !cmpWait) secretHit = { sha, n: hits.length, kinds: [...new Set(hits.map((h) => h.kind))].join(', '), where: `${clean(hits[0].path)}:${hits[0].line}${hits[0].cmp ? ' - this line is in the head-pinned compare but NOT in the PR files list (a lagging list or a moved base): rebase onto the current main and push so the two lists agree, then the gate re-reads' : ''}${hits[0].history ? ' in an EARLIER commit of this PR - removing the line is not enough: rewrite the branch history or open a fresh branch, and rotate the secret' : ''}${!hits[0].history && hits.some((h) => h.history) ? ` (also ${hits.filter((h) => h.history).length} hit(s) in an EARLIER commit of this PR, first at ${clean(hits.find((h) => h.history).path)}:${hits.find((h) => h.history).line}: removing a line is not enough there, rewrite the branch history or open a fresh branch, and rotate the secret)` : ''}` };
          const gaps = patches.filter((f) => f && f.gap).map((f) => clean(f.path)); // v1.12.5: the commit history was not read completely: the gate fails after the loop
          scanGap = gaps.length ? { sha, why: gaps.slice(0, 3).join('; ') } : null; // a complete read clears an earlier gap
          const gapRetry = elapsedMin < maxMin && patches.some((f) => f && f.gap && f.readError); // a transient read error: scan this head again next poll while time remains
          scanMerged = patches.reduce((n, f) => n + (f && f.mergeSkipped ? Number(f.mergeSkipped) || 0 : 0), 0);
          const merges = scanMerged;
          if (merges > 0) warnOnce(`${merges} merge commit(s) in this PR were not read by the per-commit secret scan (a merge commit's diff is the base branch's own changes); a secret added while resolving a merge conflict and removed later would not be seen`);
          const big = patches.filter((f) => f && f.unscanned && !f.gap).map((f) => clean(f.path));
          scanSkipped = big.length; scanHold = patches.some((f) => f && f.unscanned && !f.notice && holdsRequest(f.path));
          const marks = scanAllowedMarks(patches); scanAllowed = marks.length;
          if (marks.length) warnOnce(`${marks.length} secret-shaped line(s) carry the ${SECRET_ALLOW_MARK} mark (${marks.slice(0, 5).map((m) => `${clean(m.path)}:${m.line}${m.history ? ' [earlier commit]' : ''}`).join(', ')}) - the pass is unreviewed so a person confirms each is a fake`);
          const byPath = secretScanSkippedPaths(patches).map(clean);
          if (byPath.length) warnOnce(`secret scan read only the high-confidence kinds and database URLs with passwords in ${byPath.length} test/fixture/example file(s): ${byPath.slice(0, 5).join(', ')}`);
          if (big.length) warnOnce(`secret scan skipped ${big.length} file(s) GitHub gave no diff for (too large or binary): ${big.slice(0, 5).join(', ')}`);
          if (cmpWait) { cmpHeld = hits.length;
            warnOnce(`${hits.length} secret-shaped line(s) appear only in the head-pinned compare, not in the PR files list (a lagging list or a moved base): re-reading next poll; the gate fails at the deadline if they persist`);
          } else if (hits.length) {
            warnings.push(`the diff holds ${hits.length} secret-shaped added line(s) (${secretHit.kinds}; e.g. ${secretHit.where}) - remove them, and on a branch with more than one commit a fix commit is NOT enough (the earlier commit is read too): rewrite the branch history so the line is gone; the review request is withheld and the gate fails; values are never printed; if one is real, ROTATE it - Devin's GitHub app may already have read the diff`);
          } else scanClear = true;
          if (!gapRetry && !cmpWait) scannedSha = sha; // set LAST: only a fully processed read counts as scanned; a transient failure above is retried on the next poll
        } catch (e) { const wk = sha + '|' + errStatus(e); if (!scanWarnedSet.has(wk)) { scanWarnedSet.add(wk); warnings.push(`could not read the diff to scan it for secrets (${errStatus(e)}; error text withheld, it can echo a credential); retrying each poll`); } }
      }
      if (d.nudge) {
        // Marker first, then the command alone on line 1 so Devin's trigger reads it. A failed post can have
        // landed (ambiguous timeout), so every RETRY re-lists comments and skips when this head's marker exists.
        let first = true;
        try {
          if (io.getPatches && scanClear && scanHold && !holdWarned) { holdWarned = true; warnings.push('the /devin review request is withheld: a file GitHub gave no diff for was not scanned for secrets (see the skipped-files warning)'); }
          if (io.getPatches && (!scanClear || scanHold)) throw new Error('secret scan did not clear this head');
          await retry(async () => {
            if (!first && hasNudge(await io.listComments(), sha)) return;
            first = false;
            await io.postComment(`/devin review\n\n${nudgeMarker(sha)}\n_devin-gate: no Devin Review status after ${nudgeMin} min; asking once._`);
          });
          io.log(`nudged Devin for ${sha.slice(0, 8)}`);
        } catch (e) { if (!/^secret scan did not clear/.test(String(e && e.message))) warnings.push(`could not post the Devin nudge (${errLine(e)})`); }
      }
      if (secretHit && secretHit.sha === sha && d.action !== 'fail') d = { action: 'fail', unreviewed: true, reason: `the diff holds ${secretHit.n} secret-shaped added line(s) (${secretHit.kinds}; e.g. ${secretHit.where}) - remove them, and on a branch with more than one commit a fix commit is NOT enough (the earlier commit is read too): rewrite the branch history so the line is gone (values are never printed); the review request was withheld; if one is a real credential, ROTATE it - the Devin GitHub app may already have read the diff` }; // v1.12.4: a hit is final for this head - no waiting out the window
      // a fail seen while the diff was still unread is sticky for this head: a later weaker poll (a flaky thread read) must not replace a red finding with a pass
      if (d.action === 'fail') failSeen = { sha, d }; else if (d.action === 'pass' && failSeen && failSeen.sha === sha && scannedSha !== sha) d = failSeen.d; // v1.12.2: sticky only while the diff is still unread - once it is scanned, the latest poll is judged (a resolved finding must not leave the gate red)
      if (d.action === 'fail' || (d.action !== 'wait' && !(io.getPatches && scannedSha !== sha && elapsedMin < maxMin))) { result = d; break; } // an unread diff keeps the loop polling until the window ends
      io.log(d.reason);
    } catch (e) {
      // An outage verdict rests on NO evidence: the record must not show a status read earlier as if it were the
      // basis (bb-review P3 - a pending-by-Devin line under an outage verdict reads like an attestation). Round 16:
      // inside the window apiOutage returns null and the poll goes on (the next poll re-reads everything from the PR
      // down); at the deadline it returns the FAIL.
      lastDevin = null; lastBb = null; lastThreads = undefined; lastBbContested = false;
      const outage = apiOutage(e);
      if (outage) { result = outage; break; }
    }
    await io.sleep(pollMs);
  }
  // v1.12.0 (W3): a secret-shaped line in the ADDED diff never passes green - the request was withheld, so nothing reviewed it.
  // (An unreadable diff is not a hit, but it fails the gate below: a check that could not run must not pass.)
  if (secretHit && secretHit.sha === sha && result.action !== 'fail') {
    result = { action: 'fail', unreviewed: true, reason: `the diff holds ${secretHit.n} secret-shaped added line(s) (${secretHit.kinds}; e.g. ${secretHit.where}) - remove them, and on a branch with more than one commit a fix commit is NOT enough (the earlier commit is read too): rewrite the branch history so the line is gone (values are never printed); the review request was withheld` };
  }
  // v1.12.5: a commit history the scan could not read COMPLETELY never passes (unreadable commit list or commit, or more than 50 commits): a check that could not run must not pass.
  if (io.getPatches && !draftExit && result.action === 'pass' && scanGap && scanGap.sha === sha && !(secretHit && secretHit.sha === sha)) {
    result = { action: 'fail', unreviewed: true, reason: `the secret scan could not read the whole commit history (${scanGap.why}) - failing, a check that could not run must not pass; ${/3000 or more files/.test(scanGap.why) && /oldest|250 commits/.test(scanGap.why) ? 'two gaps: split any commit that changes 3000 or more files AND squash the branch into 50 commits or fewer, or open a fresh branch' : /3000 or more files/.test(scanGap.why) ? 'rewrite the branch so no single commit changes 3000 or more files (split it), or open a fresh branch' : 'squash the branch into 50 commits or fewer (a plain rebase keeps every commit), or open a fresh branch; the sweep re-runs this gate after a read error, but with more than 50 commits the only fix is to squash'}` };
  }
  // A pass whose scan never completed (diff unreadable on every poll, or a file GitHub gave no patch for) is an unreviewed pass.
  if (io.getPatches && !draftExit && result.action === 'pass' && !(secretHit && secretHit.sha === sha) && !scanClear && scannedSha !== sha) {
    result = { action: 'fail', unreviewed: null, reason: cmpHeld ? 'the diff holds ' + cmpHeld + ' secret-shaped line(s) that appear only in the head-pinned compare, not in the PR files list (a lagging list or a moved base): rebase onto the current main and push so the two lists agree, then the gate re-reads; if one is a real credential, ROTATE it and rewrite the branch history (the Devin GitHub app may already have read the diff); no /devin review request was posted' : 'the secret scan could not read the diff before the window ended - failing, a check that could not run must not pass; the sweep re-runs this gate' };
  }
  if (io.getPatches && !draftExit && result.action === 'pass' && !(secretHit && secretHit.sha === sha) && (!scanClear || scanSkipped > 0 || scanAllowed > 0 || scanMerged > 0)) {
    result = { ...result, unreviewed: true, reason: (result.reason ? result.reason + '; ' : '') + (!scanClear ? 'secret scan could not read the diff' : scanSkipped > 0 ? `secret scan skipped ${scanSkipped} file(s) GitHub gave no diff for` : scanAllowed > 0 ? `${scanAllowed} secret-shaped line(s) carry the ${SECRET_ALLOW_MARK} mark` : `${scanMerged} merge commit(s) not read by the secret scan`) + ' - passing as unreviewed' };
  }
  if (result.action === 'pass') {
    // A hold Sam adds while this run was deciding must not leave a green check behind it: re-read once just before passing.
    // A failed re-read FAILS (v1.9.1, Devin SEC_ on universal-auth #27): under an outage no PR read may ever have
    // succeeded, so nothing proves the PR is not held (since round 16 the outage itself fails at the deadline; this
    // re-read guards the pass path on its own). The sweep re-runs a failed gate on a PR that is not held.
    try { if (isHeld(await retry(() => io.getPr()))) result = { action: 'fail', unreviewed: null, reason: HELD_REASON }; } catch (e) {
      const msg = `could not re-read the PR for a hold before passing (${errLine(e)}) - failing: a hold cannot be ruled out; the sweep re-runs this gate`;
      warnings.push(msg);
      result = { action: 'fail', unreviewed: null, reason: msg };
    }
  }
  // unreviewed === null is no longer produced by decide(); kept as a guard for a caller that wants to leave the label alone.
  try { if (result.unreviewed !== null) await retry(() => io.setLabel(!!result.unreviewed)); } catch (e) { warnings.push(`could not update the ${LABEL} label (${String(e?.message || e).split('\n')[0]})`); }
  // v1.11.0: who vouched for this verdict, in the job log and the return value (the step summary prints it too).
  const provenance = buildProvenance({ pr: lastPr, sha, devin: lastDevin, bbReview: lastBb, threads: lastThreads, findings: result.findings, reviewCommit: cfg.reviewCommit, bbContested: lastBbContested });
  io.log(provenanceLine(provenance));
  return { result, sha, elapsedMin: (io.now() - t0) / 60000, warnings, provenance };
}

// ---- GitHub I/O (only runs when invoked directly) ----------------------------------------

// The blocking query is unchanged: it decides what fails. v1.11.0's enriched variant adds originalCommit
// (the sha the finding was posted on) and pullRequestReview (its id + url) - provenance only. getThreads
// tries the enriched query first and falls back to this one on ANY failure (a field GitHub rejects must
// never silence the blocking read - bb-review P3).
const THREADS_Q = 'query($o:String!,$n:String!,$p:Int!,$a:String){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100,after:$a){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated path line comments(first:1){nodes{author{login} body url}}}}}}}';
const THREADS_Q_PROV = 'query($o:String!,$n:String!,$p:Int!,$a:String){repository(owner:$o,name:$n){pullRequest(number:$p){reviewThreads(first:100,after:$a){pageInfo{hasNextPage endCursor} nodes{isResolved isOutdated path line comments(first:1){nodes{author{login} body url originalCommit{oid} pullRequestReview{databaseId url}}}}}}}}';

/**
 * Every request gets an AbortSignal timeout: min(requestTimeoutMs, time left in the gate window).
 * `deadlineMs` (absolute epoch ms) is the end of that window; past it each request gets a 1 s budget so
 * retries fail fast and the deadline verdict is reached long before the job timeout.
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
    if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}`); // v1.12.2: the response body is never read into the error - GitHub can echo a patch or credential, and apiOutage / warnings print this message
    return r.status === 204 ? null : await r.json();
    } finally { clearTimeout(timer); }
  };
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  return {
    api,
    getPr: async () => { const p = await api('GET', `/repos/${repo}/pulls/${pr}`); return { baseSha: p.base?.sha || '', sha: p.head.sha, draft: !!p.draft, headRef: p.head.ref, author: p.user?.login || '', changedFiles: p.changed_files, title: p.title || '', labels: (p.labels || []).map((l) => l.name) }; },
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
    // v1.12.0: the per-file unified diffs for the secret scan. Same paging and completeness rules as getFiles: a partial read
    // THROWS (the caller retries next poll). A single file with no patch (too large) is flagged `unscanned`, never read as clean.
    // With (sha, baseSha) the diff is read from the compare API pinned to that commit, so it cannot be a lagging copy of another head.
    // v1.12.4: the NET diff plus the diff of every non-merge commit of the PR (every kind, judged like the net diff, see scanSecrets), so a secret added in one commit and removed in a later one is still read.
    // Per commit: every page of its files (a patch-less file is flagged unscanned like the net read). A commit's read is cached by sha (commits are immutable), so a retry re-reads only what failed.
    // A failed read THROWS (retried next poll) until the second half of the window; then the history is flagged unscanned (unreviewed pass, request withheld). Over 50 commits: the oldest are named in a NOTICE row (unreviewed pass, request NOT held); a list of 250 (GitHub's cap) holds.
    getPatches: async function (expectedCount, sha, baseSha, fallbackOk) {
      const net = await this.getNetPatches(expectedCount, sha, baseSha, fallbackOk);
      if (!sha || !Array.isArray(net)) return net;
      const cc = (this._commitCache ||= new Map());
      const gap = (why, readError) => ({ path: `(per-commit history: ${why})`, patch: '', unscanned: true, history: true, gap: true, readError: !!readError }); // v1.12.5: gap = the history was not read completely - the gate FAILS on it (a file without a patch is not a gap)
      let commits;
      try { commits = []; for (let pg = 1; pg <= 3; pg++) { const one = await api('GET', `/repos/${repo}/pulls/${pr}/commits?per_page=100&page=${pg}`); if (!Array.isArray(one)) throw new Error('pull commits unreadable'); commits.push(...one); if (one.length < 100) break; } if (commits.length < 250 && (!commits.length || !commits.some((x) => x && x.sha === sha))) throw new Error('pull commits list does not end at the head (lagging copy; retried next poll)'); } catch (e) { if (!fallbackOk) throw e; return [...net, gap('could not be read', true)]; }
      const keyOf = (f) => (f.gap ? 'G' : f.unscanned ? 'U' : 'S') + LF + f.path + LF + f.patch; const seen = new Set(net.filter((f) => !f.cmpOnly).map(keyOf)); const extra = [];
      const isMerge = (c) => Array.isArray(c?.parents) && c.parents.length > 1;
      const real = commits.filter((c) => !isMerge(c)); // v1.12.5 (bb-review P3): merge commits are never read, so they count toward neither the 50-commit limit nor the newest-50 slice
      const mergesSkipped = commits.length - real.length;
      for (const c of commits.length === 1 ? [] : real.slice(-HISTORY_MAX_COMMITS)) { // one commit: the net diff IS that commit, so no extra reads (most PRs)
        if (!c || !c.sha) continue;
        let rows = cc.get(c.sha);
        if (!rows) {
          try {
            rows = [];
            for (let page = 1; page <= 30; page++) {
              const one = await api('GET', `/repos/${repo}/commits/${c.sha}?per_page=100&page=${page}`);
              if (!one || !Array.isArray(one.files)) throw new Error('commit files unreadable');
              for (const f of one.files) { if (typeof f.patch === 'string' && f.patch) rows.push({ path: f.filename, patch: f.patch, unscanned: false, history: true }); else if (fileUnscanned(f)) rows.push({ path: f.filename, patch: '', unscanned: true, history: true }); }
              if (one.files.length < 100) break;
              if (page === 30) rows.push(gap('a commit lists 3000 or more files; GitHub shows no more, so the rest of it was not read')); // round 15 (Devin SEC red): a secret added in the unread files and removed later would escape, so this FAILS like the 50-commit gap; bounded, not permanent (round 8 P2): split the commit (or open a fresh branch) and the gate re-reads
            }
            cc.set(c.sha, rows);
          } catch (e) { if (!fallbackOk) throw e; extra.push(gap('a commit could not be read', true)); continue; }
        }
        for (const r of rows) { const key = keyOf(r); if (seen.has(key)) continue; seen.add(key); extra.push(r); }
      }
      if (commits.length >= 250) extra.push(gap('GitHub lists at most 250 commits; the newest may be unread')); // v1.12.5: fails the gate, like every gap
      else if (real.length > HISTORY_MAX_COMMITS) extra.push(gap('the ' + (real.length - HISTORY_MAX_COMMITS) + ' oldest of ' + real.length + ' commits were not read (newest ' + HISTORY_MAX_COMMITS + ' were); squash the branch into ' + HISTORY_MAX_COMMITS + ' commits or fewer (a plain rebase keeps every commit and does not help)')); // bounds the API calls per run (about 50 + pages); v1.12.5: no longer a notice that passes
      if (mergesSkipped > 0) extra.push({ path: `(${mergesSkipped} merge commit(s) not read)`, patch: '', unscanned: false, history: true, mergeSkipped: mergesSkipped });
      return [...net, ...extra];
    },
    getNetPatches: async (expectedCount, sha, baseSha, fallbackOk) => {
      const all = [];
      let n = 0;
      let cmpFallback = []; // v1.12.5 (bb-review P2): when the compare and the PR list disagree late in the window, the compare (pinned to the head) is still scanned, together with the PR list
      // The compare API lists changed files on ONE response, up to 300 (it pages commits, not files): use it only for a PR that fits, else the PR files list.
      if (sha && baseSha && typeof expectedCount === 'number' && expectedCount > 0 && expectedCount <= 300) {
        let cmp;
        try { cmp = await api('GET', `/repos/${repo}/compare/${baseSha}...${sha}`); } catch (e) { if (!fallbackOk) throw e; cmp = null; } // a transient failure THROWS (retried next poll) until the second half of the window, then falls back
        // a compare that comes back short (or fails late in the window) falls through to the PR files list, which marks itself unpinned (unreviewed pass) - never a permanent fail
        if (cmp && Array.isArray(cmp.files) && cmp.files.length !== expectedCount && !fallbackOk) throw new Error(`compare lists ${cmp.files.length} files, the PR says ${expectedCount} (retried next poll)`);
        // v1.12.2 (Devin SEC_): an equal COUNT does not prove the same FILES - when the base has moved, the compare can list other paths. Require the compare's names to equal the PR's own file list (the merge-base diff) before trusting it.
        // round 6 (bb-review P2): whenever the compare has files and the code falls through to the PR list (count differs late, PR-files read failed late, or the lists disagree), the head-pinned compare is scanned too
        if (cmp && Array.isArray(cmp.files)) cmpFallback = cmp.files.map((f) => ({ path: f.filename, patch: typeof f.patch === 'string' ? f.patch : '', unscanned: fileUnscanned(f) }));
        if (cmp && Array.isArray(cmp.files) && cmp.files.length === expectedCount) {
          const want = new Set(); let prFiles;
          try {
            prFiles = [];
            for (let page = 1; page <= 4; page++) { const b = await api('GET', `/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`); if (!Array.isArray(b)) throw new Error('pull files unreadable'); prFiles.push(...b); if (b.length < 100) break; }
            if (prFiles.length !== expectedCount) throw new Error(`pull files list ${prFiles.length} files, the PR says ${expectedCount} (a 300-file compare may hide more)`); // v1.12.2 (Devin SEC_): the compare caps at 300, so a 4th page proves nothing extra exists
          } catch (e) { if (!fallbackOk) throw e; prFiles = null; }
          if (prFiles) { for (const f of prFiles) want.add(f.filename); const got = new Set(cmp.files.map((f) => f.filename)); let same = want.size === got.size && [...want].every((x) => got.has(x)); if (!same && !fallbackOk) throw new Error('compare lists different files than the PR (retried next poll)');
            // v1.12.5 (Devin SEC_): the same FILE NAMES do not prove the same CHANGES - when the base moved, the compare can show other added lines for the same path (a credential in the PR vanishes from the scan). Each file's added lines must equal the PR's merge-base diff.
            // a file the PR list gives NO patch for (too large) has no merge-base lines to compare, so it is skipped here (its compare lines are scanned as usual)
            if (same) { const sig = (patch) => (typeof patch === 'string' ? patch.split('\n').filter((l) => l.startsWith('+')).join('\n') : ''); const byName = new Map(prFiles.map((f) => [f.filename, sig(f.patch)])); const hasPatch = new Set(prFiles.filter((f) => typeof f.patch === 'string').map((f) => f.filename)); same = cmp.files.every((f) => !hasPatch.has(f.filename) || byName.get(f.filename) === sig(f.patch)); if (!same && !fallbackOk) throw new Error('compare shows other added lines than the PR (retried next poll)'); } if (same) return cmp.files.map((f) => ({ path: f.filename, patch: typeof f.patch === 'string' ? f.patch : '', unscanned: fileUnscanned(f) })); cmpFallback = cmp.files.map((f) => ({ path: f.filename, patch: typeof f.patch === 'string' ? f.patch : '', unscanned: fileUnscanned(f) })); }
        }
      }
      // round 10: every compare row that the PR files list does not show identically is scanned (a force-pushed head the list still lags must not hide a credential); it is tagged cmpOnly so a hit names the cause and the fix (a moved base: rebase onto the current main, then the two lists agree)
      // round 14 (bb-review P3): an added line the PR files list ALREADY shows for the same path is scanned there, so the compare copy turns it into a context line - one credential is one hit. Every other compare line stays added (never dropped by text from a source that is not scanned).
      const addCmp = () => { for (const c of cmpFallback) {
        if (all.some((r) => r.path === c.path && r.patch === c.patch && r.unscanned === c.unscanned)) continue;
        let patch = c.patch;
        const prev = all.filter((r) => r.path === c.path && !r.cmpOnly && !r.unscanned && typeof r.patch === 'string' && r.patch);
        if (patch && prev.length) {
          const have = new Set(); for (const r of prev) for (const l of r.patch.split('\n')) if (l.startsWith('+')) have.add(l);
          patch = patch.split('\n').map((l) => (l.startsWith('+') && have.has(l) ? ' ' + l.slice(1) : l)).join('\n');
          if (!patch.split('\n').some((l) => l.startsWith('+'))) continue;
        }
        all.push({ ...c, patch, cmpOnly: true });
      } };
      for (let page = 1; page <= FILES_PAGE_LIMIT; page++) {
        const batch = await api('GET', `/repos/${repo}/pulls/${pr}/files?per_page=100&page=${page}`);
        if (!Array.isArray(batch)) throw new Error('pull files unreadable');
        for (const f of batch) {
          n++;
          // GitHub omits `patch` for binaries (changes 0) AND for oversized diffs (changes > 0): the latter was never scanned.
          const row = { path: f.filename, patch: typeof f.patch === 'string' ? f.patch : '', unscanned: fileUnscanned(f) };
          all.push(row);
        }
        if (batch.length < 100) {
          if (typeof expectedCount === 'number' && expectedCount !== n) throw new Error(`pull files incomplete: read ${n} of ${expectedCount}`);
          // the PR files list is not tied to a commit (over 300 files, or no base sha): it may lag the head, so the pass cannot count as reviewed
          addCmp();
          if (sha) all.push({ path: '(file list is not pinned to the head commit)', patch: '', unscanned: true }); // the gate always passes a sha
          return all;
        }
      }
      // GitHub lists at most FILES_PAGE_LIMIT * 100 files: scan what was read and flag the rest, so a huge PR is an unreviewed pass (never stuck), not a permanent fail
      addCmp();
      all.push({ path: `(files beyond the ${FILES_PAGE_LIMIT * 100} GitHub lists)`, patch: '', unscanned: true });
      return all;
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
    // v1.11.0: the same latest-per-context statuses from the LIST endpoint, which (unlike the combined read)
    // carries creator/id/created_at/target_url - reviewer provenance, and the data devinVerdict needs to refuse
    // a "Devin Review" status Devin's app never posted. Latest per context = first occurrence (newest first).
    // Stops early once Devin is found and the bb-review slot is RESOLVED: a trusted entry seen, a foreign entry on top
    // with a trusted one found beneath, or - with no expectBb hint - no bb-review at all. Bounded at 3 pages; 10
    // (deep, the default) while the bb-review slot is unresolved (round 7: a flood of foreign statuses must not be
    // able to push the real verdict out of reach cheaply; round 8: the same for a bb-review the combined read saw or
    // may be hiding - expectBb - so a trusted SUCCESS beyond page 3 is found, not flagged). _listCapped marks ONLY a
    // cap reached with the bb-review slot unresolved; Devin alone unseen is _truncated. The caller fails a bb-review
    // verdict it could not read (status flooding, Devin SEC on CT #890). deep:false (round 8) is the cheap
    // between-polls read: it caps at 3 pages and flags the unresolved slot for the next deep read to settle.
    getStatusDetails: async (sha, { expectBb = false, deep = true } = {}) => {
      const latest = {};
      let lastFull;
      let capped = false;
      let bbUnresolved;
      for (let page = 1; ; page++) {
        const list = await api('GET', `/repos/${repo}/commits/${sha}/statuses?per_page=100&page=${page}`);
        if (!Array.isArray(list)) throw new Error('status list unreadable');
        for (const s of list) {
          // Contexts starting with '_' are reserved for this map's internal markers (_trustedBb,
          // _truncated, _bbUnverifiable): a status literally named '_trustedBb' must never occupy the slot
          // meant for the newest trusted bb-review entry (bb-review P1).
          if (!s || !s.context || s.context.startsWith('_')) continue;
          const entry = { state: s.state, description: s.description || '', id: s.id ?? null, creator: s.creator?.login ?? null, created_at: s.created_at || '', target_url: s.target_url || '' };
          // creator null = the API read the status but names no poster (deleted/ghost account): provably
          // NOT Devin's, which is different from `undefined` (the list never echoed this context at all).
          if (!latest[s.context]) latest[s.context] = entry;
          // The newest bb-review by a TRUSTED poster too (newest first = first match): a foreign "success"
          // on top must not hide the real verdict the review harness posted (bb-review P2).
          if (s.context === BB_REVIEW_CONTEXT && !latest._trustedBb && isBbReviewPoster(entry.creator)) latest._trustedBb = entry;
        }
        lastFull = list.length === 100;
        // Keep paging while the bb-review slot is unresolved: the newest bb-review is foreign and no trusted-poster
        // entry has been found (bb-review P2), or a bb-review is expected (the combined read saw one, or was full
        // and may hide one - round 8) and none has been seen yet. The real verdict may sit deeper in the list.
        const bb = latest[BB_REVIEW_CONTEXT];
        bbUnresolved = bb ? (!latest._trustedBb && !isBbReviewPoster(bb.creator)) : expectBb;
        if (!lastFull || (latest[STATUS_CONTEXT] && !bbUnresolved)) break;
        if (page >= (bbUnresolved && deep ? 10 : 3)) { capped = true; break; }
      }
      // Round 8: the cap flag is about the bb-review slot only - Devin alone unseen is _truncated (below).
      if (capped && bbUnresolved) latest._listCapped = true;
      // Page cap reached with the Devin context still unseen: a legitimate reviewer status may sit beyond
      // what was read. Flag it - the caller marks that context unattributable and warns, rather than
      // guessing. bb-review absent is routine (it only exists on reviewed pushes), so it never flags alone.
      if (lastFull && !latest[STATUS_CONTEXT]) latest._truncated = true;
      // Cap reached with a foreign bb-review on top and no trusted entry found: the real verdict is
      // unattributable, not absent - the caller warns rather than silently trusting the top entry.
      if (lastFull && latest[BB_REVIEW_CONTEXT] && !latest._trustedBb && !isBbReviewPoster(latest[BB_REVIEW_CONTEXT].creator)) latest._bbUnverifiable = true;
      return latest;
    },
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
      let prov = true; // enriched query first; a rejected field degrades to the base query, blocking intact
      for (let page = 0; page < THREAD_PAGE_LIMIT; page++) {
        let r;
        try {
          r = await api('POST', '/graphql', { query: prov ? THREADS_Q_PROV : THREADS_Q, variables: { o: owner, n: name, p: pr, a: after } });
        } catch (e) {
          if (prov) { prov = false; page--; continue; }
          throw e;
        }
        const rt = r?.data?.repository?.pullRequest?.reviewThreads;
        if (!rt || !Array.isArray(rt.nodes)) {
          if (prov) { prov = false; page--; continue; } // a field-error response is not an unreadable list
          throw new Error(`graphql reviewThreads unreadable: ${JSON.stringify(r?.errors || r).slice(0, 200)}`);
        }
        for (const t of rt.nodes) {
          const c = t.comments?.nodes?.[0];
          out.push({ isResolved: !!t.isResolved, isOutdated: !!t.isOutdated, path: t.path, line: t.line, author: c?.author?.login || '', body: c?.body || '', url: c?.url || '', commit: c?.originalCommit?.oid || null, reviewId: c?.pullRequestReview?.databaseId ?? null, reviewUrl: c?.pullRequestReview?.url || '' });
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
 * The bb-review verdict as the gate would judge it: the raw entry unless the list proves its newest poster
 * is NOT the review harness, in which case the newest trusted-poster entry (or none) is judged instead.
 * Only worth a list read when the raw entry is a failure - the only state callers act on. A failed read
 * leaves the raw entry standing (fail-closed for the sweep, which would otherwise stop re-running).
 */
async function trustedBbReview(io, sha, raw) {
  if (!raw || !/^(failure|error)$/i.test(raw.state || '') || typeof io.getStatusDetails !== 'function') return raw;
  try {
    const det = await io.getStatusDetails(sha, { expectBb: true });
    const d = det && det[BB_REVIEW_CONTEXT];
    if (!d || d.creator === undefined) return raw;
    // The list's newest entry must BE the raw one before it can set it aside: a lagging read that shows a
    // different entry on top leaves the live failure standing (bb-review P2). Same rule the gate applies.
    const same = raw.id != null && d.id != null ? d.id === raw.id : (d.state === raw.state && d.description === (raw.description || ''));
    // Failures block whoever posted them (fail closed); only a foreign NON-failure yields to _trustedBb.
    if (!same || isBbReviewPoster(d.creator) || /^(failure|error)$/i.test(d.state || '')) return raw;
    return det._trustedBb || null;
  } catch { return raw; }
}

/**
 * Pure. Should the latest devin-gate run be re-run now?
 *   run      {status, conclusion, run_attempt, id} of the newest devin-gate run on the head
 *   bbReview {state}|null;  threads = review threads (null = unreadable)
 *   corrected = newest sweep-corrected marker {at, fp, ev?, trail, lastFp} (null = none found; undefined = comment list unreadable)
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
  // read fails (the former outage pass; since round 16 an outage fails at the deadline), so the re-run honours the same attempt cap + cooldown as every other stale-green
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
      // The marker suppresses only a repeat on the SAME evidence: a new bb-review failure (a new status id) on
      // unchanged threads is new evidence and fires now, not after the cooldown (BB_Tools #216). A pre-#216
      // marker carries no ev and keeps the fingerprint-only match. Only a NEW failure counts: bb-review going
      // green (ev back to 'threads') is not new evidence. The bypass honours the attempt cap like every other
      // repeat - bb-review re-posting failures under fresh ids must not re-run the gate every tick.
      const ev = sweepEvidence(bbReview);
      const newEvidence = !!corrected && corrected.ev !== undefined && corrected.ev !== ev && ev.startsWith('bb:');
      if (corrected && corrected.fp === fp && !(newEvidence && !cooling) && !moved && nowMs - corrected.at < SWEEP_COOLDOWN_MS) {
        if (newEvidence) return { rerun: false, why: `a new bb-review failure since the last correction, but the run has ${run.run_attempt} attempts - cooling down (one retry per hour)` };
        // A partial trail-status history cannot prove nothing moved - the move may sit beyond what was
        // read, and a reopened red finding must not stay mergeable under a stale green (Devin, BMB #985 /
        // CT #791 / BB_Scan #35). Re-judging is always safe: the new run reads live threads. Repeats are
        // bounded by the same attempt cap the retryable path honours - a persistent status-API outage
        // fires at most SWEEP_MAX_ATTEMPTS corrections, then once per cooldown.
        if (corrected.historyIncomplete && !cooling) return { rerun: true, full: true, corrected: true, fp, ev, why: `${staleWhy}: the trail-status history is incomplete - re-judging rather than trusting a partial read` };
        if (corrected.historyIncomplete) return { rerun: false, why: `trail-status history incomplete and the run has ${run.run_attempt} attempts - cooling down (one retry per hour)` };
        return { rerun: false, why: `stale-green correction against this same thread state fired ${((nowMs - corrected.at) / 60000).toFixed(0)} min ago; cooling down (one retry per hour)` };
      }
      return { rerun: true, full: true, corrected: true, fp, ev, why: `${staleWhy}: the green gate is stale` };
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
    // v1.10.2: set when a disarm leaves no record and no re-arm note - lifting the hold would then never ask for the re-arm.
    let disarmNote = '';
    let rearm = false;
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
      if (held && p.auto_merge !== null) {
        // v1.10.2 (bb-review first-push P2): once the mutation succeeded, an error escaping the record step is a lost record,
        // never "retried next tick" - the next tick sees the PR unarmed and skips it.
        let disarmed = false;
        try {
          const live = await io.api('GET', `/repos/${repo}/pulls/${p.number}`);
          if (!live || !isHeld({ title: live.title, labels: live.labels }) || !live.auto_merge) {
            disarmNote = ' - hold lifted or auto-merge off on re-read: auto-merge left alone';
          } else {
            const r = await io.api('POST', '/graphql', { query: DISARM_Q, variables: { id: live.node_id || p.node_id } }).catch((e) => ({ errors: [{ message: errLine(e) }] }));
            const method = live.auto_merge.merge_method || 'squash';
            const readLive = () => io.api('GET', `/repos/${repo}/pulls/${p.number}`);
            let after;
            let ours = true;
            if (!r || r.errors || !r.data || !r.data.disablePullRequestAutoMerge) {
              // v1.10.2 (Devin, BB_Tools #273), as HOLD MODE: the mutation may have landed with its response lost, or a
              // hold-disarm job beat it. Re-read: still armed -> a real failure, retried next tick (green); auto-merge off ->
              // settled below like a disarm; unreadable -> it cannot be told, so the job goes red (the next tick would see
              // the PR unarmed and skip it, leaving no record).
              const failed = `disablePullRequestAutoMerge: ${JSON.stringify((r && r.errors) || r).slice(0, 200)}`;
              const again = await io.api('GET', `/repos/${repo}/pulls/${p.number}`).catch(() => null);
              if (!again) {
                rearm = true;
                disarmNote = ` - auto-merge disarm failed and the PR could not be re-read (${failed}): if it is unarmed it has no disarm record, a re-arm may be needed`;
                throw Object.assign(new Error(failed), { noted: true });
              }
              if (again.auto_merge) throw new Error(failed);
              disarmed = true;
              disarmNote = ' - auto-merge was already off (another hold job disarmed it, or our response was lost)';
              after = again;
              ours = false;
            } else {
              disarmed = true;
              disarmNote = ' - auto-merge disarmed (held)';
              after = await io.api('GET', `/repos/${repo}/pulls/${p.number}`).catch(() => null);
            }
            if (after && !isHeld({ title: after.title, labels: after.labels })) {
              // v1.10.0: a fresh id that names no record, so this late note can never close a newer hold's record.
              disarmNote = ` - auto-merge disarmed, but the hold was lifted meanwhile: re-arm (${method}) requested on the PR`;
              try {
                disarmNote += await postLiftNote(io, readLive, { method, id: newId(), armed: false, sleep, backoffMs, newId });
              } catch (e) { rearm = true; disarmNote = ` - auto-merge disarmed, but the hold was lifted meanwhile and the re-arm note could not be settled (${errLine(e)}): re-arm (${method}) needed`; }
            } else {
              // v1.9.2 (Devin, CalExp5 #763 / BB_Tools #269): the record lets the hold job that sees the hold lifted ask for
              // the re-arm; settleDisarm retries it and settles a hold lifted while it was written.
              // Auto-merge found already off: another job's disarm gets a record only when none is open yet (that job posts
              // its own); the comments are read with retries, and unreadable -> recorded anyway (duplicate > lost).
              try {
                let open = null;
                if (!ours) open = await withRetries(() => io.listComments(), { sleep, backoffMs }).then(openDisarmRecord, () => null);
                disarmNote += await settleDisarm(io, readLive, method, { record: !open, id: open ? open.id : undefined, sleep, backoffMs, newId });
              } catch (e) { rearm = true; disarmNote = ` - ${errLine(e)}: a re-arm may be needed`; }
            }
          }
        } catch (e) {
          if (e && e.noted) { /* disarmNote and rearm already set */ }
          else if (disarmed) { rearm = true; disarmNote = ` - auto-merge disarmed, but its record step failed (${errLine(e)}): a re-arm may be needed`; }
          else disarmNote = ` - auto-merge disarm FAILED, retried next tick (${errLine(e)})`;
        }
      }
      // pull_request_review runs record the PR head sha; pull_request_target's head_sha is UNVERIFIED (the workflow is not on main yet),
      // so also match by the PR association GitHub attaches to the run (findGateRuns).
      const run = (await findGateRuns(io.api, repo, p))[0] || null;
      const stale = run && run.status === 'completed' && (run.conclusion === 'success' || RETRYABLE_CONCLUSIONS.has(run.conclusion));
      if (!stale) { out.push({ pr: p.number, rerun: false, rearm, head: String(p.head?.sha || '').slice(0, 8), author: p.user?.login || '', why: sweepDecision({ run, nowMs }).why + disarmNote }); continue; }
      const statuses = await io.getStatuses(sha);
      // The sweep judges the same trusted-poster bb-review evidence the gate does: a foreign 'failure' must
      // not strand a PR red. (A foreign 'success' hiding a deeper failure is the backstop gap the list cap
      // leaves - bounded, and the gate's own run is unaffected.)
      const bbReview = await trustedBbReview(io, sha, statuses.find((s) => s.context === BB_REVIEW_CONTEXT) || null);
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
        if (d.corrected) { try { await io.postComment(`_devin-gate: the latest green verdict is stale (${d.why}); re-running the check._\n\n${sweepCorrectedMarker(run.id, new Date(nowMs).toISOString(), d.fp, d.ev)}`); } catch (e) { d.why += ` (correction marker failed: ${errLine(e)})`; } }
      } else if (breadcrumbErr) { d.why += ` (state trail write failed: ${errLine(breadcrumbErr)})`; }
      out.push({ pr: p.number, rerun: d.rerun, rearm, head: String(p.head?.sha || '').slice(0, 8), author: p.user?.login || '', why: d.why + disarmNote });
    } catch (e) { out.push({ pr: p.number, rerun: false, rearm, head: String(p.head?.sha || '').slice(0, 8), author: p.user?.login || '', why: `error: ${errLine(e)}${disarmNote}` }); }
  }
  // v1.11.0: head sha + implementer on every sweep line - the record says which exact commit was re-judged.
  for (const o of out) log(`sweep #${o.pr}${o.head ? ` ${o.head}` : ''}${o.author ? ` @${o.author}` : ''}: ${o.rerun ? 'RE-RAN' : 'skip'} - ${o.why}`);
  // v1.10.2: a disarm with no record ends the job red, as HOLD MODE does - after every PR is processed.
  const lost = out.filter((o) => o.rearm);
  if (lost.length) {
    const err = new Error(`sweep: auto-merge disarmed on held PR(s) ${lost.map((o) => '#' + o.pr).join(', ')} with no disarm record or re-arm note on the PR - lifting the hold will not ask for the re-arm: a re-arm may be needed`);
    err.sweepOut = out;
    throw err;
  }
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
  // No provenance check needed here: a bb-review failure blocks whoever posted it (the gate honours it the
  // same way), so every failure event earns the re-run. Poster filtering applies only to non-failures.
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
    const cfg = { nudgeMin: envMinutes(env.DEVIN_GATE_NUDGE_MIN, NUDGE_MIN_DEFAULT), maxMin: envMinutes(env.DEVIN_GATE_MAX_MIN, MAX_MIN_DEFAULT), pollS: envMinutes(env.DEVIN_GATE_POLL_S, POLL_S_DEFAULT), reviewCommit: env.REVIEW_COMMIT || '', evidenceMaxAgeH: envMinutes(env.DEVIN_GATE_EVIDENCE_MAX_AGE_H, EVIDENCE_MAX_AGE_H_DEFAULT) };
    const io = githubIo(env, fetch, { deadlineMs: Date.now() + (cfg.maxMin + 1) * 60000 });
    const { result, sha, elapsedMin, warnings, provenance } = await runGate(io, cfg);
    const md = summaryMarkdown({ sha, result, elapsedMin, warnings, provenance });
    console.log(md);
    if (env.GITHUB_STEP_SUMMARY) { try { appendFileSync(env.GITHUB_STEP_SUMMARY, md); } catch { /* summary is best effort */ } }
    for (const w of warnings) console.log(`::warning title=devin-gate::${w}`);
    if (result.action === 'fail') { console.log(`::error title=devin-gate::${result.reason}`); process.exit(1); }
  }
}
