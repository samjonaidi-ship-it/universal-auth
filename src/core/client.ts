// @bb/universal-auth | src/core/client.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// HTTP client for CT BFF. Owns:
//
//   §3     L142   Every endpoint at `https://ct-bff.bainbridgebuilders.com/auth/v1/*`
//   §3.6   L234   Standard error envelope → typed errors via errorFromEnvelope
//   §3.7   L247   Canonical error codes (17 total; see errors.ts)
//   §14.2  L1330  `X-Auth-Protocol-Version: v1` on every request
//   §Global L144  `Idempotency-Key` on every mutation (POST/PUT/PATCH/DELETE)
//   §8.1   L815   HTTP/2 + native fetch (browser-optimized keep-alive)
//   §8.1   L821   ETag 304 handling on GET /auth/v1/me
//
// Design:
//   * Zero HTTP knowledge leaks to token-manager (circular dep broken via
//     registerRefreshCallback pattern)
//   * On 401 during non-refresh call: attempt one silent refresh, retry once,
//     then surface AuthSessionExpired/Revoked
//   * On non-2xx: parse envelope → throw typed error
//   * On network error: throw native Error (offline queue layer catches)

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
  hasLiveAccessToken,
} from './token-manager.js';

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
      '[@bb/universal-auth] HTTP client called before configureClient(). Did you skip initUniversalAuth()?'
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

  if (opts.body !== undefined) {
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
  }

  const init: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  if (opts.signal !== undefined) {
    init.signal = opts.signal;
  }

  // Native fetch throws on network failure — offline queue layer (Block 3 Day 7-8)
  // catches to persist the mutation for later flush. Non-mutations propagate normally.
  const response = await fetch(url, init);

  // ETag 304 path — §8.1 L821
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
  // Forces token-manager to refresh via the callback we registered
  // If refresh fails, it throws — we let it propagate
  if (!hasLiveAccessToken()) {
    await getAccessToken();
  }
}

async function refreshTokenRequest(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_at: string;
  session_id: string;
}> {
  const cfg = requireConfig();
  const url = joinUrl(cfg.apiBaseUrl, '/auth/v1/session/refresh');
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Protocol-Version': PROTOCOL_VERSION,
      'X-App-Id': cfg.appId,
      'X-SDK-Version': cfg.sdkVersion,
      'Idempotency-Key': nanoid(),
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
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
    session_id: string;
  };
}

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

// ── Test-only helper ─────────────────────────────────────────────────────

export function __resetClientForTests(): void {
  clientConfig = null;
}
