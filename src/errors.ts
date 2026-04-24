// @bb/universal-auth | src/errors.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Typed error classes for every canonical error code per §3.7 L247.
// Full enumeration: 15 from §3.7 + `VALIDATION_PHONE_UNREACHABLE` (§5.4.5 L519)
// + `CONSENT_REQUIRED` (v1.4.0 §3.4) = 17 total.
//
// Day 2 delivery — consumed by client.ts (Block 2 Days 3-4) when HTTP responses
// arrive from CT BFF. Every canonical error surface gets a typed constructor
// so consumer code can `catch (e) { if (e instanceof AuthCodeExpired) ... }`.

// ── Base class ────────────────────────────────────────────────────────────

/**
 * Base class for every SDK-surfaced error.
 * Carries the canonical code + optional `hint`, `retry_after_seconds`, `trace_id`
 * per §3.6 L234 error envelope.
 */
export class AuthSdkError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly retryAfterSeconds?: number;
  readonly traceId?: string;

  constructor(
    code: string,
    message: string,
    options?: {
      hint?: string;
      retryAfterSeconds?: number;
      traceId?: string;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    this.code = code;
    if (options?.hint !== undefined) this.hint = options.hint;
    if (options?.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
    if (options?.traceId !== undefined) this.traceId = options.traceId;
  }
}

// ── Blocker sub-codes for PROVISIONING_INCOMPLETE ─────────────────────────
// Per plan Decision #20: use `no_app_registration` (Wizard vocabulary) not
// SDK §3.7 L247 `no_app`. SDK spec patch filed as v1.4.1 cleanup.

export type ProvisioningBlocker =
  | 'qbo_missing'
  | 'identity_disabled'
  | 'no_party'
  | 'no_subscription'
  | 'no_app_registration'
  | 'enrollment_incomplete';

// ── 15 canonical codes from §3.7 L247 ─────────────────────────────────────

export class AuthCodeInvalid extends AuthSdkError {
  constructor(message = 'The verification code is invalid.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('AUTH_CODE_INVALID', message, opts);
  }
}

export class AuthCodeExpired extends AuthSdkError {
  constructor(message = 'The code has expired. Please request a new one.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('AUTH_CODE_EXPIRED', message, opts);
  }
}

export class AuthRateLimited extends AuthSdkError {
  constructor(message = 'Too many attempts. Please wait before retrying.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('AUTH_RATE_LIMITED', message, opts);
  }
}

export class AuthSessionExpired extends AuthSdkError {
  constructor(message = 'Your session has expired. Please sign in again.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('AUTH_SESSION_EXPIRED', message, opts);
  }
}

export class AuthSessionRevoked extends AuthSdkError {
  constructor(message = 'Your session has been revoked.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('AUTH_SESSION_REVOKED', message, opts);
  }
}

/**
 * Custody chain incomplete per §3.7 L247. Carries a `blocker` sub-code indicating
 * which chain link failed. Thrown during finalize or on access-gated request.
 */
export class ProvisioningIncomplete extends AuthSdkError {
  readonly blocker: ProvisioningBlocker;

  constructor(
    blocker: ProvisioningBlocker,
    message = `Provisioning incomplete: ${blocker}`,
    opts?: ConstructorParameters<typeof AuthSdkError>[2]
  ) {
    super('PROVISIONING_INCOMPLETE', message, opts);
    this.blocker = blocker;
  }
}

export class PlanSuspended extends AuthSdkError {
  constructor(message = 'Your plan is suspended. Contact support.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('PLAN_SUSPENDED', message, opts);
  }
}

export class FeatureNotEntitled extends AuthSdkError {
  readonly featureKey?: string;
  constructor(featureKey?: string, message?: string, opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('FEATURE_NOT_ENTITLED', message ?? `Feature ${featureKey ?? ''} not available on this plan.`, opts);
    if (featureKey !== undefined) this.featureKey = featureKey;
  }
}

export class PasskeyUVRequired extends AuthSdkError {
  constructor(message = 'Passkey user verification (biometric/PIN) required.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('PASSKEY_UV_REQUIRED', message, opts);
  }
}

export class DeviceUnrecognized extends AuthSdkError {
  constructor(message = 'This device is not recognized. Additional verification required.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('DEVICE_UNRECOGNIZED', message, opts);
  }
}

export class IdempotencyKeyReplay extends AuthSdkError {
  constructor(message = 'Duplicate request — idempotency key already consumed.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('IDEMPOTENCY_KEY_REPLAY', message, opts);
  }
}

export class AppNotRegistered extends AuthSdkError {
  constructor(appId?: string, opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super(
      'APP_NOT_REGISTERED',
      `App${appId ? ` '${appId}'` : ''} is not registered in ct_bff.apps. See docs/INTEGRATION_GUIDE.md.`,
      opts
    );
  }
}

export class UnknownEventType extends AuthSdkError {
  readonly eventType?: string;
  constructor(eventType?: string, opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super(
      'UNKNOWN_EVENT_TYPE',
      `Event type${eventType ? ` '${eventType}'` : ''} not registered for this app. Register via ct_bff.apps.event_types[].`,
      opts
    );
    if (eventType !== undefined) this.eventType = eventType;
  }
}

export class VersionIncompatible extends AuthSdkError {
  constructor(message = 'SDK protocol version incompatible with server.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('VERSION_INCOMPATIBLE', message, opts);
  }
}

export class MaintenanceMode extends AuthSdkError {
  constructor(message = 'Server is in maintenance mode. Retry later.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('MAINTENANCE_MODE', message, opts);
  }
}

// ── 2 additional codes (v1.4.0 + §5.4.5) ──────────────────────────────────

/**
 * Phone failed server-side canonicalization (§5.4.5 L519).
 * Client-side libphonenumber-js accepted, but server's full libphonenumber rejected.
 */
export class ValidationPhoneUnreachable extends AuthSdkError {
  constructor(message = 'Phone number could not be reached or validated.', opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super('VALIDATION_PHONE_UNREACHABLE', message, opts);
  }
}

/**
 * Required consent missing or stale policy version (v1.4.0 §3.4 L221).
 * SDK auth middleware throws this on first non-consent API call post-version-bump.
 */
export class ConsentRequired extends AuthSdkError {
  readonly missingConsents?: readonly string[];
  constructor(missingConsents?: readonly string[], opts?: ConstructorParameters<typeof AuthSdkError>[2]) {
    super(
      'CONSENT_REQUIRED',
      missingConsents && missingConsents.length
        ? `Required consent missing or stale: ${missingConsents.join(', ')}`
        : 'Required consent missing or stale.',
      opts
    );
    if (missingConsents !== undefined) this.missingConsents = missingConsents;
  }
}

// ── Factory: construct a typed error from a CT BFF error envelope ─────────

/**
 * CT BFF error envelope shape per §3.6 L234.
 */
export interface AuthErrorEnvelope {
  error?: string;
  code: string;
  hint?: string;
  retry_after_seconds?: number;
  trace_id?: string;
  protocol_version?: string;
  blocker?: ProvisioningBlocker;
  missing_consents?: readonly string[];
  [key: string]: unknown;
}

/**
 * Map an error envelope (as returned by CT BFF) to the appropriate typed class.
 * Used by `core/client.ts` (Block 2 Days 3-4) when non-2xx response arrives.
 */
export function errorFromEnvelope(env: AuthErrorEnvelope): AuthSdkError {
  // Build opts without undefined-valued keys (exactOptionalPropertyTypes).
  const opts: { hint?: string; retryAfterSeconds?: number; traceId?: string } = {};
  if (env.hint !== undefined) opts.hint = env.hint;
  if (env.retry_after_seconds !== undefined) opts.retryAfterSeconds = env.retry_after_seconds;
  if (env.trace_id !== undefined) opts.traceId = env.trace_id;

  switch (env.code) {
    case 'AUTH_CODE_INVALID':          return new AuthCodeInvalid(undefined, opts);
    case 'AUTH_CODE_EXPIRED':          return new AuthCodeExpired(undefined, opts);
    case 'AUTH_RATE_LIMITED':          return new AuthRateLimited(undefined, opts);
    case 'AUTH_SESSION_EXPIRED':       return new AuthSessionExpired(undefined, opts);
    case 'AUTH_SESSION_REVOKED':       return new AuthSessionRevoked(undefined, opts);
    case 'PROVISIONING_INCOMPLETE':    return new ProvisioningIncomplete(env.blocker ?? 'identity_disabled', undefined, opts);
    case 'PLAN_SUSPENDED':             return new PlanSuspended(undefined, opts);
    case 'FEATURE_NOT_ENTITLED':       return new FeatureNotEntitled(undefined, undefined, opts);
    case 'PASSKEY_UV_REQUIRED':        return new PasskeyUVRequired(undefined, opts);
    case 'DEVICE_UNRECOGNIZED':        return new DeviceUnrecognized(undefined, opts);
    case 'IDEMPOTENCY_KEY_REPLAY':     return new IdempotencyKeyReplay(undefined, opts);
    case 'APP_NOT_REGISTERED':         return new AppNotRegistered(undefined, opts);
    case 'UNKNOWN_EVENT_TYPE':         return new UnknownEventType(undefined, opts);
    case 'VERSION_INCOMPATIBLE':       return new VersionIncompatible(undefined, opts);
    case 'MAINTENANCE_MODE':           return new MaintenanceMode(undefined, opts);
    case 'VALIDATION_PHONE_UNREACHABLE': return new ValidationPhoneUnreachable(undefined, opts);
    case 'CONSENT_REQUIRED':           return new ConsentRequired(env.missing_consents, opts);
    default:
      // Unknown code — wrap as base class so consumers still catch via `instanceof AuthSdkError`
      return new AuthSdkError(env.code, env.error ?? `Unknown error code: ${env.code}`, opts);
  }
}
