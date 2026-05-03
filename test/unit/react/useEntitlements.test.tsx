// @samjonaidi-ship-it/universal-auth | test/unit/react/useEntitlements.test.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for useEntitlements.ts (was 60%).

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AuthProvider } from '../../../src/react/AuthProvider.js';
import { useEntitlements } from '../../../src/react/useEntitlements.js';
import type { Session } from '../../../src/types/api.js';
import type { ReactNode } from 'react';

const SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  primary_persona: 'crew',
  personas: [
    {
      persona_type: 'crew',
      party_id: 'p',
      party_name: 'BB',
      role_in_party: 'r',
      ct_role: null,
      plan_slug: 'crew_basic',
      subscription_status: 'active',
      landing_route: '/crew',
    },
  ],
  aggregate: {
    features: ['timesheets.write', 'photos.upload'],
    app_access: ['bb_express'],
  },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

describe('useEntitlements', () => {
  it('throws when called outside <AuthProvider>', () => {
    expect(() => renderHook(() => useEntitlements())).toThrow(
      /useEntitlements\(\) called outside <AuthProvider>/
    );
  });

  it('returns features + app_access from session', () => {
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <AuthProvider initialSession={SESSION}>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    expect(result.current.features).toContain('timesheets.write');
    expect(result.current.features).toContain('photos.upload');
    expect(result.current.app_access).toContain('bb_express');
  });

  it('hasFeature returns true for declared features, false otherwise', () => {
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <AuthProvider initialSession={SESSION}>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    expect(result.current.hasFeature('timesheets.write')).toBe(true);
    expect(result.current.hasFeature('photos.upload')).toBe(true);
    expect(result.current.hasFeature('admin.delete-everything')).toBe(false);
  });

  it('hasAppAccess returns true for granted apps, false otherwise', () => {
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <AuthProvider initialSession={SESSION}>{children}</AuthProvider>
    );
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    expect(result.current.hasAppAccess('bb_express')).toBe(true);
    expect(result.current.hasAppAccess('bb_buddy_console')).toBe(false);
  });
});
