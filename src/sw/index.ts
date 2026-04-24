// @bb/universal-auth | src/sw/index.ts | v1.0.0-rc.1 | 2026-04-24 | BB
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

const SW_VERSION = '1.0.0-rc.1';
const SYNC_TAG = 'bb-universal-auth-flush';

// Cache-name patterns to purge on logout (configurable via message).
const DEFAULT_PURGE_PATTERNS = [/runtime/i, /api/i, /auth-session-features/i];
let purgePatterns: RegExp[] = DEFAULT_PURGE_PATTERNS;

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

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { type?: string; patterns?: string[] };
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'set_purge_patterns': {
      if (Array.isArray(data.patterns)) {
        purgePatterns = data.patterns.map((p) => new RegExp(p, 'i'));
      }
      break;
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

async function purgeCaches(): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => purgePatterns.some((pat) => pat.test(name)))
      .map((name) => caches.delete(name))
  );
  // Notify all clients that caches were purged so they can reload if needed
  const clients = await sw.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type: 'caches_purged', purged: names });
  }
}

// Export SW_VERSION so builds can stamp it if needed
export {};
