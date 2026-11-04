// Guards the integration-suite helper that keeps ingest working for test
// users after BB_ControlTower PR #863 (TEST_USER drop + X-Test-Mode-Key exemption).
import { describe, it, expect, vi } from 'vitest';
import { withTestModeIngest } from '../integration/test-mode-ingest-fetch.js';

describe('withTestModeIngest', () => {
  it('adds X-Test-Mode-Key on /events/v1/ingest and keeps other headers', async () => {
    const base = vi.fn(async () => new Response('{}'));
    const f = withTestModeIngest(base as unknown as typeof fetch, 'k1');
    await f('http://x/events/v1/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const h = new Headers((base.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect(h.get('x-test-mode-key')).toBe('k1');
    expect(h.get('content-type')).toBe('application/json');
  });

  it('leaves every other URL untouched', async () => {
    const base = vi.fn(async () => new Response('{}'));
    const f = withTestModeIngest(base as unknown as typeof fetch, 'k1');
    await f('http://x/auth/v1/refresh', { method: 'POST' });
    expect((base.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toBeUndefined();
  });
});
