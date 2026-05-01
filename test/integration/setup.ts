// @bainbridgebuilders/universal-auth | test/integration/setup.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Integration test setup. Waits for the docker-compose stack (or a remote
// staging URL via INTEGRATION_BASE_URL env var) to be reachable before any
// test runs. Throws if services aren't healthy after timeout.
//
// Per spec §11.3, integration tests need a real CT BFF + DB + mocked SMS/email.

import { afterAll, beforeAll } from 'vitest';

/**
 * Base URL for the CT BFF under test.
 * Default: docker-compose ct-bff at localhost:3300
 * Override: set INTEGRATION_BASE_URL=https://ct-bff.staging.bb.com
 */
export const BFF_BASE_URL =
  process.env.INTEGRATION_BASE_URL ?? 'http://localhost:3300';

/**
 * Twilio mock URL for asserting outbound SMS captured.
 * (Only used when running against docker-compose; staging hits real Twilio.)
 */
export const TWILIO_MOCK_URL =
  process.env.TWILIO_MOCK_URL ?? 'http://localhost:8443';

/**
 * Resend mock URL for asserting outbound email captured.
 */
export const RESEND_MOCK_URL =
  process.env.RESEND_MOCK_URL ?? 'http://localhost:8444';

/** Test mode key — required for header-gated test endpoints per spec §10. */
export const TEST_MODE_KEY =
  process.env.TEST_MODE_KEY ?? 'test-key-do-not-use-in-prod';

const HEALTH_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastError: unknown = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/healthz`, { method: 'GET' });
      if (r.ok) return;
      lastError = `HTTP ${r.status}`;
    } catch (err) {
      lastError = err;
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
  throw new Error(
    `[integration setup] BFF at ${url} did not become healthy within ${timeoutMs}ms. ` +
      `Last error: ${String(lastError)}. ` +
      `Did you bring up the stack? \`docker compose -f test/integration/docker-compose.test.yml up -d\``
  );
}

beforeAll(async () => {
  await waitForHealth(BFF_BASE_URL, HEALTH_TIMEOUT_MS);
}, HEALTH_TIMEOUT_MS + 10_000);

afterAll(async () => {
  // No-op — leaving stack up between runs is faster for local dev.
  // CI tears down via `docker compose down -v` after the suite.
});
