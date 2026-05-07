// @samjonaidi-ship-it/universal-auth | src/config.ts | v1.1.3 | 2026-05-08 | BB
// SDK initialization config + mode-safety assertion (§10.6).
// Day 3-4: wires core modules (client, token-manager) via configureClient().
// v1.0.1: assertModeSafety now consumes config.cookieDomain (no hardcoded domain).
// v1.0.2 (L3.1, DPOP_DESIGN_v1.0.md §5.3 + §7): + useDpop flag. Default 'auto':
//   the SDK lazily generates a DPoP keypair on first protected-endpoint call,
//   attaches Authorization: DPoP + DPoP: <jws>, soft-falls-back to plain Bearer
//   if the DPoP path errors (per §10 Q3). 'always' hard-fails on any DPoP
//   error; 'never' is the legacy-crew opt-out.
// v1.1.0 (L3.2, SSE_DESIGN_v1.0.md §5): + useSSE flag. Default 'auto':
//   `startSessionWatcher()` opens an EventSource if available, else falls
//   back to the 60s polling watcher. 'always' = require SSE (no polling
//   fallback), 'never' = polling only.

/**
 * Operating modes per §10.
 * - `production`: full enforcement, real SMS/email, no banners
 * - `development`: accelerated TTLs, verbose logs, DEV banner
 * - `test`: header-gated, seed users, ephemeral events, TEST banner
 * - `e2e`: dedicated `ct_bff_e2e` schema, outbox captures
 * - `simulate`: RESERVED v1.4.0 §10.5 — currently normalized to `test` at
 *    `initUniversalAuth` time so all gates that check `mode === 'test'` apply.
 *    A future revision will split simulate into its own gate set.
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
 * SSE (Server-Sent Events) session-watcher mode per SSE_DESIGN_v1.0.md §5.
 * - `auto`   (default): `startSessionWatcher()` uses SSE when `EventSource`
 *            is defined, polling otherwise. SSE module also auto-falls-back
 *            to polling after 3 reconnect failures.
 * - `always`: same as auto for transport selection (SSE when available),
 *            but explicitly opted-in. Reserved for future enforcement.
 * - `never`:  legacy poll-only path. Skips EventSource entirely.
 */
export type UseSSEMode = 'auto' | 'always' | 'never';

const USE_SSE_MODES: ReadonlySet<UseSSEMode> = new Set<UseSSEMode>([
  'auto',
  'always',
  'never',
]);

// Resolved at init time and re-read by session-watcher on each
// `startSessionWatcher()` call. Module-level state is safe here — there's
// only ever one SDK instance per page.
let resolvedUseSSE: UseSSEMode = 'auto';

/**
 * Read the SDK-resolved `useSSE` mode. Used by `session-watcher.ts` to
 * decide between SSE delegation and the legacy polling path.
 */
export function getUseSSE(): UseSSEMode {
  return resolvedUseSSE;
}

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

/**
 * DPoP enforcement mode per DPOP_DESIGN_v1.0.md §5.3 + §10 Q3.
 * - `auto`     (default v1.1.0-rc.1): attach DPoP on protected endpoints when
 *              available; on any DPoP-build error fall back to plain Bearer
 *              and emit `dpop.fallback_used`.
 * - `always`:  hard-fail if a DPoP proof can't be built. Use only after the
 *              server-side enforcement window opens.
 * - `never`:   emergency opt-out — plain Bearer everywhere, no keypair work.
 */
export type DpopMode = 'auto' | 'always' | 'never';

const DPOP_MODES: ReadonlySet<DpopMode> = new Set<DpopMode>(['auto', 'always', 'never']);

export interface UniversalAuthConfig {
  /** CT BFF base URL, e.g. `https://api.buildwithbainbridge.com` */
  apiBaseUrl: string;
  /** App id registered in `ct_bff.apps` — e.g., `bb_express`, `controltower` (§D2.3) */
  appId: string;
  /** Operating mode (§10). Default `production`. */
  mode?: SdkMode;
  /** DPoP enforcement (DPOP_DESIGN_v1.0.md §5.3). Default `auto`. */
  useDpop?: DpopMode;
  /** SSE session-watcher mode (SSE_DESIGN_v1.0.md §5). Default `auto`. */
  useSSE?: UseSSEMode;

  // Cross-subdomain cookie per D10 + SDK §5.0 v1.4.0 locked
  /** Cookie domain for shared session across subdomains. Default `.buildwithbainbridge.com` (post-D20 cutover 2026-05-03). */
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
      `[@samjonaidi-ship-it/universal-auth] Non-production mode '${mode}' forbidden on production domain '${hostname}'. ` +
        `See SDK spec §10.6.`
    );
  }
}

/**
 * P1-I — production-mode `apiBaseUrl` validation.
 *
 * In production mode the SDK ships cookies cross-origin via SSE
 * (`session-events.ts:114`, `withCredentials: true`) and via `fetch` with
 * `credentials: 'include'`. A consumer who passes an attacker-controlled
 * `apiBaseUrl` (or a misconfigured production deploy) would leak the
 * session cookie to the attacker's host. We refuse to start in production
 * mode unless:
 *
 *   1. `apiBaseUrl` parses as a valid `https://...` URL.
 *   2. The hostname shares a registrable domain with `cookieDomain`.
 *
 * The registrable-domain check is "naive endsWith" rather than full
 * public-suffix-list lookup. This is sufficient for BB's two owned eTLD+1s
 * (`bainbridgebuilders.com`, `buildwithbainbridge.com`). Consumers using a
 * different eTLD+1 should override `cookieDomain` to match.
 *
 * Skipped in non-production modes — local development against `http://localhost`
 * remains unimpaired.
 *
 * Exported for unit testing; called from `initUniversalAuth`.
 */
