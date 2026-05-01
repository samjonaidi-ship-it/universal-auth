// @bainbridgebuilders/universal-auth | src/profile/profile-store.ts | v1.0.1 | 2026-05-01 | BB
// Profile state + sync. Per §5.4.2.
//
// Endpoints:
//   GET    /identity/v1/profile                    — fetch (returns completeness)
//   PUT    /identity/v1/profile  (If-Match: ver)   — optimistic-locked update
//   POST   /identity/v1/profile/avatar             — upload (handled by avatar.ts)
//   DELETE /identity/v1/profile/avatar             — clear (handled by avatar.ts)
//
// State machine per §5.4.2: 'loading' | 'ready' | 'saving' | 'error'.
// Conflicts (409) → re-fetch, surface profile.conflict event, caller decides.

import { get, put } from '../core/client.js';
import { AuthSdkError } from '../errors.js';
import { emit } from '../core/event-reporter.js';
import type { UniversalProfile } from '../types/profile.js';
import { computeCompleteness } from './completeness.js';

// ── State machine ────────────────────────────────────────────────────────

export type ProfileState = 'loading' | 'ready' | 'saving' | 'error';

interface InternalState {
  profile: UniversalProfile | null;
  state: ProfileState;
  /** Last error message (for state='error'). */
  errorMessage: string | null;
  /**
   * Monotonic fetch generation. Bumped on every reset. Async hydrate/save
   * paths capture the generation at start; if it has changed by the time
   * the response lands, the result is discarded — prevents stale fetches
   * from leaking across test boundaries (and from clobbering a logout
   * that interrupts a hydrate in real life).
   */
  generation: number;
  /**
   * Pending patch awaiting consumer rebase after a 409 conflict (Phase D1).
   * On 409 the original patch isn't silently dropped — it stays here so the
   * caller can re-apply it via `applyProfilePatch(patch)` once they've
   * reconciled with the server-fresh profile.
   */
  dirtyPatch: Partial<UniversalProfile> | null;
}

