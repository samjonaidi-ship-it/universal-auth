// @bainbridgebuilders/universal-auth | test/unit/react/components/OfflineIndicator.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Smoke — renders only in offline status.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { OfflineIndicator } from '../../../../src/react/components/OfflineIndicator.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
  personas: [],
};

describe('OfflineIndicator', () => {
  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_express',
      sdkVersion: '1.0.0-rc.1',
    });
  });

  it('renders nothing when status=authenticated (online)', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    render(
      <AuthProvider initialSession={SESSION}>
        <OfflineIndicator />
      </AuthProvider>
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the banner when navigator.onLine === false at mount', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(
      <AuthProvider initialSession={SESSION}>
        <OfflineIndicator label="Custom offline message" />
      </AuthProvider>
    );
    // applySession reads navigator.onLine and sets status='offline'
    expect(screen.getByRole('status').textContent).toBe('Custom offline message');
    // restore for other tests
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
});
