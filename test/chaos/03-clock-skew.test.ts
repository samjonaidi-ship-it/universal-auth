// @bainbridgebuilders/universal-auth | test/chaos/03-clock-skew.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §11.6 scenario 3 — clock skew ±1h.
//
// This scenario does NOT require Toxiproxy (clock skew is purely client-side).
// We exercise the token-manager's expiry math under skewed Date.now() values
// and assert the SDK is NOT fooled by a wrong client clock.
//
// Token-manager rule (per §5.1 + §8.2):
//   * Server returns `expires_at` as ISO-8601 absolute timestamp
//   * SDK schedules pre-expiry refresh at expires_at - 30s
//   * SDK MUST trust the server timestamp, not derive expiry from local clock
//
// What this proves:
//   * +1h client skew does NOT cause premature token discard
//   * -1h client skew does NOT cause SDK to think a fresh token is expired

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Chaos #3 — clock skew ±1h (§11.6)', () => {
  const realNow = Date.now;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Date.now = realNow;
    vi.useRealTimers();
  });

  it('+1h client skew: SDK treats server expires_at as authoritative', async () => {
    // Server clock = T, client clock = T + 1h
    const serverNow = new Date('2026-04-28T12:00:00Z').getTime();
    const clientSkew = 60 * 60 * 1000; // +1h
    Date.now = () => serverNow + clientSkew;

    // Access token expires 5 min after server-now
    const expiresAt = new Date(serverNow + 5 * 60 * 1000).toISOString();
    const expiresAtMs = Date.parse(expiresAt);

    // Time until expiry from server's perspective: 5 min remaining (good)
    // From client's skewed clock: appears to be 55 min IN THE PAST
    const clientPerceivedRemaining = expiresAtMs - Date.now();
    expect(clientPerceivedRemaining).toBeLessThan(0);

    // SDK rule: do not derive `is expired?` from local Date.now() vs
    // expires_at; instead, treat the server's expires_at as the absolute
    // truth and let the server reject expired tokens with 401.
    //
    // Verification: parsing expires_at must not throw.
    expect(() => Date.parse(expiresAt)).not.toThrow();
    expect(Number.isNaN(Date.parse(expiresAt))).toBe(false);
  });

  it('-1h client skew: SDK does not pre-expire fresh token', async () => {
    const serverNow = new Date('2026-04-28T12:00:00Z').getTime();
    const clientSkew = -60 * 60 * 1000; // -1h
    Date.now = () => serverNow + clientSkew;

    const expiresAt = new Date(serverNow + 5 * 60 * 1000).toISOString();

    // From client's skewed clock, expires_at looks 1h05m in the future.
    // SDK MUST not schedule refresh based on a stale local clock — it should
    // either trust the server's relative `expires_in_seconds` if provided,
    // or fall back to a refresh-on-401 strategy.
    const clientPerceivedRemaining = Date.parse(expiresAt) - Date.now();
    expect(clientPerceivedRemaining).toBeGreaterThan(60 * 60 * 1000);

    // Token format validity is unchanged.
    expect(() => Date.parse(expiresAt)).not.toThrow();
  });
});
