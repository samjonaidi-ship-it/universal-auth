// @samjonaidi-ship-it/universal-auth | test/integration/helpers.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Shared helpers for integration tests — typed fetch wrappers, seeded user
// shortcuts, mock-server inspection.

import { BFF_BASE_URL, TEST_MODE_KEY, TWILIO_MOCK_URL, RESEND_MOCK_URL } from './setup.js';

// ── Generic typed fetch ───────────────────────────────────────────────────

export interface BffRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  cookie?: string;
  testMode?: boolean;  // attach X-Test-Mode-Key header for seeded fixtures
}

export interface BffResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
  cookie: string | null;  // Set-Cookie value if present
}

export async function bff<T = unknown>(
  path: string,
  opts: BffRequest = {}
): Promise<BffResponse<T>> {
  const headers: Record<string, string> = {
    'X-Auth-Protocol-Version': 'v1',
    'X-App-Id': 'bb_integration_test',
    'X-SDK-Version': '1.0.0-rc.1-test',
    Accept: 'application/json',
    ...opts.headers,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.testMode === true) headers['X-Test-Mode-Key'] = TEST_MODE_KEY;
  if (opts.method && opts.method !== 'GET') {
    headers['Idempotency-Key'] = crypto.randomUUID();
  }

  const r = await fetch(`${BFF_BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let body: T;
  try {
    body = text.length > 0 ? (JSON.parse(text) as T) : (null as T);
  } catch {
    body = text as unknown as T;
  }
  return {
    status: r.status,
    body,
    headers: r.headers,
    cookie: r.headers.get('set-cookie'),
  };
}

// ── Seeded user shortcut ──────────────────────────────────────────────────

/**
 * Sign in a seed user via test-mode (skips real SMS). Returns access token +
 * cookie for use in subsequent requests.
 *
 * Per spec §10.3 — seeded users: test-crew-1, test-supplier-1, test-client-1, test-admin
 */
export async function signInSeeded(
  username: 'test-crew-1' | 'test-supplier-1' | 'test-client-1' | 'test-admin'
): Promise<{ accessToken: string; refreshToken: string; cookie: string; sessionId: string; identity: { identity_id: string } }> {
  const r = await bff<{
    access_token: string;
    refresh_token: string;
    session_id: string;
    expires_at: string;
    identity: { identity_id: string };
  }>('/auth/v1/code/verify', {
    method: 'POST',
    testMode: true,
    body: {
      destination: `${username}@test.bainbridgebuilders.com`,
      code: '000000',  // seeded users accept code 000000 in test mode
      device_id: 'test-device-' + crypto.randomUUID().slice(0, 8),
      app_id: 'bb_integration_test',
    },
  });
  if (r.status !== 200) {
    throw new Error(
      `[helpers.signInSeeded] failed for ${username}: HTTP ${r.status} ${JSON.stringify(r.body)}`
    );
  }
  return {
    accessToken: r.body.access_token,
    refreshToken: r.body.refresh_token,
    cookie: r.cookie ?? '',
    sessionId: r.body.session_id,
    identity: r.body.identity,
  };
}

// ── Mock-server inspection ────────────────────────────────────────────────

/**
 * List captured outbound SMS from the Twilio mock. Used to verify the SDK
 * triggered an SMS without actually sending one.
 *
 * Note: Prism's mock doesn't actually capture; for full assertion support
 * we'd swap this for a custom mock or use msw-node-side. Day 19 polish.
 */
export async function listSentSMS(): Promise<unknown[]> {
  const r = await fetch(`${TWILIO_MOCK_URL}/__captured__`).catch(() => null);
  if (r === null || !r.ok) return [];
  return r.json() as Promise<unknown[]>;
}

export async function listSentEmail(): Promise<unknown[]> {
  const r = await fetch(`${RESEND_MOCK_URL}/__captured__`).catch(() => null);
  if (r === null || !r.ok) return [];
  return r.json() as Promise<unknown[]>;
}
