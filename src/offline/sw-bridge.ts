// @samjonaidi-ship-it/universal-auth | src/offline/sw-bridge.ts | v1.0.1 | 2026-05-01 | BB
// Main-thread ↔ Service-Worker bridge for offline flush.
//
// Per spec §9.4: SW's `sync` event (tag `bb-universal-auth-flush`) triggers
// flush on reconnect. The SDK registers the sync, and receives flush-complete
// messages from the SW to surface to React consumers.

const SYNC_TAG = 'bb-universal-auth-flush';

export interface SwBridgeMessage {
  type: 'flush_complete' | 'flush_failed' | 'sw_registered';
  payload?: Record<string, unknown>;
}

type Listener = (msg: SwBridgeMessage) => void;
const listeners = new Set<Listener>();

let registered = false;

/**
 * Register the SDK's service worker and wire up bidirectional messaging.
 * Call once at SDK init (from consumer apps that enabled offline).
 *
 * `swUrl` defaults to `/bb-universal-auth-sw.js` — consumer apps serve the
 * SDK's SW bundle at that URL.
 */
export async function registerServiceWorker(swUrl = '/bb-universal-auth-sw.js'): Promise<void> {
  if (registered) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register(swUrl, { scope: '/' });
    registered = true;

    navigator.serviceWorker.addEventListener('message', (e: MessageEvent<SwBridgeMessage>) => {
      // Origin/source check (Phase C5 hardening): only accept messages whose
      // origin matches our page origin AND whose source is the SW that
      // currently controls this page. Without this guard a postMessage from
      // another worker (e.g. a 3rd-party SW that somehow obtains a port) or
      // a frame at a different origin could spoof flush_complete events.
      if (e.origin !== self.location.origin) return;
      if (e.source !== navigator.serviceWorker.controller) return;
      notify(e.data);
    });
  } catch {
    // SW registration blocked (incognito, CSP, etc.) — SDK falls back to
    // foreground flush when app regains focus. No throw — SW is best-effort.
  }
}

/**
 * Ask the browser to fire our sync event when next online. Falls back to
 * an immediate foreground flush if Background Sync is unavailable (Safari,
 * incognito, SW registration blocked, etc.) so callers don't have to branch.
 *
 * v1.0.1 (lookback C8): the original implementation only documented the
 * fallback in a comment ("caller should run flush() directly"). Reliability-
 * critical callers (online-event handler, retry timer) had no way to know
 * whether to schedule their own flush. Now this function ALWAYS results in
 * a flush attempt — either via SW background-sync OR via direct foreground
 * call to `reconciler.flush()`. The `reconciler` module is loaded lazily so
 * we don't bring it into the SW-only bundle.
 */
export async function requestBackgroundFlush(): Promise<void> {
  // No SW in this context (Node test, very old browser) — straight foreground.
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    await runForegroundFlush();
    return;
  }
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.ready;
  } catch {
    // SW registration was blocked or never completed — fall back.
    await runForegroundFlush();
    return;
  }
  interface SyncManager {
    register(tag: string): Promise<void>;
  }
  interface RegWithSync extends ServiceWorkerRegistration {
    sync?: SyncManager;
  }
  const withSync = reg as RegWithSync;
  if (withSync.sync) {
    try {
      await withSync.sync.register(SYNC_TAG);
      return;
    } catch {
      // SyncManager rejected (rare — usually permissions/quota) — foreground.
    }
  }
  // Background Sync API unavailable on this platform (Safari, Firefox).
  await runForegroundFlush();
}

async function runForegroundFlush(): Promise<void> {
  // Lazy-load the reconciler to keep this module's static dep graph small
  // and to avoid pulling reconciler into the SW bundle.
  try {
    const mod = await import('./reconciler.js');
    await mod.flush();
  } catch {
    // Reconciler errors must not crash the caller. The next sync event /
    // online event / explicit flush() call will retry.
  }
}

/**
 * Subscribe to SW → main-thread messages (flush outcomes, etc.).
 */
export function onBridgeMessage(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(msg: SwBridgeMessage): void {
  for (const l of listeners) {
    try {
      l(msg);
    } catch {
      // listener bugs don't crash bridge
    }
  }
}

export function __resetSwBridgeForTests(): void {
  registered = false;
  listeners.clear();
}

export { SYNC_TAG };
