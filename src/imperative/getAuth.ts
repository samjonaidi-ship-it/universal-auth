// @bainbridgebuilders/universal-auth | src/imperative/getAuth.ts | v1.0.1 | 2026-05-01 | BB
// Non-React imperative entry per spec §5.3. Returns a small client wrapping
// the token-manager + flow surfaces so consumers (e.g. CalExp5's api-base.js
// wrapper) can read the current access token, observe session changes, and
// sign out without going through React context.
//
// rc.3: replaced the Day-1 stub. signIn() delegates to flows/code-flow's
// requestCode + verifyCode (two-step). getSession() returns a thin Session
// projection from the token-manager + on-disk identity hint. signOut()
// delegates to flows/recovery.signOut.
//
// What this does NOT do (by design):
//   - Render any UI. Use the React surface for forms.
//   - Cache the full §D2.1 Session payload. Use `useAuth()` from the React
//     surface or call `/auth/v1/me` directly via flows.
//   - Return entitlements/personas in `getSession()`. Those live in the
//     React contexts. The imperative API is intentionally thin.

import {
  getAccessToken,
  getCurrentSessionId,
  hasLiveAccessToken,
  onSessionChange as tmOnSessionChange,
} from '../core/token-manager.js';
import { signOut as recoverySignOut } from '../flows/recovery.js';
import { requestCode, verifyCode, type VerifyCodeResult } from '../flows/code-flow.js';

/**
 * Minimal session projection exposed by the imperative API. Reflects what
 * the token-manager knows after a successful sign-in / refresh:
 *   - session_id (matches ct_bff.sessions.id)
 *   - is_authenticated (live token + non-expired)
 *
 * The access token is intentionally NOT in this snapshot. Callers needing
 * the bearer token must use `getAccessToken()` (async) so the token-manager
 * can refresh if needed and never hand out a stale token.
 *
 * For the full §D2.1 Session payload (identity, personas, aggregate, etc.)
 * call `/auth/v1/me` via the React `useAuth()` hook or fetch flows directly.
 */
export interface ImperativeSessionSnapshot {
  session_id: string | null;
  is_authenticated: boolean;
}

export interface AuthClient {
  /**
   * Code-flow sign-in: send an OTP to the destination. The caller then
   * calls `verify()` with the user-entered code. Most consumers should
   * use the React `<SignInForm>` for the two-step UX. The app_id and
   * device_id are injected from the SDK init config; not configurable
   * here.
   */
  signIn(params: { destination: string; channel?: 'sms' | 'email' }): Promise<void>;

  /**
   * Verify the code the user entered after `signIn()`. Returns the
   * server response. After this resolves, `getSession()` reflects the
   * new authenticated state.
   *
   * v1.0.1 (D6): typed return — was `Promise<unknown>`.
   */
  verify(params: { destination: string; code: string }): Promise<VerifyCodeResult>;

  /**
   * Returns a snapshot of the current session as the token-manager sees it.
   * Synchronous, zero network. Returns null fields when anonymous.
   */
  getSession(): ImperativeSessionSnapshot;

  /**
   * Get a valid access token, refreshing if expired. Returns null when
   * no session exists. For consumers (e.g. CalExp5's api-base wrapper)
   * that need to inject `Authorization: Bearer <token>` on cross-origin
   * fetches.
   */
  getAccessToken(): Promise<string | null>;

  /**
   * Subscribe to session changes (sign-in, refresh, sign-out, multi-tab
   * sync). Listener fires after the token-manager state mutates. Returns
   * an unsubscribe function.
   */
  onSessionChange(listener: (snapshot: ImperativeSessionSnapshot) => void): () => void;

  /**
   * Sign out: revoke the server-side session + clear local refresh token.
   * After this resolves, `getSession()` returns the anonymous snapshot.
   */
  signOut(): Promise<void>;
}

let cachedClient: AuthClient | null = null;

/**
 * Get the singleton imperative AuthClient.
 * Must be called after `initUniversalAuth()` (the client uses module state
 * that init wires up).
 */
export function getAuth(): AuthClient {
  if (cachedClient !== null) return cachedClient;

  cachedClient = {
    async signIn({ destination, channel }) {
      // exactOptionalPropertyTypes: don't pass `channel: undefined` —
      // omit the key entirely so the server-side inference path runs.
      const input: { destination: string; channel?: 'sms' | 'email' } = { destination };
      if (channel !== undefined) input.channel = channel;
      await requestCode(input);
    },

    async verify({ destination, code }) {
      return verifyCode({ destination, code });
    },

    getSession(): ImperativeSessionSnapshot {
      // Snapshot of the in-memory token state. For the bearer token use
      // getAccessToken() (async + refreshable); this getter is for
      // observers that just want to know "are we signed in?" without
      // triggering a network refresh.
      return {
        session_id: getCurrentSessionId(),
        is_authenticated: hasLiveAccessToken(),
      };
    },

    async getAccessToken(): Promise<string | null> {
      return getAccessToken();
    },

    onSessionChange(listener) {
      // Adapt the void→void token-manager listener to the snapshot-emitting
      // surface that consumers expect. We compute the snapshot lazily on each
      // notification so the listener sees the post-mutation state.
      return tmOnSessionChange(() => {
        try {
          listener({
            session_id: getCurrentSessionId(),
            is_authenticated: hasLiveAccessToken(),
          });
        } catch {
          // Listener bugs must not crash the token manager.
        }
      });
    },

    async signOut(): Promise<void> {
      await recoverySignOut();
    },
  };

  return cachedClient;
}

/**
 * Reset the cached client. Used by unit tests between cases.
 */
export function __resetGetAuthForTests(): void {
  cachedClient = null;
}
