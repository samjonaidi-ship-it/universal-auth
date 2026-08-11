// @samjonaidi-ship-it/universal-auth | test/unit/flows/drafts-flow.test.ts | v1.0.0 | 2026-08-11 | BB
// P5c — resumable drafts keyed by identity.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { http } = vi.hoisted(() => ({ http: { calls: [] as any[], reply: {} as any, fail: false } }));
vi.mock('../../../src/core/client.js', () => ({
  get: async (path: string) => { http.calls.push(['GET', path]); if (http.fail) throw new Error('offline'); return { data: http.reply }; },
  put: async (path: string, body: unknown) => { http.calls.push(['PUT', path, body]); if (http.fail) throw new Error('offline'); return { data: http.reply }; },
  del: async (path: string) => { http.calls.push(['DELETE', path]); if (http.fail) throw new Error('offline'); return { data: http.reply }; },
}));

let flow: typeof import('../../../src/flows/drafts-flow.js');
beforeEach(async () => {
  http.calls = []; http.reply = {}; http.fail = false;
  vi.resetModules();
  flow = await import('../../../src/flows/drafts-flow.js');
});

describe('P5c — getDraft', () => {
  it('returns the saved draft', async () => {
    http.reply = { draft: { description: 'half typed' }, updated_at: 't', device_family_id: 'f' };
    await expect(flow.getDraft('help_request')).resolves.toMatchObject({
      draft: { description: 'half typed' }, updated_at: 't', device_family_id: 'f',
    });
  });

  it('resolves draft:null rather than throwing when the read FAILS', async () => {
    // Resuming a form must never be able to stop the form from opening.
    http.fail = true;
    await expect(flow.getDraft('help_request')).resolves.toEqual({
      draft: null, updated_at: null, device_family_id: null,
    });
  });

  it('url-encodes the kind', async () => {
    await flow.getDraft('help request/../etc');
    expect(http.calls[0][1]).toBe('/auth/v1/drafts/help%20request%2F..%2Fetc');
  });
});

describe('P5c — putDraft', () => {
  it('saves and reports the server outcome', async () => {
    http.reply = { saved: true };
    await expect(flow.putDraft('help_request', { a: 1 })).resolves.toBe(true);
    expect(http.calls[0]).toEqual(['PUT', '/auth/v1/drafts/help_request', { content: { a: 1 } }]);
  });

  it('returns false when the server did NOT confirm', async () => {
    http.reply = {};
    await expect(flow.putDraft('help_request', { a: 1 })).resolves.toBe(false);
  });

  it('returns false offline instead of throwing — drafting in the field is normal', async () => {
    http.fail = true;
    await expect(flow.putDraft('help_request', { a: 1 })).resolves.toBe(false);
  });

  it('refuses a non-object without calling the server', async () => {
    await expect(flow.putDraft('k', null as never)).resolves.toBe(false);
    await expect(flow.putDraft('k', [1, 2] as never)).resolves.toBe(false);
    await expect(flow.putDraft('k', 'text' as never)).resolves.toBe(false);
    expect(http.calls).toEqual([]);
  });
});

describe('P5c — deleteDraft', () => {
  it('reports success', async () => {
    http.reply = { deleted: true };
    await expect(flow.deleteDraft('help_request')).resolves.toBe(true);
    expect(http.calls[0][0]).toBe('DELETE');
  });

  it('returns false offline rather than throwing', async () => {
    http.fail = true;
    await expect(flow.deleteDraft('help_request')).resolves.toBe(false);
  });
});
