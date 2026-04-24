// @bb/universal-auth | src/config.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// SDK initialization config + mode-safety assertion (§10.6 L1041).
// Day 3-4: wires core modules (client, token-manager) via configureClient().

/**
 * Operating modes per §10 L988-L1052.
 * - `production`: full enforcement, real SMS/email, no banners
 * - `development`: accelerated TTLs, verbose logs, DEV banner
 * - `test`: header-gated, seed users, ephemeral events, TEST banner
 * - `e2e`: dedicated `ct_bff_e2e` schema, outbox captures
 * - `simulate`: RESERVED v1.4.0 §10.5 — not implemented; treated as `test` if passed
 */
export type SdkMode = 'production' | 'development' | 'test' | 'e2e' | 'simulate';

/**
 * How to handle persona mismatch when active persona isn't in `allowedPersonas` (D10 per §D2.3 L1580).
 */
export type PersonaMismatchBehavior = 'redirect_to_app_chooser' | 'show_persona_chooser' | 'error';

/**
 * How to handle agent sessions per D11 (§D2.3 L1584).
 */
export type AgentSessionBehavior = 'render_agent_ui' | 'redirect_to_admin' | 'error';

/**
 * Per-persona auto-prompt policy for ProfileSetupScreen (§5.5.2 L619).
 */
export interface ProfileConfig {
  /** Completeness threshold below which SDK surfaces `needsSetup` (§5.5.2 L624). Default 60. */
  autoPromptThreshold?: number;
  /** Personas that trigger auto-prompt. Default: all non-admin. */
  autoPromptPersonas?: string[];
  /** If true, modal blocks app until complete; if false, non-blocking banner. Default false. */
  blockAppUntilComplete?: boolean;
}

export interface UniversalAuthConfig {
  /** CT BFF base URL, e.g. `https://ct-bff.bainbridgebuilders.com` */
  apiBaseUrl: string;
  /** App id registered in `ct_bff.apps` — e.g., `bb_express`, `controltower` (§D2.3 L1573) */
  appId: string;
  /** Operating mode (§10 L988). Default `production`. */
  mode?: SdkMode;

  // Cross-subdomain cookie per D10 + SDK §5.0 v1.4.0 locked
  /** Cookie domain for shared session across subdomains. Default `.bainbridgebuilders.com`. */
  cookieDomain?: string;

  // Per-app persona gating per D10
  /** Personas this app accepts. Default all. */
  allowedPersonas?: string[];
  /** Behavior on persona mismatch. */
  onPersonaMismatch?: PersonaMismatchBehavior;

  // Agent session handling per D11/D13
  onAgentSessionDetected?: AgentSessionBehavior;

  // Feature toggles
  passkey?: { enabled?: boolean };
  offline?: { enabled?: boolean; maxQueueSize?: number };
  events?: { batchInterval?: number; batchSize?: number };
  settings?: { debounceMs?: number };
  profile?: ProfileConfig;

  /** Optional Sentry-compatible error hook per §12.3 L1215. */
  onError?: (err: unknown) => void;
}

/**
 * Mode-safety assertion per §10.6 L1041.
 * Throws if non-production mode attempted on a `.bainbridgebuilders.com` hostname.
 *
 * Exported for unit testing; called from `initUniversalAuth`.
 */
export function assertModeSafety(
  mode: SdkMode,
  hostname: string
): void {
  if (mode !== 'production' && hostname.endsWith('.bainbridgebuilders.com')) {
    throw new Error(
      `[@bb/universal-auth] Non-production mode '${mode}' forbidden on production domain '${hostname}'. ` +
        `See SDK spec §10.6 L1041.`
    );
  }
}

/** Current SDK version. Stamped on every event + every outbound HTTP request. */
export const SDK_VERSION = '1.0.0-rc.1';

/**
 * Initialize the SDK. Called once at app startup.
 *
 * Day 3-4 (Block 2): wires core/client.ts with the CT BFF base URL + appId.
 * Subsequent blocks layer in flows (Block 3), offline queue (Block 3), and
 * React providers (Block 4).
 */
export async function initUniversalAuth(config: UniversalAuthConfig): Promise<void> {
  const mode: SdkMode = config.mode ?? 'production';

  // Browser-context safety check (skipped in Node test harness)
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    assertModeSafety(mode, window.location.hostname);
  }

  // Wire the HTTP client (registers the refresh callback with token-manager internally)
  const { configureClient } = await import('./core/client.js');
  configureClient({
    apiBaseUrl: config.apiBaseUrl,
    appId: config.appId,
    sdkVersion: SDK_VERSION,
  });

  // Pending subsequent blocks (to be wired when modules land):
  //   Block 3 Day 5-6: flows (code-flow, enroll-flow, passkey-flow)
  //   Block 3 Day 5-6: event-reporter, entitlements, settings-sync, session-watcher
  //   Block 3 Day 7-8: offline queue + SW bridge
  //   Block 4 Day 9-10: React AuthProvider + useAuth hook tree

  void config;
}
