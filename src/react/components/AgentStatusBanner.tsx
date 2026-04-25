// @bb/universal-auth | src/react/components/AgentStatusBanner.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Per §D2.5 / D13 — disclosure banner shown in Tier-3 conversational surfaces
// (Buddy chat). Required by §6 of BB_AGENT_IDENTITY_SPEC consent model.

import type { ReactNode } from 'react';
import { useAuth } from '../useAuth.js';

export interface AgentStatusBannerProps {
  /** If true, render disclosure_text from agent context. Default true. */
  showDisclosure?: boolean;
  /** "Talk to a human" CTA label. */
  escapeHatchLabel?: string;
  /** Called when escape-hatch is clicked. */
  onEscape?: () => void;
}

export function AgentStatusBanner({
  showDisclosure = true,
  escapeHatchLabel = 'Talk to a human',
  onEscape,
}: AgentStatusBannerProps): ReactNode {
  const { agent } = useAuth();
  if (agent === null) return null;

  return (
    <aside
      className="bb-auth-agent-banner"
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
