#!/usr/bin/env node
// BB_Tools | guardrails/check-pr-body.mjs | v1.7.0 | 2026-10-02 | BB
// CANONICAL. Every managed repo carries a byte-identical copy at scripts/check-pr-body.mjs;
// edit THIS file, then `node sync-guardrails.mjs --pr` (BB_Tools). Run by pr-body-lint.yml.
//
// AGENTS.md §7: every PR body carries a "Searched first:" line naming what the §12 brain
// search found and whether it was reused. Measured 2026-09-30
// (REPORTS/BRAIN_USEFULNESS_CHECK_2026-09-30.md): 343 of 554 merged PRs (62%) had no
// such line, so reuse could not be measured. A rule only an agent's memory enforces is
// not enforced; this makes it a check.
//
// What counts: "Searched first:" followed on the same line by the answer, or a
// "## Searched first" heading with the answer under it — at least MIN_CONTENT characters
// that are not a template placeholder. "Searched first: n/a" is not a disclosure.
// The cloud-agent wording AGENTS.md §12 asks for ("cross-repo search unavailable,
// grepped this repo") passes — the check asks for the line, not for a particular answer.
//
// v1.7.0 — the line must also be TRUE and OWN (REPORTS/BRAIN_USEFULNESS_CHECK_2026-10-02.md):
//   - "brain search not available" is accepted only from a cloud agent (Devin). CT #752-754 said it
//     from Sam's machine, where the brain is always reachable (the agent behind #753 had even called it).
//   - a line identical to an OLDER PR's in the same repo fails: BMB #927-931 carried one sentence
//     five times. The sync-guardrails line is generated on purpose and is the one allowed repeat —
//     only inside a generated sync body (its begin marker), not when an ordinary PR reuses the sentence.
//   - the repeat check FAILS CLOSED in CI (REVIEW.md "gates must fail closed", Devin on #197): a PR
//     list that cannot be read after one retry, or a missing token/PR number, is exit 1, never a pass.
//     It pages past PRs newer than this one and compares the OLDER_LIMIT nearest older PRs.
//
// Exit 0 = present (or an exempt dependency bot), 1 = missing, empty, untrue, copied, or the
// repeat check could not run. Reads PR_BODY and PR_AUTHOR from the environment (plus GITHUB_TOKEN,
// GITHUB_REPOSITORY and PR_NUMBER for the repeat check; a local run outside GitHub Actions without
// them skips that check and says so): the workflow passes the body through
// env, never through a `${{ }}` expansion inside `run:`, because the PR author
// controls the body.
import { fileURLToPath } from 'node:url';

export const MIN_CONTENT = 10;

/** Dependency bots open PRs no agent wrote; there is nothing to disclose. Devin is NOT here — AGENTS.md binds it. */
export const EXEMPT_AUTHORS = ['dependabot[bot]', 'renovate[bot]'];

/** Agents that run off Sam's machine and really cannot reach the brain (AGENTS.md §12). GraphQL drops "[bot]", REST keeps it. */
export const CLOUD_AGENTS = ['devin-ai-integration[bot]', 'devin-ai-integration'];

/** The line sync-guardrails.mjs writes into every sync PR — a generated repeat, not a copied answer. */
/** sync-guardrails.mjs SYNC_BODY_BEGIN: the sync line is an allowed repeat only inside a generated sync body. */
export const SYNC_BODY_MARK = '<!-- guardrails-sync:begin -->';

/** How many of the nearest OLDER PRs the repeat check compares against. */
export const OLDER_LIMIT = 100;

export const SYNC_SEARCHED_FIRST = 'recorded on the BB_Tools PR that changed the canonical (BB_Tools/guardrails); this PR copies those files byte for byte and writes no logic of its own, so it reuses that search.';

