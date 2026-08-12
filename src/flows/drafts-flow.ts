// @samjonaidi-ship-it/universal-auth | src/flows/drafts-flow.ts | v1.0.0 | 2026-08-11 | BB
//
// Resumable drafts, keyed by IDENTITY rather than device (P5c).
//
// The offline mutation queue is the right home for COMPLETED mutations waiting
// for a connection. A half-written form is not a completed mutation, and until
// now it had no home beyond the device it was typed on — start a help request
// on the iPad, pick up the phone, and it simply is not there.
//
// Deliberately small, and deliberately not a "drafts platform": one consumer
// today. `kind` namespaces it so a second one does not collide.

import { get, put, del } from '../core/client.js';

export interface DraftEnvelope<T = Record<string, unknown>> {
  /** null when nothing is saved — a normal answer, not an error. */
  draft: T | null;
  updated_at: string | null;
  /** Which device last wrote it, so the UI can say where it came from. */
  device_family_id: string | null;
}

/**
 * Read the saved draft for this identity.
 *
 * Resolves `{ draft: null }` rather than throwing when there is nothing saved,
 * and also when the read fails — a draft is a convenience, and a caller should
 * never have to wrap "resume my form" in error handling that could block the
 * form from opening.
 */
export async function getDraft<T = Record<string, unknown>>(
  kind: string,
  options: { signal?: AbortSignal } = {},
): Promise<DraftEnvelope<T>> {
  const empty: DraftEnvelope<T> = { draft: null, updated_at: null, device_family_id: null };
  try {
    const { data } = await get<DraftEnvelope<T>>(`/auth/v1/drafts/${encodeURIComponent(kind)}`, {
      ...(options.signal !== undefined && { signal: options.signal }),
    });
    return {
      draft: (data?.draft ?? null) as T | null,
      updated_at: data?.updated_at ?? null,
      device_family_id: data?.device_family_id ?? null,
    };
  } catch {
    return empty;
  }
}

/**
 * Save (or overwrite) the draft. Last write wins.
 *
 * NOT merged or versioned on purpose: the realistic conflict is one human
 * typing on two devices, and "the most recent keystroke wins" is what they
 * expect. Version vectors would be machinery serving a case that does not
 * occur.
 *
 * Callers MUST strip file bytes before calling — attachments are megabytes and
 * are useless on another device anyway (a File object does not travel). The
 * server enforces a 64 KB cap; hitting it means the caller forgot.
 *
 * @returns whether the server stored it
 */
export async function putDraft(
  kind: string,
  content: Record<string, unknown>,
  options: { signal?: AbortSignal } = {},
): Promise<boolean> {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) return false;
  try {
    const { data } = await put<{ saved?: boolean }>(
      `/auth/v1/drafts/${encodeURIComponent(kind)}`,
      { content },
      { ...(options.signal !== undefined && { signal: options.signal }) },
    );
    return data?.saved === true;
  } catch {
    // Offline is normal while drafting in the field. The local copy is still
    // authoritative for this device; the next save supersedes this one.
    return false;
  }
}

/** Discard the draft — the work was submitted, or abandoned. Idempotent. */
export async function deleteDraft(
  kind: string,
  options: { signal?: AbortSignal } = {},
): Promise<boolean> {
  try {
    const { data } = await del<{ deleted?: boolean }>(
      `/auth/v1/drafts/${encodeURIComponent(kind)}`,
      { ...(options.signal !== undefined && { signal: options.signal }) },
    );
    return data?.deleted === true;
  } catch {
    return false;
  }
}
