// @samjonaidi-ship-it/universal-auth | src/profile/validators.ts | v1.1.0 | 2026-05-06 | BB
// Profile field validators per §5.4.5.
//
// Phone:  libphonenumber-js (~34 KB gzip with metadata) → E.164 normalization
//         client-side. Server canonicalizes via full Google libphonenumber via
//         Bridge; mismatches return VALIDATION_PHONE_UNREACHABLE.
// Email:  RFC 5322 pragmatic regex client-side. Server-side deliverability
//         check (Resend) is async + non-blocking.
// Required-field: per-persona check using completeness rules.
//
// v1.1.0 (P1-F, 2026-05-06): libphonenumber-js converted to dynamic import.
// Audit Finding ARCH C1: the static `import 'libphonenumber-js'` at module
// top transitively pulled the full 34 KB gzipped phone-metadata chunk into
// every consumer of `src/profile/index.ts` — including the React subpath,
// which contradicts the header at `src/profile/index.ts:2` claiming the dep
// is "kept out of the core 40 KB budget" (true for the core entry only).
// Lazy-loading inside `validatePhone()` defers the chunk until the consumer
// actually validates a phone — typically only on form submit. This is a
// **breaking signature change**: `validatePhone` now returns
// `Promise<PhoneValidationResult>` instead of `PhoneValidationResult`.
// Documented in CHANGELOG v1.1.0-rc.2.

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
 * **Async since v1.1.0 (P1-F):** `libphonenumber-js` is dynamically imported
 * to keep its 34 KB gzipped metadata chunk out of the React subpath. Callers
 * must `await` the result. The library is loaded once per page and cached by
 * the bundler.
 *
 * Examples:
 *   await validatePhone("(555) 555-1234")     // → { ok:true, e164:'+15555551234' }
 *   await validatePhone("+44 20 7946 0958")   // → { ok:true, e164:'+442079460958' }
 *   await validatePhone("555")                // → { ok:false, reason:'unparseable' }
 */
export async function validatePhone(
  input: string,
  defaultCountry: 'US' | 'CA' | 'GB' | 'AU' | string = 'US'
): Promise<PhoneValidationResult> {
  const raw = (input ?? '').trim();
  if (raw.length === 0) return { ok: false, reason: 'empty' };
  try {
    // P1-F — lazy-load on first validate. Subsequent calls hit the import cache.
    const { parsePhoneNumberFromString, isValidNumberForRegion } = await import(
      'libphonenumber-js'
    );
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