// Two shapes, both measured on 160 real merged PRs (BB_Tools, BMB, CT, CalExp5, 2026-10-01):
//   inline   "Searched first: <answer>", at the start of a line or mid-line ("pace=fast; Searched first: ...")
//   section  a "## Searched first" heading with the answer on the lines under it — 27 of the
//            160 used this, and a line-only check would have failed every one of them.
const INLINE = /\bsearched[\s-]+first\b[\s*_]*:[\s*_]*/i;
const HEADING = /^\s*#{1,6}\s*[*_]*searched[\s-]+first\b[\s*_:]*$/i;
const tidy = (s) => s.replace(/^[\s>*_+|-]+/, '').replace(/[\s*_]+$/, '');
// A "## Searched first" section ends at the next heading, a horizontal rule, or a label from
// FIELD_LABELS ("Tests: ...", "- **Tests:** ...") — an empty section must not borrow the next
// field's text. Only KNOWN field names end it: an answer may itself open with a label
// ("Found: ...", "Brain search: ...", "No matches: ..."; Devin, BB_Tools #179, CT #743, ProjExp5 #30).
// A BOLD label (`**Word:**`, `- **Word:**`, `**Word**:`) is a field header whatever its name, so it ends the section too
// (an unlisted "**Rollout:**" must not be borrowed as the answer; Devin, CalExp5, ProjExp5) - unless it is a label an
// answer itself opens with (ANSWER_LABEL, which deliberately excludes the generic "Results:" - that is a test-output field: "**Brain search:** found ...", "**Found:** ...").
const FIELD_LABELS = '(?:what|why|summary|description|context|changes?|tests?|test (?:output|results?|plan)|evidence|verification|ci|review(?: trail)?|guardrail change|risk|rollback|notes?|impact|deploy(?:ment)?|follow-?ups?|related|links?|screenshots?|checklist)';
const BOLD_LABEL = /^\s*(?:[-*+]\s+)?(?:\*\*|__)\s*([^*_\n:]{1,60}?)\s*(?::\s*(?:\*\*|__)|(?:\*\*|__)\s*:)/;
const PLAIN_LABEL = /^\s*(?:[-*+]\s+)?([A-Za-z][A-Za-z0-9'/-]*(?: [A-Za-z0-9'/-]+){0,3})\s*:(?:\s|$)/;
const ANSWER_LABEL = /^(?:found|brain[\s_-]*search|quer(?:y|ies)|no\s+(?:matches|hits|results?)|searched?|search\s+(?:result|found)s?|hits?|reused?|nothing|none|cross-repo|grep(?:ped)?)\b/i;
// An answer-style bold label belongs to the answer ONLY as the first non-blank line under the heading (`first`): later on it is
// a separate field ("**Results:** CI green" under an empty section must not be borrowed as the disclosure; Devin, #186).
const SEARCHY_LABEL = /\b(?:search\w*|grep\w*|scan\w*|look\w*|rg|ripgrep|find\w*|quer(?:y|ies)|brain|lookup)\b/i;
// A VALUE that is itself a search report: it names a search AND its result ("brain_search found utils/phone.js; reused it").
// A value that merely mentions a word ("Owner: existing maintainer") is not one (Devin on #197, rounds 3-4 of #193).
const SEARCH_REPORT = /\b(?:brain[\s_-]*search\w*|search\w*|grep\w*|rg|ripgrep|quer(?:y|ies))\b.*\b(?:found|reused?|no\s+(?:matches|hits|results?)|nothing)\b/i;
// ...and says nowhere that the search did not happen: "search was skipped; CI found nothing to reuse" names a search word
// and a result word but reports no search (Devin on #197, round 4).
// A cloud agent may skip the cross-repo search and still report its in-repo grep ("cross-repo search was skipped; grepped this
// repo and found utils/phone.js"; Devin on #197, round 5): a skipped search is forgiven when ANOTHER clause reports a search.
const searchedElsewhere = (v) => String(v).split(/[;.]\s+|\s+[\u2014-]\s+/).some((c) => SEARCH_REPORT.test(c) && !SKIPPED_SEARCH.test(c));
const isSearchReport = (v) => SEARCH_REPORT.test(v) && !NO_SEARCH_ANYWHERE.test(v) && (!SKIPPED_SEARCH.test(v) || searchedElsewhere(v));
const endsSection = (line, first = false) => {
  if (SECTION_END.test(line)) return true;
  const b = BOLD_LABEL.exec(line);
  if (b) return !(first && ANSWER_LABEL.test(b[1]));
  // An UNLISTED plain label ("Owner: Jane") directly under an empty heading is the next field, not the answer (Devin, ProjExp5 #31).
  const p = first && PLAIN_LABEL.exec(line);
  // ...unless its LABEL reads as a search report ("Local grep:", "Repo scan:"; Devin round 3, #193), or its VALUE is a whole
  // search report ("Outcome: brain_search found utils/phone.js; reused it"; Devin on #197). A value that only mentions
  // something is not: "Owner: existing maintainer" names an owner, not a search (Devin round 4, #193).
  return !!p && !ANSWER_LABEL.test(p[1]) && !SEARCHY_LABEL.test(p[1]) && !isSearchReport(line.slice(p[0].length));
};
const SECTION_END = new RegExp(String.raw`^\s*#{1,6}\s|^\s*([-*_])(\s*\1){2,}\s*$|^\s*(?:[-*+]\s+)?[*_]*${FIELD_LABELS}[*_]*\s*:[*_]*(?:\s|$)`, 'i');
// CommonMark: a fence opens with at most 3 spaces of indent (4 is an indented code block), and a
// closer is the same character, at least as long, with nothing but whitespace after it — a
// "```js" line inside a fence is code, not its end (Devin, BB_Tools #183).
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// A label opened by a backtick or a quote is a MENTION of the rule ("checks `Searched first:`
// in every PR body"), not the line itself.
const QUOTES = '`"\'“”‘’';
// After a field lead ("Evidence: Searched first: ..."), an answer that opens like a sentence ABOUT the rule
// ("is required on every PR body") describes the label, it does not answer it (Devin round 4, #193).
const RULE_PROSE = /^(?:is|are|was|were|must|should|will|would|can|needs?|requires?|means|stays|became|becomes|checks?)\b/i;

