// @samjonaidi-ship-it/universal-auth | test/integration/test-mode-ingest-fetch.ts | v1.0.0 | 2026-11-04 | BB
// Wraps a fetch so POSTs to /events/v1/ingest carry X-Test-Mode-Key.
//
// Why: since BB_ControlTower PR #863 (merged 2026-10-22) /events/v1/ingest DROPS
// events from is_test_user identities (reason TEST_USER). The ONLY exemption is
// a request proving test mode (TEST_MODE_KEY + X-Test-Mode-Key), honoured
// outside production. The SDK's event reporter never sends that header (nor
// should the shipped SDK), so the integration suite adds it at the fetch layer.
// Without it test 04 got 0 events back from /_audit every night since 2026-10-21.

const INGEST_PATH = '/events/v1/ingest';

export function withTestModeIngest(base: typeof fetch, testModeKey: string): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes(INGEST_PATH)) return base(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('X-Test-Mode-Key', testModeKey);
    return base(input, { ...init, headers });
  }) as typeof fetch;
}
