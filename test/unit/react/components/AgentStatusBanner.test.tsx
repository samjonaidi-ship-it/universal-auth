// @bainbridgebuilders/universal-auth | test/unit/react/components/AgentStatusBanner.test.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Smoke — renders only when identity_kind=agent; surfaces disclosure_text.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../../../../src/react/AuthProvider.js';
import { AgentStatusBanner } from '../../../../src/react/components/AgentStatusBanner.js';
import type { Session } from '../../../../src/types/api.js';
import { configureClient, __resetClientForTests } from '../../../../src/core/client.js';
import { __resetTokenManagerForTests } from '../../../../src/core/token-manager.js';
import { __resetDbForTests } from '../../../../src/core/storage.js';

const HUMAN_SESSION: Session = {
  identity: { identity_id: 'sam', identity_kind: 'human', display_name: 'Sam' },
  aggregate: { features: [], app_access: [] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
  personas: [],
};

const AGENT_SESSION: Session = {
  identity: {
    identity_id: 'buddy_agent',
    identity_kind: 'agent',
    display_name: 'Buddy',
  },
  aggregate: { features: [], app_access: ['buddy_console'] },
  session_meta: {
    session_id: 's',
    issued_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  },
  agent: {
    class: 'buddy',
    tier: 3,
    version: '1.0.0',
    disclosure_text: "I'm Buddy, BB's automated assistant.",
    outbound_policy: 'approval_required',
    acting_on_behalf_of: 'sam',
    on_behalf_of_persona: 'client',
  },
};

describe('AgentStatusBanner', () => {
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

  it('renders nothing for human identities', () => {
    render(
      <AuthProvider initialSession={HUMAN_SESSION}>
        <AgentStatusBanner />
      </AuthProvider>
    );
    expect(screen.queryByRole('region', { name: /assistant disclosure/i })).toBeNull();
  });

  it('renders disclosure for agent identity_kind', () => {
    render(
      <AuthProvider initialSession={AGENT_SESSION}>
        <AgentStatusBanner />
      </AuthProvider>
    );
    const region = screen.getByRole('region', { name: /assistant disclosure/i });
    expect(region.textContent).toMatch(/buddy/i);
    expect(region.textContent).toMatch(/tier 3/i);
    expect(region.textContent).toMatch(/i'm buddy/i);
  });

  it('renders escape-hatch button when onEscape provided', () => {
    const onEscape = vi.fn();
    render(
      <AuthProvider initialSession={AGENT_SESSION}>
        <AgentStatusBanner onEscape={onEscape} />
      </AuthProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /talk to a human/i }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
