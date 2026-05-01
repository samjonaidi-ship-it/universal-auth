// @bainbridgebuilders/universal-auth | src/react/components/PersonaGuard.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Client-side persona gate per §D2.7. UX-only — server is source of truth.
//
// Usage:
//   <PersonaGuard requires={['admin','operator']} fallback={<AccessDenied/>}>
//     <AdminRoutes />
//   </PersonaGuard>

import type { ReactNode } from 'react';
import { useAuth } from '../useAuth.js';

export interface PersonaGuardProps {
  /** Persona types that pass the guard. Match logic = OR (any one is enough). */
  requires: readonly string[];
  /** Rendered when no required persona is present. */
  fallback?: ReactNode;
  children: ReactNode;
}

export function PersonaGuard({
  requires,
  fallback = null,
  children,
}: PersonaGuardProps): ReactNode {
  const { personas, status } = useAuth();
  if (status === 'loading') return null;
  if (status === 'anonymous') return fallback;

  const matched = personas.some((p) => requires.includes(p.persona_type));
  if (!matched) return fallback;
  return <>{children}</>;
}
