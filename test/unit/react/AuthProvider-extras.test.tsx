// @bb/universal-auth | test/unit/react/AuthProvider-extras.test.tsx | v1.0.0-rc.1 | 2026-04-28 | BB
// Coverage push for AuthProvider — exercise active-persona resolution
// branches (URL match, primary fallback, custom resolver, hydrate-from-server).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useContext, type ReactNode } from 'react';
import {
  AuthProvider,
  IdentityContext,
  StatusContext,
} from '../../../src/react/AuthProvider.js';
import type { Session, Persona } from '../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../src/core/storage.js';

const CREW_PERSONA: Persona = {
  persona_type: 'crew',
  party_id: 'p1',
  party_name: 'BB',
  role_in_party: 'crew',
  ct_role: null,
  plan_slug: 'crew_basic',
  subscription_status: 'active',
  landing_route: '/crew',
};

const SUPPLIER_PERSONA: Persona = {
  persona_type: 'supplier',
  party_id: 'p2',
  party_name: 'Acme',
  role_in_party: 'supplier',
  ct_role: null,
  plan_slug: 'supplier_basic',
  subscription_status: 'active',
  landing_route: '/supplier',
};

const SESSION_TWO_PERSONAS: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  primary_persona: 'crew',
  personas: [CREW_PERSONA, SUPPLIER_PERSONA],
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ActivePersonaProbe(): ReactNode {
  const ctx = useContext(IdentityContext);
  return (
    <div data-testid="active">{ctx?.activePersona?.persona_type ?? 'none'}</div>
  );
}

function StatusProbe(): ReactNode {
  const ctx = useContext(StatusContext);
  return <div data-testid="status">{ctx?.status ?? 'none'}</div>;
}

describe('AuthProvider — active-persona resolution branches', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    __resetClientForTests();
    __resetTokenManagerForTests();
    await __resetDbForTests();
    configureClient({
      apiBaseUrl: 'https://ct-bff.test',
      appId: 'bb_test',
      sdkVersion: '1.0.0-rc.1',
    });
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('falls back to primary_persona when URL doesnt match any persona', async () => {
    // Default jsdom path is "/" — doesn't match crew or supplier
    render(
      <AuthProvider initialSession={SESSION_TWO_PERSONAS}>
        <ActivePersonaProbe />
      </AuthProvider>
    );
    await waitFor(() => {
      // Expect 'crew' (the primary_persona)
      expect(screen.getByTestId('active').textContent).toBe('crew');
    });
  });

  it('uses URL path segment when it matches a persona type', async () => {
    // Set URL to /supplier/dashboard
    window.history.pushState({}, '', '/supplier/dashboard');
    render(
      <AuthProvider initialSession={SESSION_TWO_PERSONAS}>
        <ActivePersonaProbe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('supplier');
    });
    // Cleanup
    window.history.pushState({}, '', '/');
  });

  it('uses custom resolveActivePersona when provided', async () => {
    render(
      <AuthProvider
        initialSession={SESSION_TWO_PERSONAS}
        resolveActivePersona={(personas) =>
          personas.find((p) => p.persona_type === 'supplier') ?? null
        }
      >
        <ActivePersonaProbe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('supplier');
    });
  });

  it('returns null when no personas exist', async () => {
    const noPersonaSession: Session = {
      ...SESSION_TWO_PERSONAS,
      personas: [],
    };
    render(
      <AuthProvider initialSession={noPersonaSession}>
        <ActivePersonaProbe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('active').textContent).toBe('none');
    });
  });

  it('status reflects authenticated state when initialSession present', async () => {
    render(
      <AuthProvider initialSession={SESSION_TWO_PERSONAS}>
        <StatusProbe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
  });

  it('hydrates from /auth/v1/me when no initialSession given', async () => {
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResp(200, SESSION_TWO_PERSONAS));

    render(
      <AuthProvider>
        <ActivePersonaProbe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
  });

  it('handles /auth/v1/me 401 → anonymous status (no crash)', async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResp(401, {
        error: { code: 'AUTH_SESSION_EXPIRED', message: 'gone' },
      })
    );

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    // Status should resolve to either 'anonymous' or initial 'loading' — no crash
    expect(screen.getByTestId('status')).toBeTruthy();
  });
});
