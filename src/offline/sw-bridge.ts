// @bb/universal-auth | src/offline/sw-bridge.ts | v1.0.0-rc.1 | 2026-04-24 | BB
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
      notify(e.data);
    });
  } catch {
    // SW registration blocked (incognito, CSP, etc.) — SDK falls back to
    // foreground flush when app regains focus. No throw — SW is best-effort.
  }
}

/**
 * Ask the browser to fire our sync event when next online. Falls back to
 * immediate flush if Background Sync isn't available.
 */
export async function requestBackgroundFlush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
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
      // fall through to foreground flush
    }
  }
  // No Background Sync support — caller should run flush() directly.
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
