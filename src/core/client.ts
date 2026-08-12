// @samjonaidi-ship-it/universal-auth | src/core/client.ts | v1.4.0 | 2026-08-10 | BB
// v1.4.0 (P4.1): /auth/v1/pin/verify joins DPOP_PROTECTED_ENDPOINTS — PIN is
//   the crew's primary sign-in and was the only mint path sending no proof.
// v1.3.0 (P4.6): DPoP proofs now go out on the calls that ESTABLISH the
//   binding (anonymous session-minting) and on refreshTokenRequest(), which
//   built its own fetch and bypassed the gate. Four of the six endpoints
//   declared DPoP-protected had never sent a proof, so cnf_jkt was NULL for
//   every session.
// v1.2.0 (P2.5): every request carries a 15 s default timeout, combined with
//   (never replacing) a caller-supplied signal. Wired explicitly into
//   refreshTokenRequest(), which builds its own fetch.
// HTTP client for CT BFF. Owns:
//
//   §3   Every endpoint at `https://api.buildwithbainbridge.com/auth/v1/*`
//   §3.6   Standard error envelope → typed errors via errorFromEnvelope
//   §3.7   Canonical error codes (17 total; see errors.ts)
//   §14.2  `X-Auth-Protocol-Version: v1` on every request
//   §Global  `Idempotency-Key` on every mutation (POST/PUT/PATCH/DELETE)
//   §8.1   HTTP/2 + native fetch (browser-optimized keep-alive)
//   §8.1   ETag 304 handling on GET /auth/v1/me
//
// Design:
//   * Zero HTTP knowledge leaks to token-manager (circular dep broken via
//     registerRefreshCallback pattern)
//   * On 401 during non-refresh call: attempt one silent refresh, retry once,
//     then surface AuthSessionExpired/Revoked
//   * On non-2xx: parse envelope → throw typed error
//   * On network error: throw native Error (offline queue layer catches)
//
// v1.0.1 hardening:
//   B3 — `/session/refresh` Idempotency-Key is derived from
//        SHA-256(refresh_token).slice(0,16) so two tabs that race past the
//        in-tab mutex still send the SAME key, letting the server dedupe.
//   B4 — Every fetch() uses `redirect: 'manual'` + `referrerPolicy:
//        'strict-origin-when-cross-origin'`. The CT BFF never legitimately
//        redirects an SDK call, so any 0/3xx is treated as an error.
//
// v1.0.4 (L2.16):
//   * `X-Device-Id` header attached to every authenticated request, mirroring
//     the existing `device_id` field on event envelopes (§B3.13 carry-forward).
//     Server-side correlators can stamp logs without parsing JSON bodies.
//     Anonymous requests (config probes, code/request, etc.) do NOT carry the
//     header — they are pre-identity by definition. Header value is sourced
//     from getOrCreateDeviceId() which is memoized; the per-request await is
//     a no-op after the first resolution.
//
// v1.0.5 (L3.1, DPOP_DESIGN_v1.0.md §5.3 + §7):
//   * DPoP-aware fetch — for the 6 server-protected endpoints, swap
//     `Authorization: Bearer <token>` → `Authorization: DPoP <token>` and
//     attach `DPoP: <jws>` (RFC 9449 §7.1).
//   * Soft-fallback (`useDpop: 'auto'`): any DPoP-build error → emit
//     `dpop.fallback_used` + proceed with plain Bearer (per §10 Q3).
//     `useDpop: 'always'` re-throws. `useDpop: 'never'` skips DPoP entirely.
//   * Nonce-challenge retry: on 401 + `DPoP-Nonce` header + body code
//     `USE_DPOP_NONCE`, record the nonce + retry once with it in the proof.
//     The retry happens BEFORE the existing AUTH_SESSION_EXPIRED refresh path.

import { nanoid } from 'nanoid';
import {
  AuthSdkError,
  AuthSessionExpired,
  DpopFallbackError,
  errorFromEnvelope,
  type AuthErrorEnvelope,
} from '../errors.js';
import {
  getAccessToken,
  registerRefreshCallback,
  setSession,
  invalidateAccessToken,
} from './token-manager.js';
import { getOrCreateDeviceId } from './device-id.js';
import { getOrCreateKeypair } from './dpop/keypair.js';
import { buildDpopProof } from './dpop/proof.js';
import { recordNonce, consumeNonce } from './dpop/nonce-cache.js';
import { emit } from './event-reporter.js';
import { reportSoftError } from './error-hook.js';
import type { DpopMode } from '../config.js';