/**
 * Every answer given under "Searched first", in body order; [] when there is none. Pure.
 * A body may mention the rule before its real answer (BB_Tools #140), so the caller judges
 * each candidate on its own instead of trusting the first or the longest.
 */
export function searchedFirstCandidates(body) {
  // Hidden text is not a disclosure: drop HTML comments (an unclosed one hides the rest of
  // the body) and blank the inside of fenced code blocks, which is quoted example text.
  // A backticked `<!--` is visible text, not a comment (Devin, BMB #911): an inline code span (same line) is kept whole.
  const visible = String(body ?? '').replace(/(`+)[^\n]*?\1|<!--[\s\S]*?(?:-->|$)/g, (m) => (m.startsWith('<!--') ? '' : m));
  const lines = [];
  let fence = null;
  for (const raw of visible.split(/\r?\n/)) {
    const f = FENCE.exec(raw);
    if (fence) { if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null; lines.push(''); continue; }
    if (f) { fence = f[1]; lines.push(''); continue; }
    lines.push(raw);
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (HEADING.test(lines[i])) {
      const under = [];
      for (let j = i + 1; j < lines.length && !endsSection(lines[j], under.length === 0); j++) {
        const t = tidy(lines[j]);
        if (t) under.push(t);
      }
      out.push(under.join(' '));
      continue;
    }
    const m = INLINE.exec(lines[i]);
    if (!m) continue;
    // Only the char BEFORE the label: an answer may itself open with a code span
    // ("Searched first: `ptDaysBetween` ... reused" — BMB #898, #885).
    const lead = lines[i].slice(0, m.index).replace(/[*_]+$/, '');
    const before = lead.slice(-1);
    if (before !== '' && QUOTES.includes(before)) continue;
    // Mid-line, the label must open a clause ("pace=fast; ...", "ok | ...", "test-only diff. ..."): "we introduced Searched first: validation"
    // is prose ABOUT the rule, not a disclosure (Devin, ProjExp5 #30).
    // A leading field label is a valid opener too ("Evidence: Searched first: ..."; Devin round 3, #193): the lead is ONE short label ending in a colon.
    const bare = lead.replace(/^[\s>#*_+|-]+/, '');
    const isFieldLead = /^[A-Za-z][A-Za-z0-9'/-]*(?: [A-Za-z0-9'/-]+){0,3}\s*:$/.test(bare.replace(/[\s*_]+$/, ''));
    if (bare !== '' && !isFieldLead && !/[.;|!?)\u2014\u00b7]\s*$/.test(lead.trimEnd()) && !/\s-\s*$/.test(lead)) continue;
    const answer = tidy(lines[i].slice(m.index + m[0].length));
    // ...unless it is a PAST-TENSE search report ("was the brain_search for X; found utils/phone.js and reused it"; Devin on #197).
    // Present-tense prose about the rule stays prose even when it names a search and a result ("is required: the check greps
    // ... and reused ..." - bb-review on #197).
    if (isFieldLead && RULE_PROSE.test(answer) && !(/^(?:was|were)\b/i.test(answer) && isSearchReport(answer))) continue;
    out.push(answer);
  }
  return out;
}

/** The fullest answer given under "Searched first", or null when there is none. Pure. */
export function searchedFirstContent(body) {
  const all = searchedFirstCandidates(body);
  return all.length ? all.reduce((a, b) => (b.length > a.length ? b : a)) : null;
}

// "n/a - a mechanical copy", "not applicable", "skipped", "did not search": a statement that no
// search happened is not a record of one. "no search results" / "none found" are real answers.
const NON_ANSWER = /^(?:n\/?a\b|not[\s-]+applicable|not[\s-]+(?:run|done|searched|needed|required)|skipped|no[\s-]+search(?![\s-]+(?:results?|hits?|matches|found))|did(?:n'?t|\s+not)\s+search|nothing\s+to\s+search|tbd\b|todo\b)/i;
// The same statement later in the answer ("<package>; ... so there was nothing to search for"):
// leading with a file name must not turn a non-answer into a disclosure (Devin, BB_Tools #183).
// "search was skipped", "skipped the brain search", "searches were not run": the same statement (Devin on #197, round 4).
const NO_SEARCH_ANYWHERE = /\bnothing\s+to\s+search\b|\bno\s+search\s+(?:was|is)\s+(?:run|done|needed|required)\b/i;
const SKIPPED_SEARCH = /\b(?:brain[\s_-]*)?search(?:es|ing)?\s+(?:was|were|is|got)\s+(?:skipped|not\s+(?:run|done))\b|\bskipped\s+(?:the\s+)?(?:brain[\s_-]*|cross-repo\s+)?search/i;
// An unfilled template: "<fill in>", or the suggested example copied unchanged ("<what it found>", "<x>").
const PLACEHOLDER = /<[^<>\n]*\s[^<>\n]*>|<[xy]>/i;

// "brain search not available to this agent", "cross-repo search unavailable", "no access to the brain".
// The claim must be ABOUT the search ("brain ... unavailable"): "found the unavailable-slot helper" is a real answer.
const UNAVAILABLE = new RegExp([
  String.raw`\b(?:brain|cross-repo|search)(?:[\s_-]+(?:search|mcp|tool|server|index|is|was|were))*[\s:]+(?:not\s+(?:available|reachable)|(?:is|was|are|were)n[’']?t\s+(?:available|reachable)|unavailable|unreachable|inaccessible)\b`,
  String.raw`\b(?:no\s+access\s+to|could(?:n[’']?t|\s+not)\s+(?:reach|access|use)|can(?:[’']?t|\s*not)\s+(?:reach|access|use)|without)\s+(?:the\s+)?(?:brain|cross-repo)`,
].join('|'), 'i');

/** Lowercased, whitespace-collapsed, trailing punctuation dropped: what "the same line" means. Pure. */
export const normalizeAnswer = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[\s.;,!]+$/, '').trim();

function judge(content, { author, others = [], isSync = false } = {}) {
  const c = content.trim();
  if (/^<[^>]*>$/.test(c) || PLACEHOLDER.test(c)) return { ok: false, reason: `"Searched first:" still holds a template placeholder: ${c}` };
  // A skipped search is forgiven only for a cloud agent (it has no brain) that reports its in-repo search in another clause.
  const skipped = SKIPPED_SEARCH.test(c) && !(CLOUD_AGENTS.includes(String(author ?? '')) && searchedElsewhere(c));
  if (NON_ANSWER.test(c) || NO_SEARCH_ANYWHERE.test(c) || skipped) return { ok: false, reason: `"Searched first:" says no search was done ("${c}") — name what the search found and whether it was reused, or say the search was unavailable` };
  if (c.length < MIN_CONTENT) {
    return { ok: false, reason: `"Searched first:" says only "${c}" (under ${MIN_CONTENT} characters) — name what the search found and whether it was reused` };
  }
  const who = String(author ?? '');
  if (who && !CLOUD_AGENTS.includes(who) && UNAVAILABLE.test(c)) {
    return { ok: false, reason: `"Searched first:" says the brain was unavailable ("${c}"), but ${who} is not a cloud agent — on Sam's machine every agent has mcp__brain-search__brain_search, or the CLI fallback: node C:\\Users\\samjo\\Desktop\\Claude\\TOOLS\\brain.mjs search "<question>". Run it and report what it found` };
  }
  const n = normalizeAnswer(c);
  if (!(isSync && n === normalizeAnswer(SYNC_SEARCHED_FIRST))) {
    const twin = others.find((o) => searchedFirstCandidates(o.body).some((x) => normalizeAnswer(x) === n));
    if (twin) return { ok: false, reason: `"Searched first:" is word for word the line of #${twin.number} ("${c}") — say what THIS change searched for and found` };
  }
  return { ok: true, reason: 'Searched first: ' + c };
}

/**
 * { ok, reason }. Passes when ANY candidate is a real answer; otherwise reports the fullest one's fault. Pure.
 * `others`: [{ number, body }] of OLDER PRs in the same repo — never newer ones, or a green PR would turn red
 * when a later PR copied it.
 */
export function checkPrBody({ body, author, others = [] } = {}) {
  if (EXEMPT_AUTHORS.includes(String(author ?? ''))) return { ok: true, reason: `exempt author ${author}` };
  const all = searchedFirstCandidates(body);
  if (!all.length) return { ok: false, reason: 'no "Searched first:" line in the PR body' };
  const ctx = { author, others, isSync: String(body ?? '').includes(SYNC_BODY_MARK) };
  const good = all.map((c) => judge(c, ctx)).find((r) => r.ok);
  return good ?? judge(searchedFirstContent(body), ctx);
}

const PER_PAGE = 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The `limit` nearest PRs older than `number`, as [{ number, body }]. Pages past the PRs newer than
 * this one (Devin on #197: a fixed first page can hold only newer PRs). THROWS when a page cannot be
 * read after `retries` retries or is not a list — the caller fails closed.
 */
export async function fetchOlderPrs({ repo, number, token, fetchFn = globalThis.fetch, limit = OLDER_LIMIT, maxPages = 10, retries = 1, sleepFn = sleep } = {}) {
  if (!repo || !number || !token || !fetchFn) throw new Error('repo, PR number and token are all required');
  const getPage = async (page) => {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt) await sleepFn(2000 * attempt);
      try {
        const r = await fetchFn(`https://api.github.com/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=${PER_PAGE}&page=${page}`,
          { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const list = await r.json();
        if (!Array.isArray(list)) throw new Error('the PR list is not an array');
        return list;
      } catch (e) { last = e; }
    }
    throw last;
  };
  const older = [];
  for (let page = 1; page <= maxPages && older.length < limit; page++) {
    const list = await getPage(page);
    older.push(...list.filter((p) => p.number < Number(number)).map((p) => ({ number: p.number, body: p.body ?? '' })));
    if (list.length < PER_PAGE) break;
  }
  return older.slice(0, limit);
}

/**
 * { others } or { error } from the environment. Fails CLOSED in GitHub Actions: missing inputs or an
 * unreadable PR list is an error, never an empty list that passes. A local run (no GITHUB_ACTIONS)
 * without the inputs skips the repeat check with a `note`.
 */
export async function loadOlderPrs(env = process.env, opts = {}) {
  const { GITHUB_REPOSITORY: repo, PR_NUMBER: number, GITHUB_TOKEN: token } = env;
  if (!repo || !number || !token) {
    if (env.GITHUB_ACTIONS === 'true') return { error: 'GITHUB_REPOSITORY, PR_NUMBER or GITHUB_TOKEN is not set in the workflow' };
    return { others: [], note: 'local run without GITHUB_REPOSITORY/PR_NUMBER/GITHUB_TOKEN: the repeat check did not run' };
  }
  try { return { others: await fetchOlderPrs({ repo, number, token, ...opts }) }; }
  catch (e) { return { error: `could not list this repo's PRs (${e.message})` }; }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  // A dependency bot is exempt before any API call: a GitHub outage must not turn its PR red (Devin on #197).
  const exempt = EXEMPT_AUTHORS.includes(String(process.env.PR_AUTHOR ?? ''));
  const loaded = exempt ? { others: [] } : await loadOlderPrs(process.env);
  if (loaded.error) {
    console.error(`::error::the "Searched first:" repeat check could not run: ${loaded.error}. A gate that cannot run does not pass — re-run this job.`);
    process.exit(1);
  }
  if (loaded.note) console.log(`[pr-body] note: ${loaded.note}`);
  const r = checkPrBody({ body: process.env.PR_BODY, author: process.env.PR_AUTHOR, others: loaded.others });
  if (r.ok) {
    console.log(`[pr-body] ok: ${r.reason}`);
  } else {
    console.error(`::error::${r.reason}`);
    console.error('  AGENTS.md §7/§12: add a line to the PR body, for example');
    console.error('    Searched first: brain_search "<what you looked for>" -> <what it found>; reused <x> / nothing fit because <y>');
    console.error('  A cloud agent with no brain access says so: "Searched first: cross-repo search unavailable; grepped this repo for <x>".');
    console.error('  Editing the PR body re-runs this check; no push needed.');
    process.exit(1);
  }
}
