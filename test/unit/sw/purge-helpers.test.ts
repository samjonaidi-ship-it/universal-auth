// @bb/universal-auth | test/unit/sw/purge-helpers.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage for sw/purge-helpers.ts (look-back fix L6) — pure-algorithm bits
// extracted from sw/index.ts so they can be unit-tested without an SW
// global scope.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PURGE_PATTERNS,
  parsePurgePatterns,
  selectCachesToPurge,
} from '../../../src/sw/purge-helpers.js';

describe('sw/purge-helpers — DEFAULT_PURGE_PATTERNS', () => {
  it('exports the canonical 3 patterns mirroring CalExp5', () => {
    expect(DEFAULT_PURGE_PATTERNS).toHaveLength(3);
    // The 3 patterns must match these prefixes (matches CalExp5 SW behavior)
    expect(DEFAULT_PURGE_PATTERNS[0]?.test('runtime-cache-v3')).toBe(true);
    expect(DEFAULT_PURGE_PATTERNS[1]?.test('api-cache')).toBe(true);
    expect(DEFAULT_PURGE_PATTERNS[2]?.test('auth-session-features-v1')).toBe(true);
  });

  it('all default patterns are case-insensitive', () => {
    for (const pat of DEFAULT_PURGE_PATTERNS) {
      expect(pat.flags).toContain('i');
    }
  });

  it('default patterns do NOT match unrelated caches (no over-purge)', () => {
    expect(DEFAULT_PURGE_PATTERNS.some((p) => p.test('user-uploads'))).toBe(false);
    expect(DEFAULT_PURGE_PATTERNS.some((p) => p.test('app-shell'))).toBe(false);
    expect(DEFAULT_PURGE_PATTERNS.some((p) => p.test('static-assets'))).toBe(false);
  });

  it('frozen — cannot be mutated', () => {
    expect(Object.isFrozen(DEFAULT_PURGE_PATTERNS)).toBe(true);
  });
});

describe('sw/purge-helpers — parsePurgePatterns', () => {
  it('converts string patterns to case-insensitive RegExp', () => {
    const patterns = parsePurgePatterns(['custom-cache', 'temp']);
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.test('custom-cache-v1')).toBe(true);
    expect(patterns[0]?.test('CUSTOM-CACHE-V1')).toBe(true); // case-insensitive
    expect(patterns[1]?.test('temp-data')).toBe(true);
  });

  it('skips invalid regex strings without throwing', () => {
    const patterns = parsePurgePatterns(['valid', '[unclosed', 'also-valid']);
    // Invalid regex `[unclosed` is silently dropped
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.source).toBe('valid');
    expect(patterns[1]?.source).toBe('also-valid');
  });

  it('skips non-string inputs (defensive against page sending bad message)', () => {
    const patterns = parsePurgePatterns([
      'good',
      null,
      undefined,
      42,
      { foo: 'bar' },
      [],
      'also-good',
    ]);
    expect(patterns).toHaveLength(2);
    expect(patterns[0]?.source).toBe('good');
    expect(patterns[1]?.source).toBe('also-good');
  });

  it('skips empty strings', () => {
    const patterns = parsePurgePatterns(['', 'real']);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]?.source).toBe('real');
  });

  it('returns empty array for empty input', () => {
    expect(parsePurgePatterns([])).toEqual([]);
  });

  it('escapes nothing — patterns ARE regex (advanced users can use anchors)', () => {
    const patterns = parsePurgePatterns(['^api-', '-v\\d+$']);
    expect(patterns[0]?.test('api-cache-v1')).toBe(true);
    expect(patterns[0]?.test('myapi-cache')).toBe(false); // anchored
    expect(patterns[1]?.test('cache-v3')).toBe(true);
    expect(patterns[1]?.test('cache-v3-dev')).toBe(false);
  });
});

describe('sw/purge-helpers — selectCachesToPurge', () => {
  it('returns only matching cache names', () => {
    const all = ['runtime-v3', 'api-cache', 'user-uploads', 'static-assets'];
    const result = selectCachesToPurge(all, DEFAULT_PURGE_PATTERNS);
    expect(result).toEqual(['runtime-v3', 'api-cache']);
  });

  it('returns empty when no caches match', () => {
    const all = ['user-uploads', 'static-assets', 'app-shell'];
    expect(selectCachesToPurge(all, DEFAULT_PURGE_PATTERNS)).toEqual([]);
  });

  it('returns empty when pattern list is empty', () => {
    expect(selectCachesToPurge(['runtime-v3', 'api-cache'], [])).toEqual([]);
  });

  it('returns empty when cache list is empty', () => {
    expect(selectCachesToPurge([], DEFAULT_PURGE_PATTERNS)).toEqual([]);
  });

  it('preserves input order (stable filter)', () => {
    const all = ['z-runtime', 'a-api-cache', 'm-runtime', 'b-api-cache'];
    const result = selectCachesToPurge(all, DEFAULT_PURGE_PATTERNS);
    expect(result).toEqual(['z-runtime', 'a-api-cache', 'm-runtime', 'b-api-cache']);
  });

  it('does not double-include caches matching multiple patterns', () => {
    // 'api-runtime-cache' matches BOTH /api/ AND /runtime/ — must appear once
    const all = ['api-runtime-cache'];
    const result = selectCachesToPurge(all, DEFAULT_PURGE_PATTERNS);
    expect(result).toEqual(['api-runtime-cache']);
  });

  it('case-insensitive default patterns match uppercase cache names', () => {
    const all = ['RUNTIME-V3', 'API-CACHE'];
    const result = selectCachesToPurge(all, DEFAULT_PURGE_PATTERNS);
    expect(result).toEqual(['RUNTIME-V3', 'API-CACHE']);
  });
});
