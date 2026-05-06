// @samjonaidi-ship-it/universal-auth | src/react/components/PersonaGuard.tsx | v1.1.0 | 2026-05-06 | BB
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

import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '../useAuth.js';

export interface PersonaGuardProps {
  /** Persona types that pass the guard. Match logic = OR (any one is enough). */
  requires: readonly string[];
  /** Rendered when no required persona is present. */
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
  const { personas, status } = useAuth();
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

  const matched = personas.some((p) => requires.includes(p.persona_type));
  if (!matched) return wrap(fallback);
  return wrap(children);
}
