// @bainbridgebuilders/universal-auth | test/unit/config.test.ts | v1.0.1 | 2026-05-01 | BB
// A1 gate #6 — mode-safety assertion per §10.6 L1041
// v1.0.1: assertModeSafety now consumes config.cookieDomain rather than a literal.

import { describe, it, expect } from 'vitest';
import { assertModeSafety } from '../../src/config.js';

describe('assertModeSafety (§10.6 L1041)', () => {
  describe('A1 gate #6 — forbidden combinations throw (against legacy .bainbridgebuilders.com)', () => {
    it('throws when mode=development on a .bainbridgebuilders.com hostname', () => {
      expect(() =>
        assertModeSafety('development', 'ct-bff.bainbridgebuilders.com', '.bainbridgebuilders.com')
      ).toThrow(/Non-production mode 'development' forbidden/);
    });

    it('throws when mode=test on a .bainbridgebuilders.com hostname', () => {
      expect(() =>
        assertModeSafety('test', 'admin.bainbridgebuilders.com', '.bainbridgebuilders.com')
      ).toThrow(/Non-production mode 'test' forbidden/);
    });

    it('throws when mode=e2e on a .bainbridgebuilders.com hostname', () => {
      expect(() =>
        assertModeSafety('e2e', 'express.bainbridgebuilders.com', '.bainbridgebuilders.com')
      ).toThrow(/Non-production mode 'e2e' forbidden/);
    });
  });

  describe('default cookieDomain is the canonical .buildwithbainbridge.com (D20 cutover)', () => {
    it('throws when mode=development on a .buildwithbainbridge.com hostname (default)', () => {
      expect(() =>
        assertModeSafety('development', 'ct-bff.buildwithbainbridge.com')
      ).toThrow(/Non-production mode 'development' forbidden/);
    });

    it('does NOT throw on .bainbridgebuilders.com when default is in use (post-cutover)', () => {
      expect(() =>
        assertModeSafety('development', 'ct-bff.bainbridgebuilders.com')
      ).not.toThrow();
    });
  });

  describe('permitted combinations pass', () => {
    it('allows production on production domain', () => {
      expect(() =>
        assertModeSafety('production', 'express.bainbridgebuilders.com', '.bainbridgebuilders.com')
      ).not.toThrow();
    });

    it('allows development on localhost', () => {
      expect(() => assertModeSafety('development', 'localhost')).not.toThrow();
    });

    it('allows test on localhost', () => {
      expect(() => assertModeSafety('test', 'localhost')).not.toThrow();
    });

    it('allows e2e on preview domain', () => {
      expect(() =>
        assertModeSafety('e2e', 'universal-auth-rc.up.railway.app')
      ).not.toThrow();
    });

    it('allows simulate on non-prod domain (reserved but falls through)', () => {
      expect(() => assertModeSafety('simulate', 'staging.example.com')).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('is suffix-matched (does not reject look-alike domains)', () => {
      // A rogue `notbainbridgebuilders.com` should NOT match `.bainbridgebuilders.com`
      expect(() =>
        assertModeSafety('development', 'evil.notbainbridgebuilders.com', '.bainbridgebuilders.com')
      ).not.toThrow();
    });

    it('does match exact subdomain at any depth', () => {
      expect(() =>
        assertModeSafety('test', 'a.b.c.bainbridgebuilders.com', '.bainbridgebuilders.com')
      ).toThrow();
    });

    it('strips leading dot from cookieDomain (cookies use leading dot, hostnames do not)', () => {
      expect(() =>
        assertModeSafety('test', 'foo.example.com', '.example.com')
      ).toThrow();
      expect(() =>
        assertModeSafety('test', 'foo.example.com', 'example.com')
      ).toThrow();
    });
  });
});
