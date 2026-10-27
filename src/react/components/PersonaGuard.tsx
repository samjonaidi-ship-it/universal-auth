// @samjonaidi-ship-it/universal-auth | src/react/components/PersonaGuard.tsx | v1.2.0 | 2026-10-27 | BB
// Client-side persona gate per §D2.7. UX-only — server is source of truth.
//
// Usage:
//   <PersonaGuard requires={['admin','operator']} fallback={<AccessDenied/>}>
//     <AdminRoutes />
//   </PersonaGuard>
//
// v1.1.0 (P1-A): + className/style — when either is provided, the rendered
// branch is wrapped in a <div>. Without them, the component still renders a
// bare fragment so it stays layout-neutral (the original v1.0 behavior).
//
// v1.2.0 (role unification F2): the guard tests ONLY the active sign-in persona
// (useAuth().activePersona), never the union of every persona the identity
// holds. A crew sign-in on an identity that also holds 'admin' must not pass
// requires=['admin']. No personas => fallback; personas present but the active
// one not yet resolved => render nothing (never a fallback flash/redirect).
//
// UX-only: the active persona is client state (URL segment / switchActivePersona),
// not a server-proven sign-in. The server must enforce the role (F2 server side).
// Apps must call switchActivePersona() when the user changes persona.

import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '../useAuth.js';

export interface PersonaGuardProps {
  /** Persona types that pass the guard. Match logic = OR against the ACTIVE persona only. */
  requires: readonly string[];
  /** Rendered when the active persona is not one of `requires`. */
  fallback?: ReactNode;
  children: ReactNode;
  /** Optional class — when set, the rendered branch is wrapped in a <div>. */
  className?: string;
  /** Inline style — when set, the rendered branch is wrapped in a <div>. */
  style?: CSSProperties;
}

export function PersonaGuard({
  requires,
  fallback = null,
  children,
  className,
  style,
}: PersonaGuardProps): ReactNode {
  const { activePersona, personas, status } = useAuth();
  if (status === 'loading') return null;

  const wrap = (node: ReactNode): ReactNode =>
    className !== undefined || style !== undefined ? (
      <div className={className} style={style}>
        {node}
      </div>
    ) : (
      <>{node}</>
    );

  if (status === 'anonymous') return wrap(fallback);

  // AuthProvider resolves the active persona in an effect, one commit AFTER the
  // session lands (personas set, activePersona still null). Render nothing in
  // that window so a fallback redirect cannot fire for a user who will pass.
  // No personas at all is a settled state: fall through to the fallback.
  if (activePersona === null && personas.length > 0) return null;

  const matched =
    activePersona !== null && requires.includes(activePersona.persona_type);
  if (!matched) return wrap(fallback);
  return wrap(children);
}
