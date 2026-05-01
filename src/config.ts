// @bainbridgebuilders/universal-auth | src/config.ts | v1.0.1 | 2026-05-01 | BB
// SDK initialization config + mode-safety assertion (§10.6).
// Day 3-4: wires core modules (client, token-manager) via configureClient().
// v1.0.1: assertModeSafety now consumes config.cookieDomain (no hardcoded domain).

/**
 * Operating modes per §10.
 * - `production`: full enforcement, real SMS/email, no banners
 * - `development`: accelerated TTLs, verbose logs, DEV banner
 * - `test`: header-gated, seed users, ephemeral events, TEST banner
 * - `e2e`: dedicated `ct_bff_e2e` schema, outbox captures
 * - `simulate`: RESERVED v1.4.0 §10.5 — not implemented; treated as `test` if passed
 */
export type SdkMode = 'production' | 'development' | 'test' | 'e2e' | 'simulate';

/**
 * How to handle persona mismatch when active persona isn't in `allowedPersonas` (D10 per §D2.3).
 */
export type PersonaMismatchBehavior = 'redirect_to_app_chooser' | 'show_persona_chooser' | 'error';

/**
 * How to handle agent sessions per D11 (§D2.3).
 */
export type AgentSessionBehavior = 'render_agent_ui' | 'redirect_to_admin' | 'error';

/**
 * Per-persona auto-prompt policy for ProfileSetupScreen (§5.5.2).
 */
export interface ProfileConfig {
  /** Completeness threshold below which SDK surfaces `needsSetup` (§5.5.2). Default 60. */
  autoPromptThreshold?: number;
  /** Personas that trigger auto-prompt. Default: all non-admin. */
  autoPromptPersonas?: string[];
  /** If true, modal blocks app until complete; if false, non-blocking banner. Default false. */
  blockAppUntilComplete?: boolean;
}

export interface UniversalAuthConfig {
  /** CT BFF base URL, e.g. `https://ct-bff.bainbridgebuilders.com` */
  apiBaseUrl: string;
  /** App id registered in `ct_bff.apps` — e.g., `bb_express`, `controltower` (§D2.3) */
  appId: string;
  /** Operating mode (§10). Default `production`. */
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

  /** Optional Sentry-compatible error hook per §12.3. */
  onError?: (err: unknown) => void;
}

/**
 * Mode-safety assertion per §10.6.
 * Throws if non-production mode is attempted on the configured production domain.
 *
 * v1.0.1: consumes `cookieDomain` from config rather than a hardcoded literal,
 * so the D20 domain cutover (2026-05-03) is data-only with no SDK rebuild.
 *
 * Exported for unit testing; called from `initUniversalAuth`.
 */
export function assertModeSafety(
  mode: SdkMode,
  hostname: string,
  cookieDomain?: string
): void {
  if (mode === 'production') return;
  // Strip leading dot from cookieDomain (cookies use `.example.com`; hostnames do not).
  const productionDomain = (cookieDomain ?? '.buildwithbainbridge.com').replace(/^\./, '');
  // Match either the bare apex (`example.com`) or any proper subdomain
  // (`anything.example.com`) — but NOT a look-alike like `notexample.com`.
  const isProductionDomain =
    hostname === productionDomain || hostname.endsWith(`.${productionDomain}`);
  if (isProductionDomain) {
    throw new Error(
      `[@bainbridgebuilders/universal-auth] Non-production mode '${mode}' forbidden on production domain '${hostname}'. ` +
        `See SDK spec §10.6.`
    );
  }
}

/** Current SDK version. Stamped on every event + every outbound HTTP request. */
export const SDK_VERSION = '1.0.0';

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
    assertModeSafety(mode, window.location.hostname, config.cookieDomain);
  }

  // Wire the HTTP client (registers the refresh callback with token-manager internally)
  const { configureClient } = await import('./core/client.js');
  configureClient({
    apiBaseUrl: config.apiBaseUrl,
    appId: config.appId,
    sdkVersion: SDK_VERSION,
  });

  // Wire event reporter (batched ingestion per §3.2 + §8.1)
  const { configureEventReporter } = await import('./core/event-reporter.js');
  const erConfig: { batchInterval?: number; batchSize?: number } = {};
  if (config.events?.batchInterval !== undefined) erConfig.batchInterval = config.events.batchInterval;
  if (config.events?.batchSize !== undefined) erConfig.batchSize = config.events.batchSize;
  configureEventReporter(erConfig);

  // Wire settings sync (debounced PUT per §8.1)
  const { configureSettingsSync } = await import('./core/settings-sync.js');
  const ssConfig: { debounceMs?: number } = {};
  if (config.settings?.debounceMs !== undefined) ssConfig.debounceMs = config.settings.debounceMs;
  configureSettingsSync(ssConfig);

  // Wire offline queue size (per config.offline.maxQueueSize)
  if (config.offline?.maxQueueSize !== undefined) {
    const { setMaxQueueSize } = await import('./offline/queue.js');
    setMaxQueueSize(config.offline.maxQueueSize);
  }

  // SW + session-watcher start is the consumer app's call
  // (React AuthProvider wires them up in Block 4).
}
