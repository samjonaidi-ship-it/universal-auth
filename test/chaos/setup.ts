// @bainbridgebuilders/universal-auth | test/chaos/setup.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Chaos test setup — verifies Toxiproxy + CT BFF stack are reachable.
// Tests reset toxics in beforeEach so each scenario starts clean.

import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';

export const TOXIPROXY_API = process.env.TOXIPROXY_API ?? 'http://localhost:8474';
export const BFF_PROXY_URL = process.env.BFF_PROXY_URL ?? 'http://localhost:13300';
export const PROXY_NAME = 'ct-bff';

const HEALTH_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

async function waitForToxiproxy(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < HEALTH_TIMEOUT_MS) {
    try {
      const r = await fetch(`${TOXIPROXY_API}/version`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
  throw new Error(
    `[chaos setup] Toxiproxy at ${TOXIPROXY_API} did not become reachable. ` +
      `Did you bring up the chaos stack? \`docker compose -f test/integration/docker-compose.test.yml ` +
      `-f test/chaos/docker-compose.chaos.yml up -d\``
  );
}

async function waitForBff(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < HEALTH_TIMEOUT_MS) {
    try {
      const r = await fetch(`${BFF_PROXY_URL}/healthz`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
  throw new Error(
    `[chaos setup] CT BFF at ${BFF_PROXY_URL} (via Toxiproxy) did not respond.`
  );
}

beforeAll(async () => {
  await waitForToxiproxy();
  await waitForBff();
}, HEALTH_TIMEOUT_MS + 10_000);

beforeEach(async () => {
  // Reset all toxics on the proxy before each test
  await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics`, {
    method: 'GET',
  })
    .then((r) => r.json())
    .then(async (toxics: Array<{ name: string }>) => {
      for (const toxic of toxics) {
        await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics/${toxic.name}`, {
          method: 'DELETE',
        });
      }
    })
    .catch(() => {
      /* if proxy isn't there, fail later in the actual test */
    });

  // Re-enable proxy if a prior test disabled it
  await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  }).catch(() => {});
});

afterEach(async () => {
  // Same reset — defensive (in case test bailed mid-toxic)
  await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics`, { method: 'GET' })
    .then((r) => r.json())
    .then(async (toxics: Array<{ name: string }>) => {
      for (const toxic of toxics) {
        await fetch(
          `${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics/${toxic.name}`,
          { method: 'DELETE' }
        );
      }
    })
    .catch(() => {});
});

afterAll(async () => {
  // No teardown — leave stack up for next run
});
