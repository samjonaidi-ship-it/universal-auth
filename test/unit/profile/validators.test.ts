// @bainbridgebuilders/universal-auth | test/unit/profile/validators.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB

import { describe, it, expect } from 'vitest';
import {
  validatePhone,
  validateEmail,
  requiredFieldsPresent,
} from '../../../src/profile/validators.js';

describe('profile/validators — validatePhone (§5.4.5)', () => {
  it('normalizes a US number to E.164', () => {
    const r = validatePhone('(206) 555-0123');
    expect(r.ok).toBe(true);
    expect(r.e164).toBe('+12065550123');
  });

  it('accepts a number already in E.164 form with explicit +', () => {
    const r = validatePhone('+442079460958', 'GB');
    expect(r.ok).toBe(true);
    expect(r.e164).toBe('+442079460958');
  });

  it('rejects too-short input', () => {
    expect(validatePhone('555').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(validatePhone('').ok).toBe(false);
    expect(validatePhone('').reason).toBe('empty');
  });

  it('rejects non-numeric garbage', () => {
    expect(validatePhone('hello-world').ok).toBe(false);
  });
});

describe('profile/validators — validateEmail', () => {
  it('accepts a typical email and lowercases', () => {
    const r = validateEmail('Sam.Test+tag@Example.COM');
    expect(r.ok).toBe(true);
    expect(r.email).toBe('sam.test+tag@example.com');
  });

  it('rejects missing @', () => {
    expect(validateEmail('not-an-email').ok).toBe(false);
  });

  it('rejects empty', () => {
    expect(validateEmail('').ok).toBe(false);
  });

  it('rejects whitespace-only', () => {
    expect(validateEmail('   ').ok).toBe(false);
  });
});

describe('profile/validators — requiredFieldsPresent', () => {
  it('returns ok when all required keys are present in patch', () => {
    const r = requiredFieldsPresent(
      ['display_name', 'email'],
      { display_name: 'Sam', email: 's@x.com' }
    );
    expect(r.ok).toBe(true);
  });

  it('reports missing keys', () => {
    const r = requiredFieldsPresent(
      ['display_name', 'email', 'phone_e164'],
      { display_name: 'Sam' }
    );
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['email', 'phone_e164']);
  });

  it('falls back to existing values when patch lacks the key', () => {
    const r = requiredFieldsPresent(
      ['display_name', 'email'],
      { display_name: 'Sam' },
      { email: 's@x.com' }
    );
    expect(r.ok).toBe(true);
  });

  it('handles dot-paths for nested fields', () => {
    const r = requiredFieldsPresent(
      ['persona_extensions.crew.trade'],
      { persona_extensions: { crew: { trade: 'carpenter' } } }
    );
    expect(r.ok).toBe(true);
  });
});
