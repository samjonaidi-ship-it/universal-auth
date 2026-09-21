// @vitest-environment node
// @samjonaidi-ship-it/universal-auth | test/unit/scripts/verify-watermark-bump.test.ts | v1.0.0 | 2026-09-21 | BB
//
// scripts/verify-watermark-bump.ts + scripts/lib/watermark-scan.ts - "a changed,
// watermarked file must bump its watermark" (`bb outstanding` O-3; lookback audits
// #3, #4, #7, #9, #13).
//
// Three layers: the pure matcher with exact inputs; the CLI against a REAL throwaway git
// repo (the part that reads a merge-base and two blobs - where a wrong ref or a wrong path
// would pass every pure test and still be silently wrong in CI); and the repo itself (its own
// headers parse, and the check is wired into the gate CI runs).
//
// Node environment, not happy-dom: this spawns git and node.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { buildSync } from 'esbuild';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseWatermark,
  compareVersions,
  judgeFile,
  parseNameStatus,
  checkChange,
  remedy,
} from '../../../scripts/lib/watermark-scan';

const ROOT = resolve(process.cwd());
const NUL = '\0';
// Enough body that git's rename detection (>= 50% similar) still pairs a renamed, edited file.
const FILLER = Array.from({ length: 30 }, (_, i) => `export const filler${i} = ${i};\n`).join('');
const PKG = '// @samjonaidi-ship-it/universal-auth';
/** A canonical SDK header line (newline included). */
const H = (v: string, d: string | null = '2026-05-08', path = 'src/x.ts', pre = PKG): string =>
  `${pre} | ${path} | v${v}${d ? ` | ${d}` : ''} | BB\n`;
const v = (text: string) => {
  const w = parseWatermark(text);
  if (!w) throw new Error(`no watermark in ${JSON.stringify(text)}`);
  return w;
};

describe('parseWatermark - every header shape the SDK really carries', () => {
  it('reads the canonical // shape, with an rc pre-release', () => {
    const w = parseWatermark(`${H('1.1.0-rc.21', '2026-09-06')}import x from 'y';\n`);
    expect(w).toMatchObject({
      version: [1, 1, 0],
      pre: ['rc', '21'],
      versionText: '1.1.0-rc.21',
      date: '2026-09-06',
      line: 1,
    });
  });

  it('reads a release version (no pre-release)', () => {
    expect(parseWatermark(H('1.0.3'))).toMatchObject({ version: [1, 0, 3], pre: null, versionText: '1.0.3' });
  });

  it('reads # (yml, md heading, sh), -- (sql) and /* */ (css)', () => {
    expect(v('# @samjonaidi-ship-it/universal-auth | .github/workflows/ci.yml | v1.1.1 | 2026-05-08 | BB\nname: CI\n').versionText).toBe('1.1.1');
    expect(v('# Integration Guide | docs/INTEGRATION_GUIDE.md | v1.1.0-rc.5 | 2026-05-08 | BB\n').versionText).toBe('1.1.0-rc.5');
    expect(v('-- @samjonaidi-ship-it/universal-auth | test/integration/seed.sql | v1.0.0 | 2026-05-01 | BB\n').versionText).toBe('1.0.0');
    expect(v('/* @samjonaidi-ship-it/universal-auth | src/react/components/styles.css | v1.0.0-rc.2 | 2026-05-01 | BB\n').versionText).toBe('1.0.0-rc.2');
  });

  it('reads the SHORT versions the docs carry (v1.4, v2), missing parts as 0', () => {
    expect(v('# SDK Backlog | v1.2 | 2026-05-08 | BB\n')).toMatchObject({ version: [1, 2, 0], versionText: '1.2' });
    expect(v('# --- BB append-only merge drivers | v2 | 2026-09-01 ---\n')).toMatchObject({ version: [2, 0, 0], versionText: '2', date: '2026-09-01' });
  });

  it('reads a header with NO date (the date is optional here)', () => {
    expect(v('// @samjonaidi-ship-it/universal-auth | src/x.ts | v1.0.0-rc.3 | BB\n')).toMatchObject({
      versionText: '1.0.0-rc.3',
      date: null,
    });
    expect(v('# Notes | v1.2\n')).toMatchObject({ versionText: '1.2', date: null });
  });

  it('reads the header on line 2 behind a vitest pragma, a shebang or a marker', () => {
    expect(v(`// @vitest-environment happy-dom\n${H('1.0.0-rc.4')}`)).toMatchObject({ versionText: '1.0.0-rc.4', line: 2 });
    expect(v(`#!/usr/bin/env bash\n# bb-integration-stack | run.sh | v1.0.0 | 2026-05-01 | BB\n`)).toMatchObject({ line: 2 });
    expect(v('<!-- BB-AGENT-CONTRACT v1.4 -- managed block -->\n# Agent Workflow Contract | Bainbridge Builders | v1.4 | 2026-09-21 | BB\n')).toMatchObject({ line: 2, versionText: '1.4' });
  });

  it('reads CRLF, which is what a Windows autocrlf checkout gives every line', () => {
    const w = v(`${PKG} | src/a.tsx | v2.1.0 | 2026-09-01 | BB\r\nconst a = 1;\r\n`);
    expect(w.versionText).toBe('2.1.0');
    expect(w.text.endsWith('\r')).toBe(false);
  });

  it('reads past a BOM', () => {
    expect(v(String.fromCharCode(0xfeff) + H('1.0.1')).versionText).toBe('1.0.1');
  });

  it('does not treat a shebang line as a comment opener', () => {
    expect(parseWatermark('#!/usr/bin/env node | v1.0.0 | 2026-09-01\n')).toBeNull();
  });

  it('only looks in the first 8 lines', () => {
    expect(parseWatermark(`${'x\n'.repeat(8)}${H('1.0.0')}`)).toBeNull(); // header on line 9
    expect(v(`${'// note\n'.repeat(7)}${H('1.0.0')}`).line).toBe(8);
  });

  it('is not fooled by prose that merely quotes a version', () => {
    expect(parseWatermark('const s = "| v1.0.0 | 2026-01-01";\n')).toBeNull(); // no comment marker
    expect(parseWatermark('// released v1.2.3 | 2026-01-01\n')).toBeNull(); // no pipe before the v
    expect(parseWatermark('// see v1.2.3 (2026-01-01)\n')).toBeNull();
    expect(parseWatermark('// | v1.2.3x | 2026-01-01\n')).toBeNull(); // junk glued to the version
    expect(parseWatermark('// | vx.y.z | 2026-01-01\n')).toBeNull();
    expect(parseWatermark('')).toBeNull();
    expect(parseWatermark(null)).toBeNull();
    expect(parseWatermark(undefined)).toBeNull();
  });
});

