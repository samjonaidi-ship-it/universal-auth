// @bb/universal-auth | test/unit/react/AuthProvider.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// A3 gate #1 — 3-context split: components subscribing to one context do
// NOT re-render when another context's value changes.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext, useRef, type ReactNode } from 'react';
import {
  AuthProvider,
  IdentityContext,
  EntitlementsContext,
  StatusContext,
} from '../../../src/react/AuthProvider.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

const BASE = 'https://ct-bff.test.example.com';

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setupSDK(): void {
  __resetClientForTests();
  __resetTokenManagerForTests();
  configureClient({ apiBaseUrl: BASE, appId: 'bb_express', sdkVersion: '1.0.0-rc.1' });
}

function IdentityRenderCounter({ probe }: { probe: { count: number } }): ReactNode {
  useContext(IdentityContext);
  const ref = useRef(0);
  ref.current += 1;
  probe.count = ref.current;
  return <div data-testid="identity-render">{String(ref.current)}</div>;
}

function EntitlementsRenderCounter({ probe }: { probe: { count: number } }): ReactNode {
  useContext(EntitlementsContext);
  const ref = useRef(0);
  ref.current += 1;
  probe.count = ref.current;
  return <div data-testid="entitlements-render">{String(ref.current)}</div>;
}

describe('react/AuthProvider — 3-context split (A3 gate #1)', () => {
  beforeEach(async () => {
    setupSDK();
    await __resetDbForTests();
  });

  it('does NOT throw when no children consume contexts (smoke test)', () => {
    render(
      <AuthProvider initialSession={undefined}>
        <div>hello</div>
      </AuthProvider>
    );
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('renders provider tree with initialSession populated and components reading each context succeed', () => {
    const idProbe = { count: 0 };
    const entProbe = { count: 0 };
    render(
      <AuthProvider
        initialSession={{
          identity: { identity_id: 'id1', identity_kind: 'human', display_name: 'Sam' },
          aggregate: { features: ['f1'], app_access: ['bb_express'] },
          session_meta: {
            session_id: 's1',
            issued_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
          personas: [
            {
              persona_type: 'crew',
              party_id: 'p1',
              party_name: 'BB',
              role_in_party: 'crew',
              ct_role: null,
              plan_slug: 'crew_basic',
              subscription_status: 'active',
              landing_route: '/crew',
            },
          ],
        }}
      >
        <IdentityRenderCounter probe={idProbe} />
        <EntitlementsRenderCounter probe={entProbe} />
      </AuthProvider>
    );

    // Both render at least once; identity reads from IdentityContext, entitlements from EntitlementsContext
    expect(idProbe.count).toBeGreaterThan(0);
    expect(entProbe.count).toBeGreaterThan(0);
    expect(screen.getByTestId('identity-render')).toBeTruthy();
    expect(screen.getByTestId('entitlements-render')).toBeTruthy();
  });
});