const state: InternalState = {
  profile: null,
  state: 'loading',
  errorMessage: null,
  generation: 0,
  dirtyPatch: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // listener bugs can't crash the store
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export function getProfileSnapshot(): {
  profile: UniversalProfile | null;
  state: ProfileState;
  errorMessage: string | null;
} {
  return {
    profile: state.profile,
    state: state.state,
    errorMessage: state.errorMessage,
  };
}

export function onProfileChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Fetch the current profile. Replaces local state.
 * Emits `profile.started` if this is the first load and missing-required is non-empty.
 */
export async function hydrateProfile(): Promise<UniversalProfile | null> {
  const gen = state.generation;
  state.state = 'loading';
  state.errorMessage = null;
  notify();
  try {
    const { data } = await get<UniversalProfile>('/identity/v1/profile');
    // Generation guard — if reset/logout happened during the fetch, drop
    // this result silently rather than clobber the new state.
    if (state.generation !== gen) return null;
    state.profile = data;
    state.state = 'ready';
    notify();
    if (data.missing_required_fields.length > 0) {
      void emit('profile.started', {
        source: 'auto',
        missing_count: data.missing_required_fields.length,
      });
    }
    return data;
  } catch (err) {
    if (state.generation !== gen) return null;
    state.state = 'error';
    state.errorMessage = err instanceof Error ? err.message : String(err);
    notify();
    return null;
  }
}

/**
 * Save a partial patch. Server validates + canonicalizes; SDK reflects the
 * server-returned profile in local state. Optimistic-locked via If-Match.
 *
 * Local rejection: if the patch would leave a required field empty AND the
 * caller indicated `enforceRequired: true`, we throw locally without a
 * network call (per §5.4.5).
 */
export async function saveProfile(
  patch: Partial<UniversalProfile>,
  opts: { activePersona?: string; enforceRequired?: boolean } = {}
): Promise<UniversalProfile> {
  if (state.profile === null) {
    throw new Error(
      '[@bainbridgebuilders/universal-auth] saveProfile called before hydrateProfile completed.'
    );
  }

  // Local required-field check (§5.4.5)
  if (opts.enforceRequired === true && opts.activePersona !== undefined) {
    // Merge patch onto current profile to evaluate
    const merged = { ...state.profile, ...patch } as UniversalProfile;
    const r = computeCompleteness(merged, opts.activePersona);
    if (r.missingRequired.length > 0) {
      const err = new Error(
        `Required field(s) missing: ${r.missingRequired.join(', ')}`
      );
      void emit('profile.validation_failed', {
        field_keys: r.missingRequired,
      });
      throw err;
    }
  }

  // Generation guard — capture at start of async path (matches hydrateProfile
  // pattern). If a logout/reset bumps the generation during the await, we
  // discard the result instead of clobbering post-logout state.
  const gen = state.generation;

  state.state = 'saving';
  state.errorMessage = null;
  notify();

  const completenessBefore = state.profile.completeness_score;

  try {
    const { data } = await put<UniversalProfile>(
      '/identity/v1/profile',
      patch,
      { headers: { 'If-Match': String(state.profile.profile_version) } }
    );
    if (state.generation !== gen) {
      // Logout/reset happened during the PUT — drop the result silently.
      // Re-throw so the caller's UI doesn't show a "saved" state on a
      // session that was torn down mid-flight.
      throw new Error('Profile save aborted: session changed during save.');
    }
    state.profile = data;
    state.state = 'ready';
    // Save succeeded — any pending dirty patch from a prior 409 has been
    // superseded by this fresh write (the caller chose this patch over the
    // pending one). Clear the dirty buffer.
    state.dirtyPatch = null;
    notify();

    void emit('profile.field_saved', {
      field_keys: Object.keys(patch),
      completeness_before: completenessBefore,
      completeness_after: data.completeness_score,
    });

    if (data.completeness_score === 100 && completenessBefore < 100) {
      void emit('profile.completed', {
        fields_filled_count: Object.keys(patch).length,
      });
    }

    return data;
  } catch (err) {
    if (state.generation !== gen) {
      // Reset/logout interrupted; surface as save-aborted, NOT mutate state.
      throw err;
    }
    if (err instanceof AuthSdkError && (err.code === 'HTTP_409' || err.code === 'SYNC_CONFLICT')) {
      // Server has a newer version. Per Phase D1: do NOT silently drop the
      // patch. Keep it in `dirtyPatch` until the consumer rebases via
      // `applyProfilePatch`, and emit a payload-rich `sync.conflict` event
      // mirroring settings-sync (C8) so consumer apps can show a conflict UI.
      state.dirtyPatch = patch;
      try {
        await hydrateProfile();
      } catch {
        // hydrate failed — leave profile in error state
      }
      if (state.generation !== gen) {
        // hydrate completed but reset happened — don't touch state
        throw err;
      }
      void emit('sync.conflict', {
        endpoint: '/identity/v1/profile',
        pendingPatch: patch,
        serverState: state.profile,
        version: state.profile?.profile_version ?? null,
      });
      state.state = 'error';
      state.errorMessage = 'Profile changed elsewhere — please retry.';
      notify();
      throw err;
    }
    state.state = 'error';
    state.errorMessage = err instanceof Error ? err.message : String(err);
    notify();
    throw err;
  }
}

/**
 * Read the patch that was rejected by the server during the last 409 conflict
 * (Phase D1). Returns `null` once the consumer has rebased + re-saved
 * successfully (or if no conflict has occurred). Useful for conflict-resolution
 * UIs that need to show the user "your unsaved change was: …".
 */
export function getPendingProfilePatch(): Partial<UniversalProfile> | null {
  return state.dirtyPatch;
}

/**
 * Caller-side merge after a 409: apply a patch to the local profile snapshot
 * WITHOUT issuing a network call. Used by consumer code that has manually
 * resolved a `sync.conflict` event by combining the server-fresh state with
 * the user's pending edits. Subsequent `saveProfile()` will use the new
 * profile_version (just hydrated) for the If-Match header.
 *
 * This intentionally does not touch the dirtyPatch buffer — the caller decides
 * when to clear it via the next `saveProfile()` (which clears on success).
 */
export function applyProfilePatch(patch: Partial<UniversalProfile>): void {
  if (state.profile === null) return;
  state.profile = { ...state.profile, ...patch } as UniversalProfile;
  notify();
}

/**
 * Apply an avatar update returned by uploadAvatar / clearAvatar so the local
 * profile reflects it without a refetch. Caller still receives the URL from
 * the avatar.ts function — this just keeps the store in sync.
 */
export function applyAvatarUpdate(update: {
  avatar_url?: string;
  avatar_preset?: string;
  profile_version: number;
}): void {
  if (state.profile === null) return;
  state.profile = {
    ...state.profile,
    ...(update.avatar_url !== undefined ? { avatar_url: update.avatar_url } : {}),
    ...(update.avatar_preset !== undefined ? { avatar_preset: update.avatar_preset } : {}),
    profile_version: update.profile_version,
  };
  notify();
}

/** Test-only reset. */
export function __resetProfileStoreForTests(): void {
  state.profile = null;
  state.state = 'loading';
  state.errorMessage = null;
  state.dirtyPatch = null;
  state.generation += 1;  // invalidate any in-flight hydrate from a prior test
  listeners.clear();
}
