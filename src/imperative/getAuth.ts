// @bb/universal-auth | src/imperative/getAuth.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Non-React entry point per §5.3 L403. Returns an imperative AuthClient
// with signIn / getSession / onSessionChange.
//
// Day 1 stub — concrete implementation in Block 2-3 (Days 3-6).

import type { Session } from '../types/api.js';

export interface AuthClient {
  signIn(params: { destination: string; channel: 'sms' | 'email' }): Promise<Session>;
  getSession(): Session | null;
  onSessionChange(listener: (session: Session | null) => void): () => void;
  signOut(): Promise<void>;
}

/**
 * Get the singleton imperative AuthClient.
 * Must be called after `initUniversalAuth()`.
 *
 * Day 1 stub — returns a no-op client. Implementation wired in Block 2-3.
 */
export function getAuth(): AuthClient {
  return {
    async signIn(): Promise<Session> {
      throw new Error('[@bb/universal-auth] getAuth().signIn() not yet implemented — arrives Block 3 (Day 5-6).');
    },
    getSession(): Session | null {
      return null;
    },
    onSessionChange(_listener: (session: Session | null) => void): () => void {
      // returns unsubscribe function
      return () => {};
    },
    async signOut(): Promise<void> {
      // no-op until Block 3
    },
  };
}
