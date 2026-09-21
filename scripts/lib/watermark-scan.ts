// @samjonaidi-ship-it/universal-auth | scripts/lib/watermark-scan.ts | v1.0.0 | 2026-09-21 | BB
//
// The pure matcher behind scripts/verify-watermark-bump.ts. No git, no fs, no
// process.exit in here - the CLI reads the two sides and passes text in, so the
// tests can import this module (verify-watermarks.ts cannot be imported: it runs
// its scan at module load).
//
// WHAT A WATERMARK IS
//   The header line every source file carries within its first lines:
//       // @samjonaidi-ship-it/universal-auth | src/core/x.ts | v1.1.0-rc.21 | 2026-05-08 | BB
//   `#` for yml / md / sh, `--` for SQL, `/* ... */` for css. It is the file's
//   per-file changelog: when a change lands without touching it, the file keeps
//   claiming to be the version it was before the change and nothing anywhere
//   records what changed. That was lookback audits #3, #4, #7, #9 and #13 of the
//   auth programme (`bb outstanding` O-3). scripts/verify-watermarks.ts already
//   checks that the header EXISTS in the right shape; this checks that a change
//   MOVES it. ControlTower shipped the same rule as its PR #556 with its own parser;
//   this SDK has a different grammar (below), so it has its own.
//
// THE GRAMMAR, MEASURED (2026-09-21, the 344 files git tracks at origin/main 4ff46ba)
//   292 files carry a header-shaped line in their first 8 lines. Of those 292:
//     - comment opener: `//` 269, `#` 21, `/*` 1, `--` 1
//     - line: 1 for 286 files, 2 for 6 (a `@vitest-environment` pragma, a shebang,
//       or AGENTS.md's managed-block marker sits on line 1)
//     - version is its own pipe segment `| vX.Y.Z |`; 117 are pre-releases, all
//       `-rc.N` (`1.1.0-rc.5 < 1.1.0-rc.12 < 1.1.0`: the rc number compares
//       NUMERICALLY and GA outranks every rc of the same X.Y.Z); 5 are SHORT
//       (`v1.4`, `v2`: AGENTS.md, .gitattributes, docs/BACKLOG.md, docs/CI_SECRETS.md,
//       docs/VERSION_MATRIX.md) - missing parts count as 0
//     - date `| YYYY-MM-DD |`: 292 of 292 today. The DATE is optional in this
//       parser - read when present, never required - because the rule is about the
//       version, and a parser that demanded it would call an older dateless
//       header "unrecognised" and never hold the file to anything. (scripts/
//       verify-watermarks.ts is what requires the date, on the files it scans.)
//   The other 52 tracked files carry no header (34 md, 9 json, 2 yaml, 2 html, 1 sql,
//   LICENSE and dotfiles) and are out of scope.
//
// THE RULE
//   A file that HAD a watermark on the base side and is modified by the change must
//   carry a watermark whose version is STRICTLY GREATER on the head side. Three ways
//   to fail: not bumped (same version - a date-only edit is not a bump), version went
//   DOWN, or the watermark was removed. Out of scope: files with no watermark on the
//   base side (the lint can only hold a file to a promise it made), added and deleted
//   files, a pure rename (R100), and a change that only flips line endings.
//   A header-shaped line this parser cannot read is REPORTED (`unrecognised`), never
//   silently skipped - CalExp5's audit #13 was a bump hook that knew two header shapes,
//   so a third was never bumped and nobody noticed for months.
//
// REPLAYED AGAINST HISTORY (2026-09-21, the last 141 first-parent units of main, each judged
// as a PR would be): 110 units modified at least one watermarked file (857 file checks).
// A first cut of the rule failed 90 of them on 606 files - 345 of those were changes that
// touched ONLY the header line (a scope rename, a path fix, a date sync), which is why a
// header-only change is out of scope above. With that, 90 units still fail, on 261 files:
// 246 not-bumped (a real body change under an unchanged version, 27 of them comment-only),
// 13 version-decreased (11 in one deliberate resync commit, aa88a6e - a false positive the
// rule cannot tell apart, it takes BB_SKIP; 2 real), 2 watermark-removed (1 real, 1 a false
// positive: an installer block pushed a header past line 8). So the SDK's history mostly
// did NOT bump on change: that is the gap this closes, not noise in the rule.

/** How many leading lines may hold the header (a pragma, a shebang or a marker can precede it). */
export const HEADER_LINES = 8;

