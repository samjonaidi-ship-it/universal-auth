// @samjonaidi-ship-it/universal-auth | src/core/client.ts | v1.0.4 | 2026-05-04 | BB
// HTTP client for CT BFF. Owns:
//
//   §3   Every endpoint at `https://ct-bff.bainbridgebuilders.com/auth/v1/*`
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

import { nanoid } from 'nanoid';
import {
  AuthSdkError,
  AuthSessionExpired,
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

// ── Configuration ────────────────────────────────────────────────────────

export interface ClientConfig {
  /** CT BFF base URL, e.g. `https://ct-bff.bainbridgebuilders.com` */
  apiBaseUrl: string;
  /** App id registered in `ct_bff.apps` — e.g., `bb_express` */
  appId: string;
  /** SDK version for envelope stamping */
  sdkVersion: string;
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

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown; // JSON-serialized
  /** Explicit Idempotency-Key — used by offline queue to preserve keys across retries. */
  idempotencyKey?: string;
  /** Additional headers (merged over defaults). */
  headers?: Record<string, string>;
  /** If true, skip auto-attach of Authorization header (public endpoints). */
  anonymous?: boolean;
  /** If set, aborts the request. */
  signal?: AbortSignal;
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
  return requestInternal<T>(path, opts, { refreshed: false });
}

async function requestInternal<T>(
  path: string,
  opts: RequestOptions,
  ctx: { refreshed: boolean }
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
  if (opts.anonymous !== true) {
    const token = await getAccessToken();
    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }
    // v1.0.4 (L2.16): mirror the body-level `device_id` (event-reporter) onto
    // an HTTP header so server-side correlators can stamp logs without parsing
    // JSON bodies. Anon endpoints are skipped — they are pre-identity by
    // definition and the header would be noise.
    headers['X-Device-Id'] = await getOrCreateDeviceId();
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
  if (opts.signal !== undefined) {
    init.signal = opts.signal;
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

  // 401 → attempt one silent refresh and retry
  if (response.status === 401 && !ctx.refreshed && opts.anonymous !== true) {
    // Don't refresh-loop on /session/refresh itself
    if (!path.includes('/session/refresh')) {
      try {
        await tryRefresh();
      } catch {
        throw new AuthSessionExpired();
      }
      return requestInternal<T>(path, opts, { refreshed: true });
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
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
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
