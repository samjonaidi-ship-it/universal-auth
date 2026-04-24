// @bb/universal-auth | src/core/settings-sync.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Settings sync with debounced PUT + If-Match optimistic locking.
//
// Invariants per spec:
//   §3.3     GET  /identity/v1/settings   → { settings, version }
//   §3.3     PUT  /identity/v1/settings   → If-Match: <version>, replaces settings
//   §8.1     Debounced 500ms PUT (configurable)
//   §6.1     Emits `settings.changed` on successful PUT; `settings.restored` on
//            first hydrate against a new device (§8.1 restore-prompt)
//   §9.4     On 409 Conflict → emit `sync.conflict`, re-hydrate, consumer resolves

import { get, put } from './client.js';
import { AuthSdkError } from '../errors.js';
import { emit } from './event-reporter.js';

// ── Types ─────────────────────────────────────────────────────────────────

export type SettingsShape = Record<string, unknown>;

interface GetResponse {
  settings: SettingsShape;
  version: number;
}

// ── Internal state ────────────────────────────────────────────────────────

let debounceMs = 500;

interface LocalState {
  settings: SettingsShape;
  version: number;         // last known server version
  dirty: boolean;          // true when local has unsaved changes
  hydrated: boolean;
}

const state: LocalState = {
  settings: {},
  version: 0,
  dirty: false,
  hydrated: false,
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightPut: Promise<void> | null = null;

type Listener = (settings: SettingsShape) => void;
const listeners = new Set<Listener>();

// ── Public API ────────────────────────────────────────────────────────────

export interface SettingsSyncConfig {
  debounceMs?: number;
}

export function configureSettingsSync(opts: SettingsSyncConfig = {}): void {
  if (opts.debounceMs !== undefined) debounceMs = opts.debounceMs;
}

/**
 * First-load hydration against `/identity/v1/settings`. Call on session start.
 * Emits `settings.restored` when the server version > 0 and the SDK's local
 * snapshot was empty (= fresh device restoring remembered settings).
 */
export async function hydrateSettings(): Promise<void> {
  const wasEmpty = state.hydrated === false && Object.keys(state.settings).length === 0;
  const { data } = await get<GetResponse>('/identity/v1/settings');
  state.settings = data.settings;
  state.version = data.version;
  state.hydrated = true;
  state.dirty = false;
  notify();

  if (wasEmpty && data.version > 0) {
    void emit('settings.restored', { version: data.version });
  }
}

export function getSettings(): Readonly<SettingsShape> {
  return state.settings;
}

export function getSettingsVersion(): number {
  return state.version;
}

/**
 * Merge a partial patch into settings and schedule a debounced server PUT.
 * Local state updates immediately (optimistic); listeners fire right away.
 */
export function updateSettings(patch: SettingsShape): void {
  // Shallow merge — callers can pass nested objects; they replace wholesale.
  state.settings = { ...state.settings, ...patch };
  state.dirty = true;
  notify();
  scheduleWrite();
}

export function onSettingsChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── Internals ─────────────────────────────────────────────────────────────

function scheduleWrite(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushWrite();
  }, debounceMs);
}

async function flushWrite(): Promise<void> {
  if (inFlightPut !== null) return inFlightPut;
  if (!state.dirty) return;

  inFlightPut = (async () => {
    try {
      const { data } = await put<GetResponse>(
        '/identity/v1/settings',
        { settings: state.settings },
        { headers: { 'If-Match': String(state.version) } }
      );
      state.version = data.version;
      state.settings = data.settings;
      state.dirty = false;
      notify();
      void emit('settings.changed', {
        changed_keys: Object.keys(state.settings),
        new_version: data.version,
      });
    } catch (err) {
      if (err instanceof AuthSdkError && isConflict(err)) {
        void emit('sync.conflict', { endpoint: '/identity/v1/settings' });
        // Rehydrate from server — caller's responsibility to re-apply patch
        try {
          await hydrateSettings();
        } catch {
          // Rehydrate failed — leave dirty flag for retry on next call
        }
        return;
      }
      // Network / 5xx — leave dirty; next updateSettings() re-schedules
    } finally {
      inFlightPut = null;
    }
  })();

  return inFlightPut;
}

function isConflict(err: AuthSdkError): boolean {
  // Client library throws typed errors; 409 surfaces as an envelope with
  // `code: 'SYNC_CONFLICT'` or via HTTP status encoded in the code.
  return err.code === 'SYNC_CONFLICT' || err.code === 'HTTP_409';
}

function notify(): void {
  for (const l of listeners) {
    try {
      l(state.settings);
    } catch {
      // listener bugs don't crash sync
    }
  }
}

/**
 * Force an immediate flush (used on logout, page hide).
 */
export async function flushSettingsNow(): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await flushWrite();
}

// ── Test-only ─────────────────────────────────────────────────────────────

export function __resetSettingsSyncForTests(): void {
  debounceMs = 500;
  state.settings = {};
  state.version = 0;
  state.dirty = false;
  state.hydrated = false;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  inFlightPut = null;
  listeners.clear();
}