// A comment opener at the start of the line: `//`, `--`, `#` (not a `#!` shebang), `/*`, ` *`, `<!--`.
const BOM = new RegExp('^' + String.fromCharCode(0xfeff));
const COMMENT_START = /^\s*(?:\/\/|--|#(?!!)|\/\*+|\*|<!--)/;
// The part that is identical in every variant: a pipe, then `vN[.N[.N]][-pre]` as its own
// segment, then optionally `| YYYY-MM-DD`. The lookahead keeps `v1.2.3x` from parsing as
// 1.2.3. The leading pipe is required, so prose that merely quotes "v1.2.3" is not a header.
const STAMP =
  /\|\s*v(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*))?(?![\w.-])(?:\s*\|\s*(\d{4}-\d{2}-\d{2})(?![\d-]))?/;

export interface Watermark {
  /** [major, minor, patch]; parts missing from the header are 0 */
  version: [number, number, number];
  /** pre-release identifiers (`rc.21` -> ['rc','21']); null for a release */
  pre: string[] | null;
  /** the version exactly as written, without the leading v */
  versionText: string;
  /** ISO date when the header has one */
  date: string | null;
  /** 1-based line the header was found on */
  line: number;
  text: string;
}

/**
 * Find the watermark in the first HEADER_LINES lines of `text`.
 * Handles LF and CRLF (a Windows autocrlf checkout turns every line into `...\r`; the
 * trailing CR is dropped by trim()) and a UTF-8 BOM (U+FEFF is whitespace to `\s`, so the
 * opener match steps over it).
 */
export function parseWatermark(text: string | null | undefined): Watermark | null {
  if (typeof text !== 'string' || text.length === 0) return null;
  const lines = text.split('\n', HEADER_LINES);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (!COMMENT_START.test(raw)) continue;
    const m = STAMP.exec(raw);
    if (!m) continue;
    const pre = m[4] ? m[4].split('.') : null;
    const versionText =
      [m[1], m[2], m[3]].filter((p): p is string => p !== undefined).join('.') + (m[4] ? `-${m[4]}` : '');
    return {
      version: [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)],
      pre,
      versionText,
      date: m[5] ?? null,
      line: i + 1,
      text: raw.trim(),
    };
  }
  return null;
}

type VersionParts = Pick<Watermark, 'version' | 'pre'>;

const NUMERIC = /^\d+$/;

/**
 * -1 / 0 / 1 for a < b / a == b / a > b, by semver precedence: X.Y.Z numerically
 * (1.10.0 > 1.9.0), then a release outranks any pre-release of the same X.Y.Z
 * (1.1.0 > 1.1.0-rc.21), then pre-release identifiers left to right - numeric ones
 * as numbers (rc.12 > rc.5), numeric below alphanumeric, a longer list above its prefix.
 */
