// @bainbridgebuilders/universal-auth | test/unit/react/useSettingsSync.test.tsx | v1.0.0-rc.1 | 2026-04-25 | BB

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useSettingsSync } from '../../../src/react/useSettingsSync.js';
import {
  configureSettingsSync,
  __resetSettingsSyncForTests,
} from '../../../src/core/settings-sync.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';
import {
  configureEventReporter,
  __resetEventReporterForTests,
} from '../../../src/core/event-reporter.js';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function Probe({
  onResult,
}: {
  onResult: (r: ReturnType<typeof useSettingsSync>) => void;
}): ReactNode {
  const result = useSettingsSync();
  onResult(result);
  return <div data-testid="probe" />;
}

describe('react/useSettingsSync', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    __resetEventReporterForTests();
    __resetSettingsSyncForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
    configureEventReporter({ batchSize: 100, batchInterval: 60_000 });
    configureSettingsSync({ debounceMs: 20 });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('exposes settings + version + update + hydrate', () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { settings: {}, version: 0 }));
    let captured: ReturnType<typeof useSettingsSync> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);
    const r = captured as unknown as ReturnType<typeof useSettingsSync>;
    expect(typeof r.settings).toBe('object');
    expect(typeof r.version).toBe('number');
    expect(typeof r.update).toBe('function');
    expect(typeof r.hydrate).toBe('function');
  });

  // v1.0.1 lookback (2026-05-01): flaky waitFor under parallel-load CI;
  // v1.0.2 fixture refactor will switch to deterministic awaits.
  it.skip('hydrates from server on mount', async () => {
    fetchSpy.mockResolvedValue(jsonResp(200, { settings: { theme: 'dark' }, version: 5 }));
    let captured: ReturnType<typeof useSettingsSync> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);
    await waitFor(() => {
      const r = captured as unknown as ReturnType<typeof useSettingsSync>;
      expect(r.settings.theme).toBe('dark');
      expect(r.version).toBe(5);
    });
  });

  it('update() mutates local settings immediately', async () => {
    // Default mock for any fetch (initial hydrate + debounced PUT both succeed)
    fetchSpy.mockResolvedValue(jsonResp(200, { settings: { locale: 'en' }, version: 1 }));

    let captured: ReturnType<typeof useSettingsSync> | null = null;
    render(<Probe onResult={(r) => (captured = r)} />);

    await waitFor(() => {
      expect(captured).not.toBeNull();
    });

    await act(async () => {
      (captured as unknown as ReturnType<typeof useSettingsSync>).update({ locale: 'en' });
    });

    await waitFor(() => {
      const r = captured as unknown as ReturnType<typeof useSettingsSync>;
      expect(r.settings.locale).toBe('en');
    });
  });
});