export function assertApiBaseUrlSafety(
  mode: SdkMode,
  apiBaseUrl: string,
  cookieDomain?: string,
): void {
  if (mode !== 'production') return;

  // 1. Must be a valid URL with https scheme.
  let parsed: URL;
  try {
    parsed = new URL(apiBaseUrl);
  } catch {
    throw new Error(
      `[@samjonaidi-ship-it/universal-auth] apiBaseUrl '${apiBaseUrl}' is not a valid URL.`,
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `[@samjonaidi-ship-it/universal-auth] apiBaseUrl must use HTTPS in production (got '${parsed.protocol}//${parsed.host}'). ` +
        `Cookies and DPoP proofs require an authenticated transport.`,
    );
  }

  // 2. Hostname must share registrable domain with cookieDomain.
  const apiHost = parsed.hostname;
  const cookieHost = (cookieDomain ?? '.buildwithbainbridge.com').replace(/^\./, '');
  // A and B share registrable domain iff one is the other or a subdomain of it.
  // (Naive — see docstring.)
  const sameRegistrable =
    apiHost === cookieHost ||
    apiHost.endsWith(`.${cookieHost}`) ||
    cookieHost.endsWith(`.${apiHost}`);
  if (!sameRegistrable) {
    throw new Error(
      `[@samjonaidi-ship-it/universal-auth] apiBaseUrl host '${apiHost}' does not share a registrable domain with cookieDomain '${cookieHost}'. ` +
        `In production, the SDK ships cookies + DPoP cross-origin to apiBaseUrl, so the two MUST share an eTLD+1. ` +
        `Either set cookieDomain to match apiBaseUrl, or fix apiBaseUrl to live under '${cookieHost}'.`,
    );
  }
}

/** Current SDK version. Stamped on every event + every outbound HTTP request.
 *  MUST be kept in sync with `package.json:version`.
 *
 *  Audit-fix 2026-05-04: was '1.0.2' on the v1.0.4 build, causing telemetry
 *  to misattribute traffic.
 *
 *  Audit-fix 2026-05-08 (rc.5): was '1.1.0-rc.3' on rc.4 release — same class
 *  of regression. `pnpm verify:version-sync` (scripts/verify-version-sync.ts)
 *  now CI-gates this constant against package.json:version on every build.
 */
export const SDK_VERSION = '1.1.0-rc.6';

/**
 * Initialize the SDK. Called once at app startup.
 *
 * Day 3-4 (Block 2): wires core/client.ts with the CT BFF base URL + appId.
 * Subsequent blocks layer in flows (Block 3), offline queue (Block 3), and
 * React providers (Block 4).
 */
export async function initUniversalAuth(config: UniversalAuthConfig): Promise<void> {
  // v1.0.1 lookback (D8): normalize `simulate` → `test` per §10.5 docstring.
  // Until simulate gets its own gate set, every consumer-facing gate that
  // checks `mode === 'test'` should also apply to simulate. Doing the
  // normalization at init time means downstream code only ever sees the
  // four "real" modes.
  const requested: SdkMode = config.mode ?? 'production';
  const mode: SdkMode = requested === 'simulate' ? 'test' : requested;

  // v1.0.2 (L3.1): validate `useDpop` early — fail loud on a typo'd value
  // rather than silently falling through to default. Mirrors the spec §5.3
  // contract: only the three documented strings are accepted.
  const useDpop: DpopMode = config.useDpop ?? 'auto';
  if (!DPOP_MODES.has(useDpop)) {
    throw new Error(
      `[@samjonaidi-ship-it/universal-auth] Invalid useDpop value '${String(
        config.useDpop
      )}'. Must be one of: 'auto' | 'always' | 'never'.`
    );
  }

  // v1.1.0 (L3.2): validate useSSE early — fail loud on a typo'd value
  // rather than silently defaulting. Mirrors the spec §5 contract: only
  // the three documented strings are accepted.
  const useSSE: UseSSEMode = config.useSSE ?? 'auto';
  if (!USE_SSE_MODES.has(useSSE)) {
    throw new Error(
      `[@samjonaidi-ship-it/universal-auth] Invalid useSSE value '${String(
        config.useSSE
      )}'. Must be one of: 'auto' | 'always' | 'never'.`
    );
  }
  resolvedUseSSE = useSSE;

  // Browser-context safety check (skipped in Node test harness)
  if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
    assertModeSafety(mode, window.location.hostname, config.cookieDomain);
  }

  // P1-I — apiBaseUrl validation: production mode must use HTTPS + registrable
  // domain matching cookieDomain. Runs in all environments (including Node
  // test harness) because misconfiguration is just as dangerous in CI.
  assertApiBaseUrlSafety(mode, config.apiBaseUrl, config.cookieDomain);

  // P1-E — register consumer-supplied onError hook. Modules under src/core
  // route soft errors (DPoP build failure, navigator.locks unavailable,
  // legacy refresh-response shape, etc.) through `reportSoftError(err)`,
  // which delegates to this hook when set or falls through to console.warn.
  const { registerOnError } = await import('./core/error-hook.js');
  registerOnError(config.onError ?? null);

  // Wire the HTTP client (registers the refresh callback with token-manager internally)
  const { configureClient } = await import('./core/client.js');
  configureClient({
    apiBaseUrl: config.apiBaseUrl,
    appId: config.appId,
    sdkVersion: SDK_VERSION,
    useDpop,
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