describe('compareVersions', () => {
  const c = (a: string, b: string) => compareVersions(v(`// | v${a} |\n`), v(`// | v${b} |\n`));

  it('compares X.Y.Z numerically, not as text', () => {
    expect(c('1.10.0', '1.9.0')).toBe(1);
    expect(c('1.9.0', '1.10.0')).toBe(-1);
    expect(c('2.0.0', '1.99.99')).toBe(1);
    expect(c('1.2.3', '1.2.3')).toBe(0);
    expect(c('1.2.4', '1.2.3')).toBe(1);
  });

  it('compares the rc number numerically: rc.12 is above rc.5', () => {
    expect(c('1.1.0-rc.12', '1.1.0-rc.5')).toBe(1);
    expect(c('1.1.0-rc.5', '1.1.0-rc.12')).toBe(-1);
    expect(c('1.1.0-rc.21', '1.1.0-rc.21')).toBe(0);
  });

  it('ranks GA above every rc of the same X.Y.Z, and an rc of the NEXT version above the last GA', () => {
    expect(c('1.1.0', '1.1.0-rc.21')).toBe(1);
    expect(c('1.1.0-rc.21', '1.1.0')).toBe(-1);
    expect(c('1.1.1-rc.1', '1.1.0')).toBe(1);
    expect(c('1.1.0-rc.99', '1.0.9')).toBe(1);
  });

  it('follows semver for other pre-release ids: numeric below alphanumeric, a longer list above its prefix', () => {
    expect(c('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(c('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(c('1.0.0-alpha.beta', '1.0.0-beta')).toBe(-1);
    expect(c('1.0.0-beta', '1.0.0-alpha')).toBe(1);
  });

  it('treats a short version as zero-padded', () => {
    expect(c('1.4', '1.4.0')).toBe(0);
    expect(c('2', '1.99.99')).toBe(1);
    expect(c('1.5', '1.4.9')).toBe(1);
  });
});

describe('judgeFile - the rule', () => {
  const base = `${H('1.1.0-rc.5')}code A\n`;

  it('accepts a bump of any size, including rc.N+1 and rc -> GA', () => {
    expect(judgeFile(base, `${H('1.1.0-rc.6')}code B\n`)).toBeNull();
    expect(judgeFile(base, `${H('1.1.0-rc.12')}code B\n`)).toBeNull();
    expect(judgeFile(base, `${H('1.1.0')}code B\n`)).toBeNull();
    expect(judgeFile(base, `${H('1.2.0-rc.1')}code B\n`)).toBeNull();
    expect(judgeFile(`${H('1.9.0')}a\n`, `${H('1.10.0')}b\n`)).toBeNull();
    expect(judgeFile('# Doc | v1.2 | 2026-05-08 | BB\na\n', '# Doc | v1.3 | 2026-09-21 | BB\nb\n')).toBeNull();
  });

  it('rejects a content change under the same version', () => {
    expect(judgeFile(base, `${H('1.1.0-rc.5')}code B\n`)).toMatchObject({ kind: 'not-bumped', from: '1.1.0-rc.5', to: '1.1.0-rc.5', line: 1 });
  });

  it('a new date under the same version is not a bump: the body change is still unrecorded', () => {
    expect(judgeFile(base, `${H('1.1.0-rc.5', '2026-12-31')}code B\n`)?.kind).toBe('not-bumped');
  });

  describe('a change that touches NOTHING but the header line', () => {
    // The header is the file's own metadata. 345 of the 591 same-version changes in the last 141 units of
    // main were exactly this (a package-scope rename, a corrected path, a date sync): no content to record.
    it('needs no bump: a scope rename, a corrected path, a date sync', () => {
      expect(judgeFile(base, `${H('1.1.0-rc.5', '2026-05-08', 'src/x.ts', '// @other/scope')}code A\n`)).toBeNull();
      expect(judgeFile(base, `${H('1.1.0-rc.5', '2026-05-08', 'src/y.ts')}code A\n`)).toBeNull();
      expect(judgeFile(base, `${H('1.1.0-rc.5', '2026-12-31')}code A\n`)).toBeNull();
      expect(judgeFile(base, `${H('1.1.0-rc.5', null)}code A\n`)).toBeNull();
    });

    it('holds only when the rest of the file is byte-for-byte the same (one edited body line is enough)', () => {
      expect(judgeFile(base, `${H('1.1.0-rc.5', '2026-12-31')}code A \n`)?.kind).toBe('not-bumped');
      expect(judgeFile(`${H('1.1.0-rc.5')}a\nb\n`, `${H('1.1.0-rc.5')}a\nb\nc\n`)?.kind).toBe('not-bumped');
    });

    it('is not extended to a version that went DOWN or a header that was removed', () => {
      expect(judgeFile(base, `${H('1.1.0-rc.4')}code A\n`)?.kind).toBe('version-decreased');
      expect(judgeFile(base, 'code A\n')?.kind).toBe('watermark-removed');
    });

    it('reads the header on line 2 (behind a pragma) the same way, and ignores CRLF and a BOM', () => {
      const pragma = '// @vitest-environment node\n';
      expect(judgeFile(`${pragma}${H('1.0.0')}x\n`, `${pragma}${H('1.0.0', '2026-12-31')}x\n`)).toBeNull();
      expect(judgeFile(`${pragma}${H('1.0.0')}x\n`, `${pragma}${H('1.0.0', '2026-12-31')}x\ny\n`)?.kind).toBe('not-bumped');
      const crlf = (s: string) => s.replace(/\n/g, '\r\n');
      expect(judgeFile(`${H('1.0.0')}x\n`, crlf(`${H('1.0.0', '2026-12-31')}x\n`))).toBeNull();
      expect(judgeFile(`${H('1.0.0')}x\n`, String.fromCharCode(0xfeff) + `${H('1.0.0', '2026-12-31')}x\n`)).toBeNull();
    });
  });

  it('holds a dateless header to the same rule', () => {
    const dateless = `${H('1.0.0-rc.3', null)}a\n`;
    expect(judgeFile(dateless, `${H('1.0.0-rc.3', null)}b\n`)?.kind).toBe('not-bumped');
    expect(judgeFile(dateless, `${H('1.0.0-rc.4', '2026-09-21')}b\n`)).toBeNull();
  });

  it('rejects a version that went DOWN (a merge or revert dropped the bump), and GA back to an rc', () => {
    expect(judgeFile(base, `${H('1.1.0-rc.4')}code B\n`)).toMatchObject({ kind: 'version-decreased', from: '1.1.0-rc.5', to: '1.1.0-rc.4' });
    expect(judgeFile(`${H('1.1.0-rc.12')}a\n`, `${H('1.1.0-rc.9')}b\n`)?.kind).toBe('version-decreased');
    expect(judgeFile(`${H('1.1.0')}a\n`, `${H('1.1.0-rc.21')}b\n`)?.kind).toBe('version-decreased');
  });

  it('rejects a removed or mangled header', () => {
    expect(judgeFile(base, 'code B\n')).toMatchObject({ kind: 'watermark-removed', from: '1.1.0-rc.5', to: null });
    expect(judgeFile(base, `${PKG} | src/x.ts | vNEXT | 2026-09-21 | BB\ncode B\n`)?.kind).toBe('watermark-removed');
  });

  it('holds a CRLF checkout to the same rule as an LF one', () => {
    const crlf = (s: string) => s.replace(/\n/g, '\r\n');
    expect(judgeFile(crlf(base), crlf(`${H('1.1.0-rc.5')}code B\n`))?.kind).toBe('not-bumped');
    expect(judgeFile(crlf(base), crlf(`${H('1.1.0-rc.6')}code B\n`))).toBeNull();
  });

  it('does not blame a file whose only change is its line endings', () => {
    expect(judgeFile(base, base.replace(/\n/g, '\r\n'))).toBeNull();
    expect(judgeFile(base.replace(/\n/g, '\r\n'), base)).toBeNull();
  });

  it('is out of scope for a file that never had a watermark, and for add / delete', () => {
    expect(judgeFile('plain\n', 'plain 2\n')).toBeNull();
    expect(judgeFile(null, H('1.0.0'))).toBeNull();
    expect(judgeFile(base, null)).toBeNull();
  });

  it('ignores an unchanged file', () => {
    expect(judgeFile(base, base)).toBeNull();
  });

  it('remedy() has a sentence for every failure kind', () => {
    for (const k of ['not-bumped', 'version-decreased', 'watermark-removed']) expect(remedy(k).length).toBeGreaterThan(10);
    expect(remedy('nope')).toBe('');
  });
});

describe('parseNameStatus (git diff --name-status -z -M)', () => {
  const z = (...records: string[]) => records.join(NUL) + NUL;

  it('keeps files that exist on both sides and changed', () => {
    const out = z('M', 'src/a.ts', 'T', 'src/t.ts', 'R087', 'src/old.ts', 'src/new.ts');
    expect(parseNameStatus(out)).toEqual([
      { basePath: 'src/a.ts', headPath: 'src/a.ts', status: 'M' },
      { basePath: 'src/t.ts', headPath: 'src/t.ts', status: 'T' },
      { basePath: 'src/old.ts', headPath: 'src/new.ts', status: 'R087' },
    ]);
  });

  it('drops added, deleted, copied and pure-rename entries', () => {
    expect(parseNameStatus(z('A', 'src/a.ts', 'D', 'src/d.ts', 'C075', 'src/c.ts', 'src/c2.ts', 'R100', 'src/x.ts', 'src/y.ts'))).toEqual([]);
  });

  it('stays in step after a two-path record: the entry after a rename is still read', () => {
    const out = z('R100', 'src/x.ts', 'src/y.ts', 'M', 'src/after-r100.ts', 'C075', 'src/c.ts', 'src/c2.ts', 'M', 'src/after-c.ts');
    expect(parseNameStatus(out).map((f) => f.headPath)).toEqual(['src/after-r100.ts', 'src/after-c.ts']);
  });

  it('survives a path with spaces, quotes and non-ASCII characters', () => {
    const out = z('M', 'docs/my file.md', 'M', 'docs/café "notes".md');
    expect(parseNameStatus(out).map((f) => f.headPath)).toEqual(['docs/my file.md', 'docs/café "notes".md']);
  });

  it('reads an empty diff as no files', () => {
    expect(parseNameStatus('')).toEqual([]);
  });
});

describe('checkChange - the population and what it cannot read', () => {
  // A Map is a TextSource; a path it does not hold reads as undefined = absent on that side.
  const store = (m: Record<string, string>) => new Map<string, string | null>(Object.entries(m));
  const files = (...paths: string[]) => parseNameStatus(paths.map((p) => `M${NUL}${p}${NUL}`).join(''));

  it('reports only violations, counts what it checked, and skips unreadable sides', () => {
    const base = { 'a.ts': H('1.0.0'), 'b.ts': H('1.0.0'), 'c.ts': H('1.0.0'), 'plain.ts': 'x\n', 'gone.ts': H('1.0.0') };
    const head = { 'a.ts': H('1.0.1') + 'n', 'b.ts': H('1.0.0') + 'n', 'c.ts': 'gone header\n', 'plain.ts': 'y\n' };
    const r = checkChange(files('a.ts', 'b.ts', 'c.ts', 'plain.ts', 'gone.ts'), store(base), store(head));
    expect(r.checked).toBe(3);
    expect(r.violations.map((x) => `${x.file}:${x.kind}`)).toEqual(['b.ts:not-bumped', 'c.ts:watermark-removed']);
  });

  it('surfaces a header-shaped line it cannot parse instead of silently passing the file', () => {
    const odd = `${PKG} | weird.ts | v1.2.3x | 2026-09-21 | BB\ncode\n`;
    const r = checkChange(files('weird.ts'), store({ 'weird.ts': odd }), store({ 'weird.ts': `${odd}more\n` }));
    expect(r.checked).toBe(0);
    expect(r.unrecognised).toEqual(['weird.ts']);
  });

  it('follows a rename that also edits: base read at the old path, head at the new', () => {
    const rn = parseNameStatus(['R090', 'src/old.ts', 'src/new.ts'].join(NUL) + NUL);
    const r = checkChange(rn, store({ 'src/old.ts': `${H('1.0.0')}a\n` }), store({ 'src/new.ts': `${H('1.0.0')}b\n` }));
    expect(r.violations.map((x) => x.file)).toEqual(['src/new.ts']);
  });
});

// --- the CLI, against a real git repo ------------------------------------------------

const CLI_SRC = resolve(ROOT, 'scripts/verify-watermark-bump.ts');
const TSX = resolve(ROOT, 'node_modules/tsx/dist/cli.mjs');
// The CLI is bundled ONCE (esbuild is already a devDependency) and each case then spawns plain node: about
// 25 cases at tsx's cold start each was ~45 s. One case below still runs the real `tsx` entry, as CI does.
let bundleDir = '';
let CLI = '';

// Each case spawns git and node+tsx in a throwaway repo - a few seconds on Windows, more on a loaded shard.
describe('CLI against a real repo', { timeout: 90_000 }, () => {
  beforeAll(() => {
    bundleDir = mkdtempSync(join(tmpdir(), 'wm-bundle-'));
    CLI = join(bundleDir, 'verify-watermark-bump.mjs');
    buildSync({ entryPoints: [CLI_SRC], outfile: CLI, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  });
  afterAll(() => {
    rmSync(bundleDir, { recursive: true, force: true });
  });
  let dir: string;
  const cleanEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env, ...extra };
    // A stray inherited value would make the CLI choose a different base than the test means
    // (and GIT_DIR from a running git hook would point git at the wrong repository).
    for (const k of Object.keys(e)) if (k.startsWith('GIT_')) delete e[k];
    for (const k of ['BASE_REF', 'CI']) if (!(k in extra)) delete e[k];
    return e;
  };
  const gitIn = (cwd: string, ...a: string[]) =>
    execFileSync('git', a, { cwd, encoding: 'utf8', env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  const git = (...a: string[]) => gitIn(dir, ...a);
  const put = (rel: string, body: string, cwd = dir) => {
    mkdirSync(join(cwd, rel, '..'), { recursive: true });
    writeFileSync(join(cwd, rel), body);
  };
  const commitIn = (cwd: string, msg: string) => {
    gitIn(cwd, 'add', '-A');
    gitIn(cwd, 'commit', '-q', '-m', msg);
  };
  const commit = (msg: string) => commitIn(dir, msg);
  // Async on purpose: a synchronous spawn blocks the vitest worker's event loop for the seconds tsx takes
  // to start, and on a loaded machine the worker's RPC heartbeat then times out ("Timeout calling onTaskUpdate").
  const run = (env: Record<string, string> = {}, cwd = dir): Promise<{ status: number | null; stdout: string; stderr: string }> =>
    new Promise((done) => {
      execFile(process.execPath, [CLI], { cwd, encoding: 'utf8', env: cleanEnv(env), maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        const code = (err as { code?: unknown } | null)?.code;
        done({ status: err ? (typeof code === 'number' ? code : null) : 0, stdout, stderr });
      });
    });
  const initRepo = (cwd: string) => {
    gitIn(cwd, 'init', '-q', '-b', 'main');
    gitIn(cwd, 'config', 'user.email', 't@example.com');
    gitIn(cwd, 'config', 'user.name', 'T');
    gitIn(cwd, 'config', 'core.autocrlf', 'false');
    gitIn(cwd, 'config', 'commit.gpgsign', 'false');
  };
  const A = (v: string, d = '2026-05-08', path = 'src/a.ts') => H(v, d, path);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wm-bump-'));
    initRepo(dir);
    put('src/a.ts', `${A('1.0.0-rc.5')}export const a = 1;\n`);
    put('src/b.ts', `${A('2.3.0', '2026-05-08', 'src/b.ts')}${FILLER}export const b = 1;\n`);
    put('README.md', '# no watermark\n');
    commit('base');
    git('branch', 'base');
    git('checkout', '-q', '-b', 'agent/x');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes when the changed file bumped', async () => {
    put('src/a.ts', `${A('1.0.0-rc.6', '2026-09-21')}export const a = 2;\n`);
    commit('bump');
    const r = await run({ BASE_REF: 'base' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('1 watermarked file(s) changed vs base, all bumped');
  });

  it('FAILS when a watermarked file changed and did not bump, and names it', async () => {
    put('src/a.ts', `${A('1.0.0-rc.5')}export const a = 2;\n`);
    commit('edit without bump');
    const r = await run({ BASE_REF: 'base' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/a.ts');
    expect(r.stderr).toContain('not-bumped');
    expect(r.stderr).toContain('1.0.0-rc.5 -> 1.0.0-rc.5');
  });

  it('judges the NET change: a bump in an earlier commit covers a later edit', async () => {
    put('src/a.ts', `${A('1.0.0-rc.6', '2026-09-21')}export const a = 2;\n`);
    commit('first, bumped');
    put('src/a.ts', `${A('1.0.0-rc.6', '2026-09-21')}export const a = 3;\n`);
    commit('second, edit only');
    expect((await run({ BASE_REF: 'base' })).status).toBe(0);
  });

  it('fails a mixed change on the one file that did not bump, and passes the one that did', async () => {
    put('src/a.ts', `${A('1.0.0')}export const a = 2;\n`);
    put('src/b.ts', `${A('2.3.0', '2026-05-08', 'src/b.ts')}export const b = 2;\n`);
    commit('mixed');
    const r = await run({ BASE_REF: 'base' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/b.ts');
    expect(r.stderr).not.toContain('src/a.ts');
  });

  it('passes a change that only touches the header line, and fails the same file once its body moves', async () => {
    put('src/a.ts', `${A('1.0.0-rc.5', '2026-09-21')}export const a = 1;\n`);
    commit('header-only date sync');
    const ok = await run({ BASE_REF: 'base' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('1 watermarked file(s) changed vs base, all bumped');
    put('src/a.ts', `${A('1.0.0-rc.5', '2026-09-21')}export const a = 2;\n`);
    commit('and now the body');
    expect((await run({ BASE_REF: 'base' })).status).toBe(1);
  });

  it('warns, without failing, about a header-shaped line it cannot read (never a silent pass)', async () => {
    put('src/odd.ts', `${PKG} | src/odd.ts | v1.2.3x | 2026-05-08 | BB\ncode\n`);
    commit('add odd');
    git('branch', '-f', 'base', 'HEAD');
    put('src/odd.ts', `${PKG} | src/odd.ts | v1.2.3x | 2026-05-08 | BB\ncode 2\n`);
    commit('edit odd');
    const r = await run({ BASE_REF: 'base' });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('? src/odd.ts');
    expect(r.stderr).toContain('NOT checked');
  });

  it('is silent on files that never had a watermark, added files and deleted files', async () => {
    put('README.md', '# still none\n');
    put('src/new.ts', 'export const n = 1;\n');
    put('src/c.ts', `${A('1.0.0', '2026-09-21', 'src/c.ts')}export const c = 1;\n`);
    git('rm', '-q', 'src/b.ts');
    commit('unrelated');
    const r = await run({ BASE_REF: 'base' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 watermarked file(s) changed');
  });

  it('holds a CRLF working tree to the rule, in both directions', async () => {
    const crlf = (s: string) => s.replace(/\n/g, '\r\n');
    put('src/a.ts', crlf(`${A('1.0.0-rc.5')}export const a = 2;\n`));
    commit('crlf, no bump');
    expect((await run({ BASE_REF: 'base' })).status).toBe(1);
    put('src/a.ts', crlf(`${A('1.0.0-rc.6', '2026-09-21')}export const a = 2;\n`));
    commit('crlf, bumped');
    expect((await run({ BASE_REF: 'base' })).status).toBe(0);
  });

  it('reads a non-ASCII path with spaces (git would octal-escape it without -z)', async () => {
    put('docs/café notes.md', '# Notes | docs/café notes.md | v1.0.0 | 2026-05-08 | BB\nold\n');
    commit('add doc');
    git('branch', '-f', 'base', 'HEAD');
    put('docs/café notes.md', '# Notes | docs/café notes.md | v1.0.0 | 2026-05-08 | BB\nnew\n');
    commit('edit doc, no bump');
    const r = await run({ BASE_REF: 'base' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/café notes.md');
  });

  describe('choosing the base when BASE_REF is not set', () => {
    // origin/main exists at the base commit; the branch bumps in commit 1 and edits
    // (without bumping again) in commit 2. The two defaults disagree on this history,
    // which is what makes each of them observable.
    beforeEach(() => {
      git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'base').trim());
      put('src/a.ts', `${A('1.0.0-rc.6', '2026-09-21')}export const a = 2;\n`);
      commit('bumped');
      put('src/a.ts', `${A('1.0.0-rc.6', '2026-09-21')}export const a = 3;\n`);
      commit('edit only');
    });

    it('in CI the base is HEAD^ (a PR checked out as a merge commit, or the previous main)', async () => {
      const r = await run({ CI: 'true' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('vs HEAD^');
    });

    it('locally on a branch the base is origin/main, so the whole branch is one change', async () => {
      const r = await run({});
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('vs origin/main');
    });
  });

  it('a base that moved on is not blamed on the branch (the diff starts at the merge-base)', async () => {
    // main gets a bump of a.ts AFTER the branch was cut; the branch only touches b.ts (bumped).
    git('checkout', '-q', 'main');
    put('src/a.ts', `${A('1.0.0-rc.9', '2026-09-10')}export const a = 5;\n`);
    commit('main moves on');
    git('checkout', '-q', 'agent/x');
    put('src/b.ts', `${A('2.3.1', '2026-09-21', 'src/b.ts')}export const b = 2;\n`);
    commit('branch edit, bumped');
    // A naive `git diff main HEAD` sees a.ts go rc.9 -> rc.5 and reports version-decreased.
    const r = await run({ BASE_REF: 'main' });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('version-decreased');
    // Only the branch's own file is in the change set. Diffing against the moved-on tip instead
    // would list a.ts too (blobs are read at the merge-base either way, so the verdict cannot
    // tell the two apart - the count of files the lint says it examined can).
    expect(r.stdout).toContain('1 watermarked file(s) changed');
  });

  it('follows a rename that also edits the file: judged old path -> new path', async () => {
    git('mv', 'src/b.ts', 'src/b2.ts');
    put('src/b2.ts', `${A('2.3.0', '2026-05-08', 'src/b2.ts')}${FILLER}export const b = 1;\nexport const more = 1;\n`);
    commit('rename + edit, no bump');
    const r = await run({ BASE_REF: 'base' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/b2.ts');
    put('src/b2.ts', `${A('2.4.0', '2026-09-21', 'src/b2.ts')}${FILLER}export const b = 1;\nexport const more = 1;\n`);
    commit('bumped');
    expect((await run({ BASE_REF: 'base' })).status).toBe(0);
  });

  it('locally, an unreachable base is "cannot judge", not a verdict', async () => {
    const r = await run({ BASE_REF: 'no-such-ref' });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('could not diff');
  });

  it('in CI, an unreachable base FAILS: a gate that cannot compute its diff must not read as green', async () => {
    const r = await run({ BASE_REF: 'no-such-ref', CI: 'true' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not diff');
  });

  it('a lone root commit has nothing to compare, in CI as anywhere', async () => {
    const solo = mkdtempSync(join(tmpdir(), 'wm-root-'));
    try {
      initRepo(solo);
      put('src/a.ts', `${A('1.0.0')}export const a = 1;\n`, solo);
      commitIn(solo, 'only commit');
      const r = await run({ CI: 'true' }, solo);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('root commit');
    } finally {
      rmSync(solo, { recursive: true, force: true });
    }
  });

  // What actions/checkout really gives a pull_request job: ONE commit, the merge commit, no parents.
  describe('in CI on a depth-1 clone (what actions/checkout fetches)', () => {
    let origin: string;
    let clone: string;
    const shallowCloneOfMergedPr = (branchA: string) => {
      origin = mkdtempSync(join(tmpdir(), 'wm-origin-'));
      clone = join(mkdtempSync(join(tmpdir(), 'wm-clone-')), 'work');
      initRepo(origin);
      put('src/a.ts', `${A('1.0.0-rc.5')}export const a = 1;\n`, origin);
      commitIn(origin, 'base');
      gitIn(origin, 'checkout', '-q', '-b', 'pr');
      put('src/a.ts', branchA, origin);
      commitIn(origin, 'the PR change');
      gitIn(origin, 'checkout', '-q', 'main');
      // The PR's test-merge commit: parent 1 = the base tip, parent 2 = the PR head.
      gitIn(origin, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #1', 'pr');
      execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(origin).href, clone], { env: cleanEnv(), stdio: 'pipe' });
      // The premise of every test below: HEAD really has no parent here. Without this they would prove nothing.
      expect(gitIn(clone, 'rev-parse', '--is-shallow-repository').trim()).toBe('true');
      expect(() => gitIn(clone, 'rev-parse', '--verify', '--quiet', 'HEAD^')).toThrow();
    };
    afterEach(() => {
      for (const d of [origin, clone && resolve(clone, '..')]) if (d) rmSync(d, { recursive: true, force: true });
    });

    it('deepens by one commit, then FAILS a PR that did not bump', async () => {
      shallowCloneOfMergedPr(`${A('1.0.0-rc.5')}export const a = 2;\n`);
      const r = await run({ CI: 'true' }, clone);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('src/a.ts');
      expect(r.stderr).toContain('vs HEAD^');
    });

    it('deepens by one commit, then passes a PR that bumped', async () => {
      shallowCloneOfMergedPr(`${A('1.0.0-rc.6', '2026-09-21')}export const a = 2;\n`);
      const r = await run({ CI: 'true' }, clone);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('1 watermarked file(s) changed vs HEAD^, all bumped');
    });

    it('FAILS (not a silent pass, not a "root commit") when the deepen cannot reach the remote', async () => {
      shallowCloneOfMergedPr(`${A('1.0.0-rc.6', '2026-09-21')}export const a = 2;\n`);
      gitIn(clone, 'remote', 'set-url', 'origin', pathToFileURL(join(origin, 'no-such-remote')).href);
      const r = await run({ CI: 'true' }, clone);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('could not diff');
      expect(r.stderr).not.toContain('root commit');
    });

    it('locally, the same shallow clone is "cannot judge" (exit 0, warned) - only CI is fail-closed', async () => {
      shallowCloneOfMergedPr(`${A('1.0.0-rc.5')}export const a = 2;\n`);
      const r = await run({}, clone);
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('treating as clean');
    });
  });
});

// --- the repo itself -----------------------------------------------------------------

describe('the repo itself', () => {
  it('the new files carry a header the parser accepts (the check must be able to hold itself to the rule)', () => {
    for (const f of [
      'scripts/verify-watermark-bump.ts',
      'scripts/lib/watermark-scan.ts',
      'test/unit/scripts/verify-watermark-bump.test.ts',
    ]) {
      expect(parseWatermark(readFileSync(resolve(ROOT, f), 'utf8')), f).not.toBeNull();
    }
  });

  it('every tracked file the parser calls a watermark carries a version it can compare, and none is header-shaped but unread', () => {
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, GIT_DIR: undefined as unknown as string } })
      .split(NUL)
      .filter((p) => /\.(ts|tsx|yml|yaml|md|css|sh|sql)$/.test(p));
    expect(tracked.length).toBeGreaterThan(100);
    const unread: string[] = [];
    for (const p of tracked) {
      let text: string;
      try {
        text = readFileSync(resolve(ROOT, p), 'utf8');
      } catch {
        continue; // deleted in the working tree of a partial checkout
      }
      if (parseWatermark(text)) continue;
      // Same test checkChange uses to decide a header-shaped line was refused.
      const head = text.split('\n', 8).join('\n');
      if (/^\s*(?:\/\/|--|#|\/\*|\*|<!--).*\|\s*v\d[^|]*\|/m.test(head)) unread.push(p);
    }
    expect(unread).toEqual([]);
  });

  it('runs under tsx exactly as `pnpm verify:watermarks` does (an empty diff is a pass)', () => {
    const r = spawnSync(process.execPath, [TSX, CLI_SRC], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, BASE_REF: 'HEAD', CI: '' } });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('0 watermarked file(s) changed vs HEAD');
  });

  it('is wired into verify:watermarks, which is what CI and the pre-push hook run', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['verify:watermarks']).toMatch(/verify-watermarks\.ts/);
    expect(pkg.scripts['verify:watermarks']).toMatch(/verify-watermark-bump\.ts/);
    // ...and CI still calls that script (ci.yml is Sam's file; this notices if the step is ever dropped).
    expect(readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8')).toMatch(/run:\s*pnpm verify:watermarks\s*$/m);
    expect(readFileSync(resolve(ROOT, '.githooks/pre-push'), 'utf8')).toContain('pnpm verify:watermarks');
  });
});
