// @bb/universal-auth | src/config.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// SDK initialization config + mode-safety assertion (§10.6 L1041).
// Day 1: config shape + safety check stub. Day 2+ wires to client.

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

/**
 * Initialize the SDK. Called once at app startup.
 *
 * Day 1 stub — actual wiring begins Day 2+ per plan.
 */
export async function initUniversalAuth(config: UniversalAuthConfig): Promise<void> {
  const mode: SdkMode = config.mode ?? 'production';

  // Browser-context safety check (skipped in Node test harness)
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    assertModeSafety(mode, window.location.hostname);
  }

  // TODO(Day 3-4 Block 2): wire core/client.ts, token-manager.ts, storage.ts, device-id.ts
  // TODO(Day 5-6 Block 3): wire flows + event-reporter + entitlements + settings-sync
  // TODO(Day 7-8 Block 3): wire offline queue + SW bridge
  // See plan Block 1-5 for full implementation sequence.

  // Day 1 no-op — registration only proves the API shape compiles.
  void config;
}
