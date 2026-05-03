// @samjonaidi-ship-it/universal-auth | test/unit/errors.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A1 gate #5 — every canonical error code has a typed class + factory mapping

import { describe, it, expect } from 'vitest';
import {
  AuthSdkError,
  AuthCodeInvalid,
  AuthCodeExpired,
  AuthRateLimited,
  AuthSessionExpired,
  AuthSessionRevoked,
  ProvisioningIncomplete,
  PlanSuspended,
  FeatureNotEntitled,
  PasskeyUVRequired,
  DeviceUnrecognized,
  IdempotencyKeyReplay,
  AppNotRegistered,
  UnknownEventType,
  VersionIncompatible,
  MaintenanceMode,
  ValidationPhoneUnreachable,
  ConsentRequired,
  errorFromEnvelope,
  type ProvisioningBlocker,
} from '../../src/errors.js';

describe('errors (§3.7 L247 canonical codes)', () => {
  describe('17 typed classes', () => {
    const cases: Array<[new () => AuthSdkError, string]> = [
      [AuthCodeInvalid, 'AUTH_CODE_INVALID'],
      [AuthCodeExpired, 'AUTH_CODE_EXPIRED'],
      [AuthRateLimited, 'AUTH_RATE_LIMITED'],
      [AuthSessionExpired, 'AUTH_SESSION_EXPIRED'],
      [AuthSessionRevoked, 'AUTH_SESSION_REVOKED'],
      [PlanSuspended, 'PLAN_SUSPENDED'],
      [PasskeyUVRequired, 'PASSKEY_UV_REQUIRED'],
      [DeviceUnrecognized, 'DEVICE_UNRECOGNIZED'],
      [IdempotencyKeyReplay, 'IDEMPOTENCY_KEY_REPLAY'],
      [VersionIncompatible, 'VERSION_INCOMPATIBLE'],
      [MaintenanceMode, 'MAINTENANCE_MODE'],
      [ValidationPhoneUnreachable, 'VALIDATION_PHONE_UNREACHABLE'],
    ];

    for (const [Cls, code] of cases) {
      it(`${Cls.name} carries code ${code}`, () => {
        const e = new Cls();
        expect(e).toBeInstanceOf(AuthSdkError);
        expect(e.code).toBe(code);
        expect(e.name).toBe(Cls.name);
      });
    }

    it('ProvisioningIncomplete carries blocker sub-code', () => {
      const e = new ProvisioningIncomplete('no_app_registration');
      expect(e.code).toBe('PROVISIONING_INCOMPLETE');
      expect(e.blocker).toBe('no_app_registration');
    });

    it('FeatureNotEntitled carries feature key', () => {
      const e = new FeatureNotEntitled('comms.messaging');
      expect(e.code).toBe('FEATURE_NOT_ENTITLED');
      expect(e.featureKey).toBe('comms.messaging');
    });

    it('UnknownEventType carries event type', () => {
      const e = new UnknownEventType('receipt.captured');
      expect(e.code).toBe('UNKNOWN_EVENT_TYPE');
      expect(e.eventType).toBe('receipt.captured');
    });

    it('AppNotRegistered carries app id in message', () => {
      const e = new AppNotRegistered('bb_express');
      expect(e.code).toBe('APP_NOT_REGISTERED');
      expect(e.message).toContain('bb_express');
    });

    it('ConsentRequired carries missing consent list', () => {
      const e = new ConsentRequired(['privacy_policy', 'agent_buddy_crew']);
      expect(e.code).toBe('CONSENT_REQUIRED');
      expect(e.missingConsents).toEqual(['privacy_policy', 'agent_buddy_crew']);
      expect(e.message).toContain('privacy_policy');
    });
  });

  describe('errorFromEnvelope factory', () => {
    it('routes every canonical code to its typed class', () => {
      const map: Record<string, new () => AuthSdkError> = {
        AUTH_CODE_INVALID: AuthCodeInvalid,
        AUTH_CODE_EXPIRED: AuthCodeExpired,
        AUTH_RATE_LIMITED: AuthRateLimited,
        AUTH_SESSION_EXPIRED: AuthSessionExpired,
        AUTH_SESSION_REVOKED: AuthSessionRevoked,
        PLAN_SUSPENDED: PlanSuspended,
        FEATURE_NOT_ENTITLED: FeatureNotEntitled,
        PASSKEY_UV_REQUIRED: PasskeyUVRequired,
        DEVICE_UNRECOGNIZED: DeviceUnrecognized,
        IDEMPOTENCY_KEY_REPLAY: IdempotencyKeyReplay,
        APP_NOT_REGISTERED: AppNotRegistered,
        UNKNOWN_EVENT_TYPE: UnknownEventType,
        VERSION_INCOMPATIBLE: VersionIncompatible,
        MAINTENANCE_MODE: MaintenanceMode,
        VALIDATION_PHONE_UNREACHABLE: ValidationPhoneUnreachable,
        CONSENT_REQUIRED: ConsentRequired,
      };

      for (const [code, Cls] of Object.entries(map)) {
        const e = errorFromEnvelope({ code });
        expect(e).toBeInstanceOf(Cls);
        expect(e.code).toBe(code);
      }
    });

    it('routes PROVISIONING_INCOMPLETE with blocker field', () => {
      const blockers: ProvisioningBlocker[] = [
        'qbo_missing',
        'identity_disabled',
        'no_party',
        'no_subscription',
        'no_app_registration',
        'enrollment_incomplete',
      ];
      for (const blocker of blockers) {
        const e = errorFromEnvelope({ code: 'PROVISIONING_INCOMPLETE', blocker });
        expect(e).toBeInstanceOf(ProvisioningIncomplete);
        expect((e as ProvisioningIncomplete).blocker).toBe(blocker);
      }
    });

    it('preserves hint / retry_after_seconds / trace_id from envelope', () => {
      const e = errorFromEnvelope({
        code: 'AUTH_RATE_LIMITED',
        hint: 'Wait 60 seconds',
        retry_after_seconds: 60,
        trace_id: '01HZ...',
      });
      expect(e).toBeInstanceOf(AuthRateLimited);
      expect(e.hint).toBe('Wait 60 seconds');
      expect(e.retryAfterSeconds).toBe(60);
      expect(e.traceId).toBe('01HZ...');
    });

    it('falls back to AuthSdkError for unknown codes', () => {
      const e = errorFromEnvelope({ code: 'FOO_BAR_BAZ' });
      expect(e).toBeInstanceOf(AuthSdkError);
      expect(e.code).toBe('FOO_BAR_BAZ');
    });
  });
});
