// @samjonaidi-ship-it/universal-auth | test/unit/risky-paths.test.ts | v1.0.0 | 2026-10-06 | BB
// Pins the auth category of scripts/risky-paths.json to the package's public
// entry points. Devin (PR #24) found src/index.ts and src/react/index.ts
// classified routine: they decide which auth/access APIs consumers can call,
// yet matched no pattern while authz_content_scan is off. Matching mirrors
// riskyHits() in scripts/check-risky-paths.mjs: new RegExp(pattern).test(path).

import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import config from '../../scripts/risky-paths.json';

const authPatterns = (config.categories.find((c) => c.name === 'auth')?.patterns ?? []).map(
  (p) => new RegExp(p),
);
const isAuth = (path: string): boolean => authPatterns.some((r) => r.test(path));

// Entry points that are deliberately NOT auth. Adding one here is a decision,
// not a default: say why in risky-paths.json _why_entrypoints.
const NOT_AUTH = new Set(['src/profile/index.ts']);

describe('risky-paths auth category', () => {
  it('matches the source of every package.json export entry point', () => {
    const sources = Object.values(pkg.exports)
      .map((e) => (typeof e === 'string' ? e : e.import))
      .filter((p) => p.endsWith('.js'))
      .map((p) => p.replace('./dist/esm/', 'src/').replace(/\.js$/, '.ts'));
    expect(sources).toContain('src/index.ts');
    expect(sources).toContain('src/react/index.ts');
    for (const src of sources) {
      expect({ src, auth: isAuth(src) }).toEqual({ src, auth: !NOT_AUTH.has(src) });
    }
  });

  // registry.ts registers notification channels only (SMS/email routing); the
  // auth-flow and risk-signal interfaces are reserved and matched by their own files.
  it('matches the components barrel and the extendability registry', () => {
    expect(isAuth('src/react/components/index.ts')).toBe(true);
    expect(isAuth('src/extendability/registry.ts')).toBe(true);
  });

  it('still leaves non-auth code routine', () => {
    expect(isAuth('src/profile/index.ts')).toBe(false);
    expect(isAuth('src/react/components/AvatarPicker.tsx')).toBe(false);
  });
});
