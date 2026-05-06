// @samjonaidi-ship-it/universal-auth | test/unit/core/error-hook.test.ts | v1.0.0 | 2026-05-06 | BB
// P1-E coverage for src/core/error-hook.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerOnError,
  reportSoftError,
  __resetOnErrorForTests,
} from '../../../src/core/error-hook.js';

describe('error-hook (P1-E)', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetOnErrorForTests();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    __resetOnErrorForTests();
    consoleWarnSpy.mockRestore();
  });

  it('falls back to console.warn when no onError is registered', () => {
    reportSoftError(new Error('something went sideways'));
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy.mock.calls[0]?.[0]).toContain('something went sideways');
  });

  it('routes through registered onError when set', () => {
    const onError = vi.fn();
    registerOnError(onError);
    const err = new Error('routed');
    reportSoftError(err);
    expect(onError).toHaveBeenCalledWith(err);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('does NOT route to console.warn when onError accepts the error', () => {
    const onError = vi.fn();
    registerOnError(onError);
    reportSoftError(new Error('only-via-hook'));
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('falls back to console.warn if the registered hook itself throws', () => {
    const onError = vi.fn(() => {
      throw new Error('consumer hook bug');
    });
    registerOnError(onError);

    reportSoftError(new Error('original error'));

    // Both messages should surface to console.warn
    const calls = consoleWarnSpy.mock.calls.flat();
    const joined = calls.map((c) => (c instanceof Error ? c.message : String(c))).join(' ');
    expect(joined).toContain('original error');
    expect(joined.toLowerCase()).toContain('handler threw');
  });

  it('handles non-Error values without crashing', () => {
    reportSoftError('a plain string');
    reportSoftError({ shape: 'object' });
    reportSoftError(null);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
  });

  it('clears registration when null is passed', () => {
    const onError = vi.fn();
    registerOnError(onError);
    registerOnError(null); // clear

    reportSoftError(new Error('after-clear'));
    expect(onError).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
