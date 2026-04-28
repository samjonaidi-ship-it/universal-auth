// @bb/universal-auth | test/unit/imperative/getAuth.test.ts | v1.0.0-rc.1 | 2026-04-25 | BB
// Imperative non-React entry per §5.3. Currently scaffolded as a stub —
// concrete implementation lands when CalExp5 starts using it (Block 7).
// These tests pin the stub's API shape so it can't drift.

import { describe, it, expect } from 'vitest';
import { getAuth } from '../../../src/imperative/getAuth.js';

describe('imperative/getAuth — surface contract (§5.3)', () => {
  it('exposes the canonical 4-method AuthClient', () => {
    const auth = getAuth();
    expect(typeof auth.signIn).toBe('function');
    expect(typeof auth.getSession).toBe('function');
    expect(typeof auth.onSessionChange).toBe('function');
    expect(typeof auth.signOut).toBe('function');
  });

  it('getSession returns null in stub state', () => {
    expect(getAuth().getSession()).toBeNull();
  });

  it('signIn throws a clear "not implemented" error in stub state', async () => {
    await expect(
      getAuth().signIn({ destination: '+15555550100', channel: 'sms' })
    ).rejects.toThrow(/not yet implemented/);
  });

  it('signOut resolves without throwing in stub state', async () => {
    await expect(getAuth().signOut()).resolves.toBeUndefined();
  });

  it('onSessionChange returns an unsubscribe function', () => {
    const unsubscribe = getAuth().onSessionChange(() => undefined);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });
});