// ── Configuration ────────────────────────────────────────────────────────

export interface ClientConfig {
  /** CT BFF base URL, e.g. `https://api.buildwithbainbridge.com` */
  apiBaseUrl: string;
  /** App id registered in `ct_bff.apps` — e.g., `bb_express` */
  appId: string;
  /** SDK version for envelope stamping */
  sdkVersion: string;
  /**
   * DPoP enforcement (DPOP_DESIGN_v1.0.md §5.3). Default `'auto'` — generate
   * keypair lazily, attach DPoP on protected endpoints, fall back to plain
   * Bearer on any DPoP error. `'always'` hard-fails on DPoP errors.
   * `'never'` opts out entirely (legacy crew sessions).
   */
  useDpop?: DpopMode;
}

/**
 * Server endpoints that REQUIRE DPoP-bound credentials per the spec §3 +
 * DPOP_DESIGN_v1.0.md §5.3. Path-suffix match (`endsWith`) so the SDK doesn't
 * trip on alternate base URLs (api.example.com vs api.staging.example.com).
 */
const DPOP_PROTECTED_ENDPOINTS: ReadonlySet<string> = new Set([
  '/auth/v1/code/verify',
  '/auth/v1/passkey/authenticate/verify',
  '/auth/v1/enroll/activate',
  // P4.1: PIN is the crew's PRIMARY sign-in and was the only mint path with
  // no proof, so almost every real session was unbound. The BFF side landed
  // separately (auth-v1-pin.js now runs verifyDpopOrFallback → cnfJkt); this
  // is the half that makes a proof arrive for it to read.
  '/auth/v1/pin/verify',
  '/auth/v1/session/refresh',
  '/auth/v1/session/revoke',
  '/auth/v1/session/revoke-all',
]);

/**
 * Returns true if the (path, method) tuple targets one of the 6 DPoP-protected
 * endpoints. All six are POSTs in v1; we still gate on method so future GET
 * endpoints can be added without back-compat surprises.
 */
export function isDpopRequiredFor(path: string, method: string): boolean {
  if (method.toUpperCase() !== 'POST') return false;
  // Strip query string for the suffix match — prod paths don't use query
  // params on these endpoints, but a stray `?foo=bar` shouldn't defeat the
  // match.
  const queryIdx = path.indexOf('?');
  const cleanPath = queryIdx === -1 ? path : path.slice(0, queryIdx);
  for (const protectedPath of DPOP_PROTECTED_ENDPOINTS) {
    if (cleanPath.endsWith(protectedPath)) return true;
  }
  return false;
}

const PROTOCOL_VERSION = 'v1';

let clientConfig: ClientConfig | null = null;

export function configureClient(cfg: ClientConfig): void {
  clientConfig = cfg;
  // Wire the refresh callback once client knows how to POST /session/refresh
  registerRefreshCallback(async (refreshToken: string) => {
    return refreshTokenRequest(refreshToken);
  });
}

function requireConfig(): ClientConfig {
  if (clientConfig === null) {
    throw new Error(
      '[@samjonaidi-ship-it/universal-auth] HTTP client called before configureClient(). Did you skip initUniversalAuth()?'
    );
  }
  return clientConfig;
}

// ── Request primitives ────────────────────────────────────────────────────

/**
 * P2.5 — default request timeout.
 *
 * 15 s. Long enough that a slow-but-alive jobsite connection still completes
 * (the crew are regularly on 1-2 bars), short enough that a black-holed
 * connection surfaces as a retryable error instead of an indefinite hang.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Combine a caller-supplied AbortSignal with a timeout signal.
 *
 * `AbortSignal.any` is Safari 17.4+ / Chrome 116+. The crew run installed iOS
 * PWAs, so an older WebView is possible; rather than let the whole request
 * throw a TypeError on `AbortSignal.any is not a function`, fall back to
 * whichever single signal we have (caller's first — an explicit cancel matters
 * more than a timeout). Degrading to today's no-timeout behaviour on an old
 * device is acceptable; breaking every request on it is not.
 */