export function compareVersions(a: VersionParts, b: VersionParts): -1 | 0 | 1 {
  for (let i = 0; i < 3; i++) {
    const x = a.version[i] as number;
    const y = b.version[i] as number;
    if (x !== y) return x < y ? -1 : 1;
  }
  if (a.pre === null && b.pre === null) return 0;
  if (a.pre === null) return 1;
  if (b.pre === null) return -1;
  const n = Math.max(a.pre.length, b.pre.length);
  for (let i = 0; i < n; i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xn = NUMERIC.test(x);
    const yn = NUMERIC.test(y);
    if (xn && yn) return Number(x) < Number(y) ? -1 : Number(x) > Number(y) ? 1 : 0;
    if (xn) return -1;
    if (yn) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export type ViolationKind = 'not-bumped' | 'version-decreased' | 'watermark-removed';

export interface Violation {
  kind: ViolationKind;
  from: string;
  to: string | null;
  line: number;
}

const toLf = (s: string): string => s.replace(/\r\n/g, '\n');

/** The text with its watermark line removed (LF, no BOM): "did anything but the header change?" */
function withoutHeader(text: string): string {
  const w = parseWatermark(text);
  const lines = toLf(text).replace(BOM, '').split('\n');
  if (w) lines.splice(w.line - 1, 1);
  return lines.join('\n');
}

/**
 * Judge one modified file.
 * @param baseText content on the base side (null = did not exist)
 * @param headText content on the head side (null = deleted)
 * @returns null = fine, or out of scope. A header-shaped line the parser cannot read
 *   is reported by checkChange, not judged here.
 */
export function judgeFile(baseText: string | null, headText: string | null): Violation | null {
  if (baseText === null || headText === null) return null; // added or deleted
  const base = parseWatermark(baseText);
  if (!base) return null; // never promised a watermark
  const head = parseWatermark(headText);
  if (!head) {
    return { kind: 'watermark-removed', from: base.versionText, to: null, line: base.line };
  }
  const c = compareVersions(head, base);
  if (c > 0) return null;
  // The header line is the file's own metadata, not its content: a change that touches NOTHING but that
  // line (a scope rename, a corrected path, a date sync) has no content change to record. Measured on the
  // last 141 first-parent units of main: 345 of the 591 same-version changes were exactly this. It is
  // deliberately NOT extended to a DECREASE or a removed header, which stay violations.
  if (c === 0 && withoutHeader(baseText) === withoutHeader(headText)) return null;
  return {
    kind: c === 0 ? 'not-bumped' : 'version-decreased',
    from: base.versionText,
    to: head.versionText,
    line: head.line,
  };
}

export interface ChangedFile {
  basePath: string;
  headPath: string;
  status: string;
}

/**
 * Parse `git diff --name-status -z -M` output into changed-file records. NUL-separated,
 * so a path with spaces, quotes or non-ASCII characters is never octal-escaped and the
 * later `git show` finds it. Records are `M\0path`, `A\0path`, `D\0path`, `T\0path`,
 * `R087\0old\0new`, `C075\0old\0new`. Only files that exist on both sides and changed
 * content are returned: M, T, and R below 100. A, D, C and R100 are dropped.
 */
export function parseNameStatus(out: string): ChangedFile[] {
  const files: ChangedFile[] = [];
  const parts = String(out).split('\0');
  for (let i = 0; i < parts.length; i++) {
    const status = (parts[i] ?? '').trim();
    if (!status) continue;
    if (/^[RC]\d+$/.test(status)) {
      const oldPath = parts[i + 1];
      const newPath = parts[i + 2];
      i += 2;
      if (status.startsWith('R') && Number(status.slice(1)) < 100 && oldPath && newPath) {
        files.push({ basePath: oldPath, headPath: newPath, status });
      }
      continue;
    }
    const path = parts[i + 1];
    i += 1;
    if ((status === 'M' || status === 'T') && path) files.push({ basePath: path, headPath: path, status });
  }
  return files;
}

// A header-ish line the strict parser refused: a pipe-separated `vN...` segment near the top.
const LOOKS_LIKE_HEADER = /^\s*(?:\/\/|--|#|\/\*|\*|<!--).*\|\s*v\d[^|]*\|/m;
const headOf = (text: string): string => text.split('\n', HEADER_LINES).join('\n');

export interface CheckResult {
  violations: Array<Violation & { file: string }>;
  /** files that held a watermark on the base side: the population the rule binds */
  checked: number;
  /** modified files whose first lines look like a header that parseWatermark did NOT accept */
  unrecognised: string[];
}

/**
 * Where the text of a path comes from: null / undefined for a path that is absent on that side.
 * A Map satisfies it (the tests), and so does `{ get: (p) => readFromGit(p) }` (the CLI). It is
 * spelled as a Pick of Map so no parameter is declared in a function type - the scripts lint block
 * runs the base no-unused-vars rule, which reports the names in such a type as unused.
 */
export type TextSource = Pick<Map<string, string | null>, 'get'>;

/** The whole check over a change set: `baseSide` and `headSide` are the two ends of the diff. */
export function checkChange(files: ChangedFile[], baseSide: TextSource, headSide: TextSource): CheckResult {
  const violations: CheckResult['violations'] = [];
  const unrecognised: string[] = [];
  let checked = 0;
  for (const f of files) {
    const baseText = baseSide.get(f.basePath);
    const headText = headSide.get(f.headPath);
    if (baseText === null || baseText === undefined || headText === null || headText === undefined) continue;
    const base = parseWatermark(baseText);
    if (!base) {
      if (LOOKS_LIKE_HEADER.test(headOf(baseText))) unrecognised.push(f.headPath);
      continue;
    }
    checked++;
    const v = judgeFile(baseText, headText);
    if (v) violations.push({ file: f.headPath, ...v });
  }
  return { violations, checked, unrecognised };
}

/** The fix, spelled out, for the CLI to print under the list. */
export function remedy(kind: string): string {
  switch (kind) {
    case 'not-bumped':
      return 'bump the version in the header (patch for a fix, minor for a feature, rc.N+1 while on a release candidate) and set the date to today';
    case 'version-decreased':
      return 'the version went DOWN - a merge or a revert dropped a bump; restore a version above the base';
    case 'watermark-removed':
      return 'the header line was removed or mangled beyond `| vX.Y.Z |` - restore it, bumped';
    default:
      return '';
  }
}
