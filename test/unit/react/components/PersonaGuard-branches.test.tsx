// @samjonaidi-ship-it/universal-auth | test/unit/react/components/PersonaGuard-branches.test.tsx | v1.0.1 | 2026-05-08 | BB
// COV-1 finish (rc.5+ → GA): coverage tests for PersonaGuard.
//
// Targeted branches (per `pnpm test:unit` rc.5: 77.77% on this file):
//   - line 36: status === 'loading' returns null
//   - line 39-45: wrap() — className+style present vs absent (4 branches)
//   - line 47: status === 'anonymous' renders fallback
//   - line 49-50: matched=true renders children, matched=false renders fallback

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PersonaGuard } from '../../../../src/react/components/PersonaGuard.js';

// Render-helper: wraps <PersonaGuard> inside an <AuthProvider> stub.
// PersonaGuard reads useAuth() — mock the hook directly.
import * as useAuthModule from '../../../../src/react/useAuth.js';
import { vi } from 'vitest';

function withAuth(
  status: 'loading' | 'anonymous' | 'authenticated',
  personas: ReadonlyArray<{ persona_type: string }>,
): void {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    identity: null,
    status,
    personas,
    activePersona: null,
    primary_persona: null,
    hasPersona: () => false,
    switchActivePersona: async () => undefined,
    allFeatures: () => [],
    agent: null,
    signIn: (() => Promise.resolve()) as unknown as ReturnType<typeof useAuthModule.useAuth>['signIn'],
    requestCode: (() => Promise.resolve()) as unknown as ReturnType<typeof useAuthModule.useAuth>['requestCode'],
    signOut: async () => undefined,
    signOutEverywhere: async () => undefined,
  } as unknown as ReturnType<typeof useAuthModule.useAuth>);
}

describe('PersonaGuard — branch coverage (COV-1 finish)', () => {
  it('returns null when auth status is loading', () => {
    withAuth('loading', []);
    const { container } = render(
      <PersonaGuard requires={['admin']} fallback={<span>no</span>}>
        <span>yes</span>
      </PersonaGuard>,
    );
    // Loading branch — neither yes nor no should render
    expect(container.textContent).toBe('');
    vi.restoreAllMocks();
  });

  it('renders fallback when status is anonymous', () => {
    withAuth('anonymous', []);
    render(
      <PersonaGuard requires={['admin']} fallback={<span>fallback</span>}>
        <span>protected</span>
      </PersonaGuard>,
    );
    expect(screen.getByText('fallback')).toBeTruthy();
    expect(screen.queryByText('protected')).toBeNull();
    vi.restoreAllMocks();
  });

  it('renders children when an authenticated persona matches', () => {
    withAuth('authenticated', [{ persona_type: 'admin' }]);
    render(
      <PersonaGuard requires={['admin']} fallback={<span>fallback</span>}>
        <span>protected</span>
      </PersonaGuard>,
    );
    expect(screen.getByText('protected')).toBeTruthy();
    expect(screen.queryByText('fallback')).toBeNull();
    vi.restoreAllMocks();
  });

  it('renders fallback when authenticated persona does not match', () => {
    withAuth('authenticated', [{ persona_type: 'crew' }]);
    render(
      <PersonaGuard requires={['admin']} fallback={<span>fallback</span>}>
        <span>protected</span>
      </PersonaGuard>,
    );
    expect(screen.getByText('fallback')).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('matches OR semantics across multiple required personas', () => {
    withAuth('authenticated', [{ persona_type: 'operator' }]);
    render(
      <PersonaGuard requires={['admin', 'operator']} fallback={<span>fallback</span>}>
        <span>protected</span>
      </PersonaGuard>,
    );
    expect(screen.getByText('protected')).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('wraps in <div> when className is provided', () => {
    withAuth('authenticated', [{ persona_type: 'admin' }]);
    const { container } = render(
      <PersonaGuard requires={['admin']} className="custom-wrap">
        <span>protected</span>
      </PersonaGuard>,
    );
    const wrapper = container.querySelector('div.custom-wrap');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toBe('protected');
    vi.restoreAllMocks();
  });

  it('wraps in <div> when style is provided', () => {
    withAuth('authenticated', [{ persona_type: 'admin' }]);
    const { container } = render(
      <PersonaGuard requires={['admin']} style={{ color: 'red' }}>
        <span>protected</span>
      </PersonaGuard>,
    );
    const wrapper = container.querySelector('div');
    expect(wrapper).toBeTruthy();
    expect((wrapper as HTMLDivElement).style.color).toBe('red');
    vi.restoreAllMocks();
  });

  it('does NOT wrap in <div> when neither className nor style is provided', () => {
    withAuth('authenticated', [{ persona_type: 'admin' }]);
    const { container } = render(
      <PersonaGuard requires={['admin']}>
        <span data-testid="bare">protected</span>
      </PersonaGuard>,
    );
    // The <span> should be the direct first child (no <div> wrapper)
    expect(container.firstElementChild?.tagName).toBe('SPAN');
    vi.restoreAllMocks();
  });

  it('uses null fallback by default', () => {
    withAuth('anonymous', []);
    const { container } = render(
      <PersonaGuard requires={['admin']}>
        <span>protected</span>
      </PersonaGuard>,
    );
    expect(container.textContent).toBe('');
    vi.restoreAllMocks();
  });
});
