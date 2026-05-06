// @samjonaidi-ship-it/universal-auth | src/react/components/AgentStatusBanner.tsx | v1.1.0 | 2026-05-06 | BB
// Per §D2.5 / D13 — disclosure banner shown in Tier-3 conversational surfaces
// (Buddy chat). Required by §6 of BB_AGENT_IDENTITY_SPEC consent model.
//
// v1.1.0 (P1-A): + className/style

import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '../useAuth.js';

export interface AgentStatusBannerProps {
  /** If true, render disclosure_text from agent context. Default true. */
  showDisclosure?: boolean;
  /** "Talk to a human" CTA label. */
  escapeHatchLabel?: string;
  /** Called when escape-hatch is clicked. */
  onEscape?: () => void;
  /** Optional class for the root <aside>. */
  className?: string;
  /** Inline style for the root <aside>. */
  style?: CSSProperties;
}

export function AgentStatusBanner({
  showDisclosure = true,
  escapeHatchLabel = 'Talk to a human',
  onEscape,
  className,
  style,
}: AgentStatusBannerProps): ReactNode {
  const { agent } = useAuth();
  if (agent === null) return null;

  return (
    <aside
      className={className ?? 'bb-auth-agent-banner'}
      style={style}
      role="region"
      aria-label="AI assistant disclosure"
    >
      <span className="bb-auth-agent-banner-class">{agent.class}</span>
      <span className="bb-auth-agent-banner-tier"> · Tier {agent.tier}</span>
      {showDisclosure ? (
        <p className="bb-auth-agent-banner-disclosure">{agent.disclosure_text}</p>
      ) : null}
      {onEscape !== undefined ? (
        <button
          type="button"
          className="bb-auth-button bb-auth-button-link"
          onClick={onEscape}
        >
          {escapeHatchLabel}
        </button>
      ) : null}
    </aside>
  );
}
