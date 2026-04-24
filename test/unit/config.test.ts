// @bb/universal-auth | test/unit/config.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A1 gate #6 — mode-safety assertion per §10.6 L1041 (3 negative tests)

import { describe, it, expect } from 'vitest';
import { assertModeSafety } from '../../src/config.js';

describe('assertModeSafety (§10.6 L1041)', () => {
  describe('A1 gate #6 — forbidden combinations throw', () => {
    it('throws when mode=development on a .bainbridgebuilders.com hostname', () => {
      expect(() =>
        assertModeSafety('development', 'ct-bff.bainbridgebuilders.com')
      ).toThrow(/Non-production mode 'development' forbidden/);
    });

    it('throws when mode=test on a .bainbridgebuilders.com hostname', () => {
      expect(() =>
        assertModeSafety('test', 'admin.bainbridgebuilders.com')
      ).toThrow(/Non-production mode 'test' forbidden/);
    });

    it('throws when mode=e2e on a .bainbridgebuilders.com hostname', () => {
      expect(() =>
        assertModeSafety('e2e', 'express.bainbridgebuilders.com')
      ).toThrow(/Non-production mode 'e2e' forbidden/);
    });
  });

  describe('permitted combinations pass', () => {
    it('allows production on production domain', () => {
      expect(() =>
        assertModeSafety('production', 'express.bainbridgebuilders.com')
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
        assertModeSafety('development', 'evil.notbainbridgebuilders.com')
      ).not.toThrow();
    });

    it('does match exact subdomain at any depth', () => {
      expect(() =>
        assertModeSafety('test', 'a.b.c.bainbridgebuilders.com')
      ).toThrow();
    });
  });
});