function withDefaultTimeout(callerSignal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  const canTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  if (!canTimeout) return callerSignal;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (callerSignal === undefined) return timeoutSignal;

  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([callerSignal, timeoutSignal]);
  }
  return callerSignal;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown; // JSON-serialized
  /** Explicit Idempotency-Key — used by offline queue to preserve keys across retries. */
  idempotencyKey?: string;
  /** Additional headers (merged over defaults). */
  headers?: Record<string, string>;
  /** If true, skip auto-attach of Authorization header (public endpoints). */
  anonymous?: boolean;
  /** If set, aborts the request. Combined with the default timeout, not instead of it. */
  signal?: AbortSignal;
  /** Override the default request timeout (ms). Rarely needed. */
  timeoutMs?: number;
  /** For `GET /auth/v1/me` ETag handling. */
  ifNoneMatch?: string;
}

export interface RequestResult<T> {
  status: number;
  data: T;
  /** Response ETag for caching (304 handling on /me). */
  etag?: string;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Core request — throws typed AuthSdkError on non-2xx, native Error on network.
 * Attempts one silent refresh on 401 before surfacing the session-expired error.
 */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<RequestResult<T>> {
  return requestInternal<T>(path, opts, { refreshed: false, dpopRetried: false });
}

interface RequestContext {
  /** Whether we've already retried after a silent refresh (caps at 1). */
  refreshed: boolean;
  /** Whether we've already retried after a DPoP-Nonce challenge (caps at 1). */
  dpopRetried: boolean;
}

async function requestInternal<T>(
  path: string,
  opts: RequestOptions,
  ctx: RequestContext
): Promise<RequestResult<T>> {
  const cfg = requireConfig();
  const method = opts.method ?? 'GET';
  const url = joinUrl(cfg.apiBaseUrl, path);

  const headers: Record<string, string> = {
    'X-Auth-Protocol-Version': PROTOCOL_VERSION,
    'X-App-Id': cfg.appId,
    'X-SDK-Version': cfg.sdkVersion,
    Accept: 'application/json',
    ...opts.headers,
  };

  // FormData / Blob / Uint8Array bodies pass through; everything else gets
  // JSON-encoded. The browser sets multipart boundary on FormData when we
  // omit Content-Type — letting it set its own.
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const isBlob = typeof Blob !== 'undefined' && opts.body instanceof Blob;
  const isBytes = opts.body instanceof Uint8Array;
  const isBinaryBody = isFormData || isBlob || isBytes;

  if (opts.body !== undefined && !isBinaryBody) {
    headers['Content-Type'] = 'application/json';
  }

  if (MUTATION_METHODS.has(method)) {
    headers['Idempotency-Key'] = opts.idempotencyKey ?? nanoid();
  }

  if (opts.ifNoneMatch !== undefined) {
    headers['If-None-Match'] = opts.ifNoneMatch;
  }

  // Attach Authorization if available and not opted out
  //
  // P4.6: `token` is hoisted out of this block because the DPoP attachment
  // below now runs for anonymous requests too. See the long note there.
  let token: string | null = null;
  if (opts.anonymous !== true) {
    token = await getAccessToken();
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }
    // v1.0.4 (L2.16): mirror the body-level `device_id` (event-reporter) onto
    // an HTTP header so server-side correlators can stamp logs without parsing
    // JSON bodies. Anon endpoints are skipped — they are pre-identity by
    // definition and the header would be noise.
    headers['X-Device-Id'] = await getOrCreateDeviceId();
  }

