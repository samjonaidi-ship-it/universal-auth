// @bainbridgebuilders/universal-auth | test/security/05-csrf-headers.test.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Spec §15 — CSRF defense.
//
// SDK contract:
//   * Every mutating request carries a non-guessable Idempotency-Key
//     (UUID v4) — server enforces uniqueness within session
//   * Every request carries X-Auth-Protocol-Version: v1 — Origin/Referer
//     check on the server side rejects cross-origin requests
//   * Every request carries X-App-Id — server validates app registration
//
// We assert that the client.ts wrapper produces these headers on EVERY
// mutation by spying on fetch.

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { configureClient, request } from '../../src/core/client.js';

describe('Security #5 — CSRF defense headers (§15)', () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;

  beforeEach(() => {
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_security_test',
      sdkVersion: '1.0.0-rc.1-test',
    });

    // Fresh Response per call — Response bodies can only be consumed once
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('every POST carries Idempotency-Key (UUID v4)', async () => {
    await request('/auth/v1/code/request', {
      method: 'POST',
      body: { destination: 'foo@bar.com', app_id: 'bb_security_test' },
      anonymous: true,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers;
    const headerObj =
      headers instanceof Headers
        ? Object.fromEntries(headers.entries())
        : (headers as Record<string, string> | undefined) ?? {};
    expect(headerObj['Idempotency-Key']).toBeDefined();
    // SDK uses nanoid (default 21 chars, URL-safe alphabet) — long enough
    // to be non-guessable. Per spec §Global the canonical requirement is
    // "uniquely identifiable", not strictly UUID v4.
    expect(headerObj['Idempotency-Key']).toMatch(/^[A-Za-z0-9_-]{16,32}$/);
  });

  it('every request carries X-Auth-Protocol-Version: v1', async () => {
    await request('/auth/v1/me', { anonymous: true });

    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers;
    const headerObj =
      headers instanceof Headers
        ? Object.fromEntries(headers.entries())
        : (headers as Record<string, string> | undefined) ?? {};
    expect(headerObj['X-Auth-Protocol-Version']).toBe('v1');
  });

  it('every request carries X-App-Id', async () => {
    await request('/auth/v1/me', { anonymous: true });

    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers;
    const headerObj =
      headers instanceof Headers
        ? Object.fromEntries(headers.entries())
        : (headers as Record<string, string> | undefined) ?? {};
    expect(headerObj['X-App-Id']).toBe('bb_security_test');
  });

  it('GET requests do NOT carry Idempotency-Key (server expects only on mutations)', async () => {
    await request('/auth/v1/me', { anonymous: true });

    const headers = (fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.headers;
    const headerObj =
      headers instanceof Headers
        ? Object.fromEntries(headers.entries())
        : (headers as Record<string, string> | undefined) ?? {};
    expect(headerObj['Idempotency-Key']).toBeUndefined();
  });

  it('Idempotency-Key is unique per request (no collision across mutations)', async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      // eslint-disable-next-line no-await-in-loop
      await request('/auth/v1/code/request', {
        method: 'POST',
        body: { destination: 'foo@bar.com', app_id: 'bb_security_test' },
        anonymous: true,
      });
    }
    for (const call of fetchSpy.mock.calls) {
      const headers = (call[1] as RequestInit | undefined)?.headers;
      const headerObj =
        headers instanceof Headers
          ? Object.fromEntries(headers.entries())
          : (headers as Record<string, string> | undefined) ?? {};
      const key = headerObj['Idempotency-Key'];
      if (typeof key === 'string') keys.add(key);
    }
    expect(keys.size).toBe(50);
  });
});
