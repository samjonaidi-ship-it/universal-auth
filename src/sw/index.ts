// @bainbridgebuilders/universal-auth | src/sw/index.ts | v1.0.1 | 2026-05-01 | BB
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
  parsePurgePatterns,
  selectCachesToPurge,
} from './purge-helpers.js';

const SW_VERSION = '1.0.0-rc.1';
const SYNC_TAG = 'bb-universal-auth-flush';

// Cache-name patterns to purge on logout (configurable via message).
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

/**
 * Same-scope client check. Only messages whose `event.source` is a `Client`
 * (window/worker) AND whose URL falls under our SW's registration scope are
 * trusted. This blocks cross-origin frames or other tabs from issuing purge
 * commands at us.
 */
function isTrustedClient(source: ExtendableMessageEvent['source']): boolean {
  if (source === null) return false;
  // MessagePort and ServiceWorker types don't carry a URL — we only trust
  // window/worker clients, which expose `.url` on the Client interface.
  const maybeClient = source as unknown as { url?: unknown };
  if (typeof maybeClient.url !== 'string') return false;
  return maybeClient.url.startsWith(sw.registration.scope);
}

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string; patterns?: string[] };
  if (!data || typeof data !== 'object') return;

  // Origin/source check (Phase C5 hardening): reject any message that didn't
  // come from a same-scope Client. Without this a malicious page that
  // somehow obtains a postMessage handle to our SW could trigger cache
  // purges or alter purge patterns.
  if (!isTrustedClient(event.source)) return;

  switch (data.type) {
    case 'set_purge_patterns': {
      // `set_purge_patterns` is privileged config — never accept it from a
      // page client. Pattern updates go through the build/SW-install path.
      // Drop silently to avoid leaking that we recognize the type.
      return;
    }
    case 'purge_caches': {
      event.waitUntil(purgeCaches());
      break;
    }
    case 'ping': {
      event.source?.postMessage({ type: 'pong', version: SW_VERSION });
      break;
    }
  }
});

// `parsePurgePatterns` is retained for build-time pattern hydration (when
// patterns ship baked into the SW bundle). It's intentionally unused at
// runtime now that `set_purge_patterns` is rejected at the boundary.
void parsePurgePatterns;

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
