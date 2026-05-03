// @samjonaidi-ship-it/universal-auth | test/unit/setup.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Vitest global setup. happy-dom provides DOM + navigator + crypto, but Node
// 25+ injects a broken `localStorage` stub (requires --localstorage-file CLI
// arg for full functionality — unused by vitest). We shim with a Map-backed
// Storage impl before any test code runs.

import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// React Testing Library — auto-cleanup DOM between tests.
afterEach(() => {
  cleanup();
});

// Swallow noisy unhandled rejections that fire on test teardown when a
// component unmounts mid-fetch (useProfile, PersonaFieldsForm, etc.).
// All patterns are pure test-env artifacts, NOT product bugs:
//
//   * "operation was aborted" — happy-dom rejects in-flight fetch on unmount
//   * "Body has already been used" — RTL re-renders consume the same Response
//   * "ENOTFOUND" / "getaddrinfo" — leaked fetch from prior test's mocked spy
//     after mockRestore tried real DNS for the dummy host (ct-bff.test)
//   * "fetch failed" — same class of leaked async fetch
//
// Real fetch errors are caught inside the SDK's try/catch blocks
// (see core/client.ts:151), so this filter only hides leaked-promise noise.
const SWALLOW_PATTERNS = [
  'operation was aborted',
  'Body has already been used',
  'aborted',
  'ENOTFOUND',
  'getaddrinfo',
  'fetch failed',
  // 'InvalidStateError' / 'transaction is not active' previously listed
  // here — REMOVED 2026-04-28 (look-back fix L12). The SDK's
  // event-reporter now catches these explicitly via `isTransientIdbError()`
  // and drops the event. A leaked InvalidStateError reaching this filter
  // again would mean a NEW unguarded IDB call path needs hardening.
];

function shouldSwallow(reason: unknown): boolean {
  const msg =
    reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : typeof reason === 'string'
        ? reason
        : '';
  return SWALLOW_PATTERNS.some((p) => msg.includes(p));
}

process.on('unhandledRejection', (reason: unknown) => {
  if (shouldSwallow(reason)) return;
  // Re-emit other rejections so real bugs surface
  throw reason;
});

process.on('uncaughtException', (err: Error) => {
  if (shouldSwallow(err)) return;
  throw err;
});

// ── localStorage shim (Node 25+ injects broken stub) ─────────────────────

function createMapBackedStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    setItem(key: string, value: string): void {
      map.set(String(key), String(value));
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
  };
}

function installStorageShim(): void {
  // Check if current localStorage is broken (missing methods)
  const current = (globalThis as { localStorage?: unknown }).localStorage;
  const isBroken =
    current === undefined ||
    current === null ||
    typeof (current as Storage).setItem !== 'function' ||
    typeof (current as Storage).clear !== 'function';

  if (isBroken) {
    const shim = createMapBackedStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: shim,
      writable: true,
      configurable: true,
    });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        value: shim,
        writable: true,
        configurable: true,
      });
    }
  }
}

installStorageShim();

// ── BroadcastChannel stub for happy-dom (if missing) ─────────────────────

if (typeof globalThis.BroadcastChannel === 'undefined') {
  class FakeBroadcastChannel {
    readonly name: string;
    constructor(name: string) {
      this.name = name;
    }
    postMessage(_msg: unknown): void {}
    addEventListener(_type: string, _listener: (ev: MessageEvent) => void): void {}
    removeEventListener(_type: string, _listener: (ev: MessageEvent) => void): void {}
    close(): void {}
  }
  (globalThis as unknown as { BroadcastChannel: typeof BroadcastChannel }).BroadcastChannel =
    FakeBroadcastChannel as unknown as typeof BroadcastChannel;
}
