// @bainbridgebuilders/universal-auth | test/chaos/toxics.ts | v1.0.0-rc.1 | 2026-04-28 | BB
// Toxic helpers — typed wrappers around Toxiproxy's REST API.
// One-shot per test: addToxic + later test code asserts SDK behavior.

import { TOXIPROXY_API, PROXY_NAME } from './setup.js';

interface ToxicAttributes {
  // latency: delay all packets by N ms (jitter ms variance)
  latency?: number;
  jitter?: number;
  // bandwidth: limit to N KB/s
  rate?: number;
  // timeout: kill connection after N ms
  timeout?: number;
  // slicer: random fragmentation
  average_size?: number;
  size_variation?: number;
  delay?: number;
  // limit_data: drop after N KB
  bytes?: number;
  // reset_peer: TCP RST after N ms
  // (no params — just timeout-then-RST)
}

export async function addToxic(
  type:
    | 'latency'
    | 'bandwidth'
    | 'timeout'
    | 'slicer'
    | 'limit_data'
    | 'slow_close'
    | 'reset_peer',
  attributes: ToxicAttributes,
  opts: { name?: string; stream?: 'upstream' | 'downstream'; toxicity?: number } = {}
): Promise<void> {
  const r = await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}/toxics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: opts.name ?? `${type}_${Date.now()}`,
      type,
      stream: opts.stream ?? 'downstream',
      toxicity: opts.toxicity ?? 1.0,
      attributes,
    }),
  });
  if (!r.ok) {
    throw new Error(
      `[toxics.addToxic] failed: HTTP ${r.status} ${await r.text()}`
    );
  }
}

/**
 * Disable the proxy entirely — simulates total network outage.
 * Re-enabled by the global beforeEach.
 */
export async function disableProxy(): Promise<void> {
  await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
}

export async function enableProxy(): Promise<void> {
  await fetch(`${TOXIPROXY_API}/proxies/${PROXY_NAME}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
}
