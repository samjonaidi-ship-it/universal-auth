// @samjonaidi-ship-it/universal-auth | src/profile/validators.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Profile field validators per §5.4.5.
//
// Phone:  libphonenumber-js (~4 KB) → E.164 normalization client-side.
//         Server canonicalizes via full Google libphonenumber via Bridge;
//         mismatches return VALIDATION_PHONE_UNREACHABLE.
// Email:  RFC 5322 pragmatic regex client-side. Server-side deliverability
//         check (Resend) is async + non-blocking.
// Required-field: per-persona check using completeness rules.

import { parsePhoneNumberFromString, isValidNumberForRegion } from 'libphonenumber-js';

// ── Phone ─────────────────────────────────────────────────────────────────

export interface PhoneValidationResult {
  ok: boolean;
  /** Normalized E.164 string when ok=true. */
  e164?: string;
  /** Human-readable reason when ok=false. */
  reason?: string;
}

/**
 * Validate + normalize a phone number to E.164. Defaults to US if no country
 * is given and the input lacks a leading '+'.
 *
 * Examples:
 *   "(555) 555-1234"       → +15555551234 (US default)
 *   "+44 20 7946 0958"     → +442079460958
 *   "555"                  → ok: false, reason: 'too_short'
 */
export function validatePhone(
  input: string,
  defaultCountry: 'US' | 'CA' | 'GB' | 'AU' | string = 'US'
): PhoneValidationResult {
  const raw = (input ?? '').trim();
  if (raw.length === 0) return { ok: false, reason: 'empty' };
  try {
    const parsed = parsePhoneNumberFromString(raw, defaultCountry as 'US');
    if (parsed === undefined) return { ok: false, reason: 'unparseable' };
    if (!parsed.isValid()) {
      return { ok: false, reason: 'invalid_for_region' };
    }
    if (parsed.country !== undefined && !isValidNumberForRegion(parsed.number, parsed.country)) {
      return { ok: false, reason: 'invalid_for_region' };
    }
    return { ok: true, e164: parsed.number };
  } catch {
    return { ok: false, reason: 'unparseable' };
  }
}

// ── Email ─────────────────────────────────────────────────────────────────

// RFC 5322-pragmatic — covers the common cases without 4-page regex monsters.
// Allows: local@domain.tld, sub.domain.tld, +tag, -dash. Rejects: trailing dot,
// double @, whitespace, missing tld.
const EMAIL_RX =
  /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export interface EmailValidationResult {
  ok: boolean;
  /** Lowercased canonical when ok=true. */
  email?: string;
  reason?: string;
}

export function validateEmail(input: string): EmailValidationResult {
  const raw = (input ?? '').trim();
  if (raw.length === 0) return { ok: false, reason: 'empty' };
  if (raw.length > 254) return { ok: false, reason: 'too_long' };
  if (!EMAIL_RX.test(raw)) return { ok: false, reason: 'invalid_format' };
  return { ok: true, email: raw.toLowerCase() };
}

// ── Required-field check ──────────────────────────────────────────────────

export interface RequiredCheckResult {
  ok: boolean;
  missing: readonly string[];
}

/**
 * Returns ok=true when none of `requiredFields` are missing on the patch
 * (or already-saved profile values, supplied as `existing`).
 *
 * Example:
 *   const r = requiredFieldsPresent(['display_name', 'email'], patch, existing);
 */
export function requiredFieldsPresent(
  requiredFields: readonly string[],
  patch: Record<string, unknown>,
  existing: Record<string, unknown> = {}
): RequiredCheckResult {
  const missing: string[] = [];
  for (const key of requiredFields) {
    const value = readDotPath(patch, key) ?? readDotPath(existing, key);
    if (value === undefined || value === null || value === '') {
      missing.push(key);
    }
  }
  return { ok: missing.length === 0, missing };
}

/** Read a dot-path like `persona_extensions.crew.qbt_user_id`. */
function readDotPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
