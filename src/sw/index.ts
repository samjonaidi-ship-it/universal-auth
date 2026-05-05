// @samjonaidi-ship-it/universal-auth | src/sw/index.ts | v1.0.4 | 2026-05-04 | BB
// Service worker for offline queue flush + logout cache purge.
//
// Per spec:
//   §9.4     Background-sync tag `bb-universal-auth-flush` drains offline queue
//   §13      On `logout` event, purge caches matching configurable patterns
//            (default: /runtime/, /api/, /auth-session-features/) — mirrors
//            CalExp5 behavior today.
//
// This file is BUILT as a standalone SW bundle (see scripts/build.ts). Consumer
// apps serve the built output at a fixed URL (default `/bb-universal-auth-sw.js`)
// and register it via the sw-bridge helper.

/// <reference lib="webworker" />

import {
  DEFAULT_PURGE_PATTERNS,
  selectCachesToPurge,
  isTrustedClient,
} from './purge-helpers.js';

const SW_VERSION = '1.0.4';
const SYNC_TAG = 'bb-universal-auth-flush';

// Cache-name patterns to purge on logout. Bake-time const since v1.0.1 lookback
// (D5): the runtime `set_purge_patterns` message handler is rejected by the
// origin-validation check, so making this mutable adds attack surface without
// any consumer benefit. If a consumer needs different patterns, they ship a
// different SW build.
const purgePatterns: readonly RegExp[] = DEFAULT_PURGE_PATTERNS;

// Typed self ref
const sw = self as unknown as ServiceWorkerGlobalScope;

// ── Lifecycle ─────────────────────────────────────────────────────────────

sw.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(sw.skipWaiting());
});

sw.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(sw.clients.claim());
});

// ── Background Sync — flush offline queue ─────────────────────────────────

interface SyncEvent extends ExtendableEvent {
  tag: string;
}

sw.addEventListener('sync', (event: Event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag !== SYNC_TAG) return;

  syncEvent.waitUntil(
    (async () => {
      // Notify main thread to run flush. SW can't import the reconciler
      // directly — the full SDK state (config, tokens) lives on the page.
      // The main thread runs flush() and pings back completion.
      const clients = await sw.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.postMessage({ type: 'run_flush', sync_tag: SYNC_TAG });
      }
    })()
  );
});

// ── Message handling ──────────────────────────────────────────────────────

// Same-scope client predicate moved to ./purge-helpers (v1.0.4 Lane 2)
// so it can be unit-tested without an SW global scope. Scope is passed in
// from `sw.registration.scope` at the call site.

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string; patterns?: string[] };
  if (!data || typeof data !== 'object') return;

  // Origin/source check (Phase C5 hardening): reject any message that didn't
  // come from a same-scope Client. Without this a malicious page that
  // somehow obtains a postMessage handle to our SW could trigger cache
  // purges or alter purge patterns.
  if (!isTrustedClient(event.source as { url?: unknown } | null, sw.registration.scope)) return;

  switch (data.type) {
    case 'purge_caches': {
      event.waitUntil(purgeCaches());
      break;
    }
    case 'ping': {
      event.source?.postMessage({ type: 'pong', version: SW_VERSION });
      break;
    }
    // v1.0.1 lookback (D5): the `set_purge_patterns` runtime message type
    // and `parsePurgePatterns` import were removed in v1.0.1. Patterns are
    // bake-time only via `DEFAULT_PURGE_PATTERNS`. If a consumer needs
    // different patterns, ship a different SW build.
  }
});

async function purgeCaches(): Promise<void> {
  const names = await caches.keys();
  const toPurge = selectCachesToPurge(names, purgePatterns);
  await Promise.all(toPurge.map((name) => caches.delete(name)));
  // Notify all clients that caches were purged so they can reload if needed
  const clients = await sw.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'caches_purged', purged: toPurge });
  }
}

// Export SW_VERSION so builds can stamp it if needed
export {};