  // v1.0.5 (L3.1, DPOP_DESIGN_v1.0.md §5.3): attach DPoP for the 6 protected
  // endpoints unless the consumer has opted out. Soft-fallback per §10 Q3:
  // any error in 'auto' mode logs + emits + proceeds with plain Bearer; in
  // 'always' mode we re-throw so the caller learns about it.
  //
  // P4.6 — this used to sit inside `if (opts.anonymous !== true)` AND require
  // `token !== null`. Between them, those two conditions excluded exactly the
  // endpoints that establish the binding in the first place:
  //
  //   /auth/v1/code/verify                  anonymous:true, no token yet
  //   /auth/v1/passkey/authenticate/verify  anonymous:true, no token yet
  //   /auth/v1/enroll/activate              anonymous:true, no token yet
  //
  // All three are declared DPoP-protected above and none of them could ever
  // satisfy the gate, so no proof was ever sent at sign-in. The CT BFF reads
  // the DPoP header at every mint site and stores its thumbprint as
  // `cnf_jkt` (verifyDpopOrFallback → issueSessionV1), but with no header it
  // records NULL — every session in production is unbound. The whole binding
  // chain exists on both sides and has never once run.
  //
  // RFC 9449 §4.2 makes `ath` conditional on an access token being present,
  // and the BFF's verifier never reads `ath` at all (services/dpop.js
  // destructures only jti/htm/htu/iat/nonce). So an ath-less proof at mint is
  // both spec-correct and accepted today. buildDpopProof already omits `ath`
  // when accessToken is absent — the capability was there, just unreachable.
  const dpopMode: DpopMode = cfg.useDpop ?? 'auto';
  if (dpopMode !== 'never' && isDpopRequiredFor(path, method)) {
    try {
      await getOrCreateKeypair(); // lazy — first call generates + persists
      const cachedNonce = consumeNonce(path);
      const proofInput: Parameters<typeof buildDpopProof>[0] = { url, method };
      // ath binds the proof to the access token. On a minting call there is
      // no token to bind to, and that is the normal case, not a degraded one.
      if (token !== null) proofInput.accessToken = token;
      if (cachedNonce !== null) proofInput.nonce = cachedNonce;
      const proof = await buildDpopProof(proofInput);
      // RFC 9449 §7.1: with DPoP-bound credentials, the Authorization scheme
      // is the literal string `DPoP` (case-sensitive in the header value).
      // Only meaningful when we actually have a token — on a minting call
      // there is no Authorization header to upgrade.
      if (token !== null) headers.Authorization = `DPoP ${token}`;
      headers.DPoP = proof;
    } catch (err) {
      if (dpopMode === 'always') {
        // Hard-fail surface — caller asked for strict DPoP.
        throw err;
      }
      // Soft-fallback: keep the existing `Authorization: Bearer <token>`
      // header and let the request proceed. The server still sees a valid
      // session token; only the proof-of-possession binding is absent.
      void emit('dpop.fallback_used', {
        endpoint: path,
        method,
        reason: err instanceof Error ? err.message : String(err),
      });
      // P1-E — route through onError hook; fall back to console.warn.
      // rc.7 D7-fu(b): typed AuthSdkError subclass so consumers can
      // `instanceof DpopFallbackError`-check.
      const fallbackErr = new DpopFallbackError(
        `DPoP build failed for ${method} ${path}; falling back to plain Bearer. Cause: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? { cause: err } : undefined,
      );
      reportSoftError(fallbackErr);
    }
  }

  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
    // v1.0.1 (B4): the CT BFF never legitimately redirects an SDK call.
    // `redirect: 'manual'` returns an opaque-redirect (status 0) on any 3xx,
    // which we surface as an error below. Avoids open-redirect chains.
    redirect: 'manual',
    // Limit Referer leakage on cross-origin auth requests.
    referrerPolicy: 'strict-origin-when-cross-origin',
  };
  if (opts.body !== undefined) {
    init.body = isBinaryBody
      ? (opts.body as BodyInit)
      : JSON.stringify(opts.body);
  }
  // P2.5: every request gets a default timeout. Without one a fetch can hang
  // for as long as the platform allows — on a flaky mobile connection that is
  // effectively forever, and a hung auth call stalls whatever is waiting on it
  // (the resume coordinator, a queue drain, a boot). A caller-supplied signal
  // still wins in the sense that it can abort EARLIER; the two are combined,
  // never swapped, so passing `signal` no longer silently opts out of the
  // timeout.
  //
  // The resulting AbortError is classified as TRANSIENT by the token manager
  // (token-manager.ts isTerminalRefreshError), so a timed-out refresh keeps the
  // credential and retries rather than signing the user out.
  // Guarded assignment: `exactOptionalPropertyTypes` forbids an explicit
  // `undefined` here, and withDefaultTimeout() returns undefined on a platform
  // with neither AbortSignal.timeout nor a caller signal.
  const requestSignal = withDefaultTimeout(opts.signal, opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  if (requestSignal !== undefined) {
    init.signal = requestSignal;
  }

  // Native fetch throws on network failure — offline queue layer (Block 3 Day 7-8)
  // catches to persist the mutation for later flush. Non-mutations propagate normally.
  const response = await fetch(url, init);

  // v1.0.1 (B4): redirect:'manual' returns an opaque-redirect with status 0
  // and `response.type === 'opaqueredirect'`. Either is treated as a failure
  // — the BFF never returns 3xx for SDK endpoints under normal operation.
  // EXCEPT 304 Not Modified, which is a cache validator response (no Location
  // header, not a true redirect) and is the spec-prescribed ETag path (§8.1).
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400 && response.status !== 304)) {
    throw new AuthSdkError(
      'UNEXPECTED_REDIRECT',
      `Request was redirected (status ${response.status}); expected direct response from CT BFF.`
    );
  }

  // ETag 304 path — §8.1
  if (response.status === 304) {
    return {
      status: 304,
      data: null as unknown as T, // consumer uses cached data from previous 200
      ...(opts.ifNoneMatch !== undefined ? { etag: opts.ifNoneMatch } : {}),
    };
  }

  // v1.0.5 (L3.1): DPoP-Nonce challenge retry (RFC 9449 §8). Server returns
  // 401 with `DPoP-Nonce` header + envelope `{ error: { code: 'USE_DPOP_NONCE' } }`.
  // Cache the nonce and re-issue the request once with it baked into the proof.
  // Capped at one retry per request to avoid infinite loops on a server that
  // keeps returning USE_DPOP_NONCE.
  const dpopNonceHeader = response.headers.get('dpop-nonce');
  if (
    response.status === 401 &&
    dpopNonceHeader !== null &&
    !ctx.dpopRetried &&
    opts.anonymous !== true &&
    (cfg.useDpop ?? 'auto') !== 'never' &&
    isDpopRequiredFor(path, method)
  ) {
    // Need to peek at the body to confirm it's a USE_DPOP_NONCE challenge —
    // a stray DPoP-Nonce header on a session-expired 401 must NOT trigger
    // a DPoP retry path.
    const peekText = await response.text();
    if (isUseDpopNonceEnvelope(peekText)) {
      recordNonce(path, dpopNonceHeader);
      return requestInternal<T>(path, opts, {
        refreshed: ctx.refreshed,
        dpopRetried: true,
      });
    }
    // Not a USE_DPOP_NONCE envelope — surface the error using the buffered
    // body. Reuses the same error-envelope path as the bottom of this fn.
    return finalizeFailedResponse<T>(response, peekText);
  }

  // 401 → attempt one silent refresh and retry
  if (response.status === 401 && !ctx.refreshed && opts.anonymous !== true) {
    // Don't refresh-loop on /session/refresh itself
    if (!path.includes('/session/refresh')) {
      try {
        await tryRefresh();
      } catch {
        throw new AuthSessionExpired();
      }
      return requestInternal<T>(path, opts, {
        refreshed: true,
        dpopRetried: ctx.dpopRetried,
      });
    }
  }

  const etag = response.headers.get('etag');
  const contentType = response.headers.get('content-type') ?? '';
  const bodyText = await response.text();

  if (response.ok) {
    const data = contentType.includes('application/json') && bodyText.length > 0
      ? (JSON.parse(bodyText) as T)
      : (bodyText as unknown as T);
    const result: RequestResult<T> = { status: response.status, data };
    if (etag !== null) result.etag = etag;
    return result;
  }

  // Non-ok response — parse envelope and throw typed error
  let envelope: AuthErrorEnvelope;
  try {
    envelope = JSON.parse(bodyText) as AuthErrorEnvelope;
  } catch {
    throw new AuthSdkError(
      `HTTP_${response.status}`,
      `Request failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  throw errorFromEnvelope(envelope);
}

// ── Internal refresh helper ──────────────────────────────────────────────

async function tryRefresh(): Promise<void> {
  // Invalidate the cached access token so getAccessToken() is forced into
  // performRefresh() even when the local token hasn't hit its REFRESH_MARGIN.
  // This covers server-side revocation / clock skew where the server returns
  // 401 on a token we still consider locally valid.
  invalidateAccessToken();
  await getAccessToken();
}

async function refreshTokenRequest(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_at: string;
  refresh_expires_at?: string;
  session_id: string;
}> {
  const cfg = requireConfig();
  const url = joinUrl(cfg.apiBaseUrl, '/auth/v1/session/refresh');
  // v1.0.1 (B3): derive the idempotency key from the refresh token so two tabs
  // racing past the in-tab mutex send the SAME key — the server dedupes.
  // 16 hex chars (64 bits) is plenty for this dedupe window without leaking
  // the token (preimage-resistant under SHA-256).
  const idempotencyKey = await deriveRefreshIdempotencyKey(refreshToken);
  const refreshSignal = withDefaultTimeout(undefined, DEFAULT_REQUEST_TIMEOUT_MS);

  // P4.6 — attach a DPoP proof to the refresh.
  //
  // THIS IS THE HALF THAT CANNOT BE SHIPPED SEPARATELY. `/auth/v1/session/refresh`
  // is in DPOP_PROTECTED_ENDPOINTS, but this function builds its own fetch and
  // never passes through requestInternal, so the gate above has never been
  // consulted for it — the endpoint is declared protected and receives no proof.
  //
  // Harmless while every session is unbound. The moment the mint-side change
  // above starts populating `cnf_jkt`, the BFF's refresh handler takes the
  // `if (boundJkt)` branch and REQUIRES a valid proof (routes/auth-v1.js), so a
  // proof-less refresh would 401. Binding sessions without this would lock out
  // every user at their next refresh — within 15 minutes.
  //
  // ath-less on purpose: a refresh carries no access token. The refresh token
  // is NOT an access token and must not be hashed into `ath`.
  //
  // No nonce retry, deliberately: the refresh call site passes
  // `verifyDpopProof(req, { sql, boundJkt })` with no `requireNonce`, which
  // defaults false, so USE_DPOP_NONCE cannot be raised here. (The DPoP design
  // doc says nonces are "refresh-only" — that is drift; the code does not ask
  // for one.) If anyone ever flips requireNonce on for refresh, they MUST add
  // a nonce-retry here or every refresh will fail.
  let dpopProof: string | null = null;
  const refreshDpopMode: DpopMode = cfg.useDpop ?? 'auto';
  if (refreshDpopMode !== 'never') {
    try {
      await getOrCreateKeypair();
      dpopProof = await buildDpopProof({ url, method: 'POST' });
    } catch (err) {
      if (refreshDpopMode === 'always') throw err;
      // Soft-fallback matches the main path: proceed without the proof. If the
      // session IS bound this will 401, which is the correct outcome — better
      // a clean auth failure than a silently unbound refresh.
      void emit('dpop.fallback_used', {
        endpoint: '/auth/v1/session/refresh',
        method: 'POST',
        reason: err instanceof Error ? err.message : String(err),
      });
      reportSoftError(new DpopFallbackError(
        `DPoP build failed for POST /auth/v1/session/refresh; refreshing without a proof. Cause: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? { cause: err } : undefined,
      ));
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    // v1.0.1 (B4): same redirect + referrer hardening as primary fetch path.
    redirect: 'manual',
    referrerPolicy: 'strict-origin-when-cross-origin',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Protocol-Version': PROTOCOL_VERSION,
      'X-App-Id': cfg.appId,
      'X-SDK-Version': cfg.sdkVersion,
      'Idempotency-Key': idempotencyKey,
      ...(dpopProof !== null ? { DPoP: dpopProof } : {}),
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    // P2.5: this path builds its own fetch rather than going through
    // request(), so it needs the timeout wired explicitly — it is the single
    // most important call to bound, because a hung refresh blocks every
    // queued getAccessToken() caller behind the refresh mutex.
    // Conditional spread: `exactOptionalPropertyTypes` forbids `signal: undefined`.
    ...(refreshSignal !== undefined ? { signal: refreshSignal } : {}),
  });
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw new AuthSdkError(
      'UNEXPECTED_REDIRECT',
      `Refresh was redirected (status ${response.status}); expected direct response from CT BFF.`
    );
  }
  const bodyText = await response.text();
  if (!response.ok) {
    let env: AuthErrorEnvelope;
    try {
      env = JSON.parse(bodyText) as AuthErrorEnvelope;
    } catch {
      throw new AuthSdkError(`HTTP_${response.status}`, `Refresh failed: HTTP ${response.status}`);
    }
    throw errorFromEnvelope(env);
  }
  return JSON.parse(bodyText) as {
    access_token: string;
    refresh_token?: string;
    expires_at: string;
    refresh_expires_at?: string;
    session_id: string;
  };
}

/**
 * Derive an idempotency key for `/session/refresh` from the refresh token.
 * SHA-256 → first 16 hex chars (64 bits). Identical input → identical key,
 * which is exactly what we want for cross-tab dedupe on the server.
 *
 * Exported only for unit tests via `__deriveRefreshIdempotencyKeyForTests`.
 */
async function deriveRefreshIdempotencyKey(refreshToken: string): Promise<string> {
  const bytes = new TextEncoder().encode(refreshToken);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

export const __deriveRefreshIdempotencyKeyForTests = deriveRefreshIdempotencyKey;

// ── Convenience methods ──────────────────────────────────────────────────

export function get<T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<RequestResult<T>> {
  return request<T>(path, { ...opts, method: 'GET' });
}

export function post<T>(
  path: string,
  body?: unknown,
  opts: Omit<RequestOptions, 'method' | 'body'> = {}
): Promise<RequestResult<T>> {
  const reqOpts: RequestOptions = { ...opts, method: 'POST' };
  if (body !== undefined) reqOpts.body = body;
  return request<T>(path, reqOpts);
}

export function put<T>(
  path: string,
  body?: unknown,
  opts: Omit<RequestOptions, 'method' | 'body'> = {}
): Promise<RequestResult<T>> {
  const reqOpts: RequestOptions = { ...opts, method: 'PUT' };
  if (body !== undefined) reqOpts.body = body;
  return request<T>(path, reqOpts);
}

export function del<T>(path: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<RequestResult<T>> {
  return request<T>(path, { ...opts, method: 'DELETE' });
}

// ── Helpers ──────────────────────────────────────────────────────────────

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

/**
 * v1.0.5 (L3.1): is the response body a `USE_DPOP_NONCE` challenge envelope?
 * Server shape: `{ error: { code: 'USE_DPOP_NONCE', message: '...' } }`.
 * Anything else means the 401's `DPoP-Nonce` header is informational and
 * should not be treated as a retry trigger.
 */
function isUseDpopNonceEnvelope(bodyText: string): boolean {
  if (bodyText.length === 0) return false;
  try {
    const parsed = JSON.parse(bodyText) as { error?: { code?: unknown } };
    return parsed?.error?.code === 'USE_DPOP_NONCE';
  } catch {
    return false;
  }
}

/**
 * v1.0.5 (L3.1): consume a non-OK response when we already buffered the body
 * during the DPoP-nonce peek. Mirrors the tail of `requestInternal`'s error
 * path so the two branches stay consistent.
 */
function finalizeFailedResponse<T>(response: Response, bodyText: string): Promise<RequestResult<T>> {
  let envelope: AuthErrorEnvelope;
  try {
    envelope = JSON.parse(bodyText) as AuthErrorEnvelope;
  } catch {
    throw new AuthSdkError(
      `HTTP_${response.status}`,
      `Request failed: HTTP ${response.status} ${response.statusText}`
    );
  }
  throw errorFromEnvelope(envelope);
}

// Re-export setSession for direct use by flow modules that bypass the
// refresh callback path (e.g., code-verify, enroll-activate).
export { setSession };

/**
 * Read-only access to client config for sibling modules (event-reporter,
 * entitlements, session-watcher). Returns null if not yet configured.
 */
export function getClientConfig(): Readonly<ClientConfig> | null {
  return clientConfig;
}

// ── Test-only helper ─────────────────────────────────────────────────────

export function __resetClientForTests(): void {
  clientConfig = null;
}
