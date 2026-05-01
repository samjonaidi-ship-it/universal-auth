// @bainbridgebuilders/universal-auth | test/unit/react/components/AppChooser.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Smoke + fallback to useEntitlements().app_access (Gap 3 fix).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { AppChooser } from '../../../../src/react/components/AppChooser.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';

function makeSession(appAccess: string[]): Session {
  return {
    identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
    aggregate: { features: [], app_access: appAccess },
    session_meta: {
      session_id: 's',
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    personas: [],
  };
}

describe('AppChooser', () => {
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

  it('renders apps from explicit `apps` prop', () => {
    render(
      <AuthProvider initialSession={makeSession(['ignored'])}>
        <AppChooser apps={['bb_express', 'controltower']} onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.getByRole('button', { name: /bb express/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /controltower/i })).toBeTruthy();
  });

  it('falls back to useEntitlements().app_access when apps prop is omitted (Gap 3 fix)', () => {
    render(
      <AuthProvider initialSession={makeSession(['bb_express', 'buddy_console'])}>
        <AppChooser onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.getByRole('button', { name: /bb express/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /buddy console/i })).toBeTruthy();
    // controltower not in app_access — must NOT render
    expect(screen.queryByRole('button', { name: /controltower/i })).toBeNull();
  });

  it('renders nothing when both prop and entitlements are empty', () => {
    render(
      <AuthProvider initialSession={makeSession([])}>
        <AppChooser onSelect={vi.fn()} />
      </AuthProvider>
    );
    expect(screen.queryByRole('region', { name: /choose an app/i })).toBeNull();
  });

  it('calls onSelect with the app id', () => {
    const onSelect = vi.fn();
    render(
      <AuthProvider initialSession={makeSession([])}>
        <AppChooser apps={['bb_express']} onSelect={onSelect} />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /bb express/i }));
    expect(onSelect).toHaveBeenCalledWith('bb_express');
  });
});
