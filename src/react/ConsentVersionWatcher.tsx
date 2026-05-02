// @bainbridgebuilders/universal-auth | src/react/ConsentVersionWatcher.tsx | v1.0.0-rc.4 | 2026-04-30 | BB
// Policy version-bump re-prompt logic — per BB_UNIVERSAL_AUTH_SDK_SPEC.md §3.4
// "Versioning + re-prompt flow" + PERSONA_PCP_DESIGN.md §4.5.
//
// On `status === 'authenticated'`:
//   1. Fetch consent_documents for the active persona's audience
//   2. Fetch the user's accepted consents
//   3. For each REQUIRED document where the user's accepted policy_version
//      is OLDER than the current document's policy_version (or the user has
//      never accepted), mark as needs-reaccept
//   4. If any needs-reaccept, render <ConsentScreen required={[...stale]}>
//      as a modal-style overlay that blocks app interaction
//   5. After the user accepts, re-fetch and dismiss
//
// Edge cases:
//   - Fail-open per spec §11: if the network errors out, log + dismiss the
//     overlay. The CT BFF still hard-gates on the next API call via
//     CONSENT_REQUIRED, so we don't strand the user behind a flaky request.
//   - Single retry on transient failures.
//   - Persona-change cases (e.g. `client` → `homeowner` via Stripe webhook)
//     arrive here via `activePersona` flipping, which changes the resolved
//     audience and naturally re-runs `evaluate()`.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useAuth } from './useAuth.js';
import {
  bulkAcceptConsents,
  getConsentDocuments,
  listConsents,
  type ListedConsent,
} from '../flows/consent.js';
import type { ConsentDocumentRef } from '../flows/enroll-flow.js';
import { ConsentScreen } from './components/ConsentScreen.js';

export interface ConsentVersionWatcherProps {
  /**
   * Optional explicit audience override. If omitted, uses
   * `useAuth().activePersona.persona_type` (the persona whose route the
   * user is currently on).
   */
  audience?: string;
  /** Heading for the re-prompt screen. */
  heading?: string;
  /** Children render normally; the watcher overlays only when re-prompt needed. */
  children?: ReactNode;
}

interface ReprompState {
  needed: boolean;
  stale: readonly ConsentDocumentRef[];
  loading: boolean;
}

const INITIAL: ReprompState = { needed: false, stale: [], loading: false };

export function ConsentVersionWatcher({
  audience,
  heading = 'Updated consents',
  children,
}: ConsentVersionWatcherProps): ReactNode {
  const { activePersona, status } = useAuth();
  const [state, setState] = useState<ReprompState>(INITIAL);
  const inFlightRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const resolvedAudience =
    audience ?? activePersona?.persona_type ?? null;

  const evaluate = useCallback(async (): Promise<void> => {
    if (resolvedAudience === null) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState((s) => ({ ...s, loading: true }));

    try {
      const result = await fetchWithRetry(resolvedAudience);
      const stale = computeStale(result.documents, result.consents);
      setState({
        needed: stale.length > 0,
        stale,
        loading: false,
      });
    } catch {
      // Fail-open per §11 — server still hard-gates via CONSENT_REQUIRED.
      setState(INITIAL);
    } finally {
      inFlightRef.current = false;
    }
  }, [resolvedAudience]);

  // Evaluate on auth ready + audience change. Persona-change cases (e.g.
  // client → homeowner via Stripe webhook firing `profile.persona_changed`)
  // arrive here via `activePersona` flipping, which changes `resolvedAudience`
  // and re-runs `evaluate`.
  useEffect(() => {
    if (status !== 'authenticated') return;
    void evaluate();
  }, [status, evaluate]);

  const handleAccept = useCallback(
    async (
      consents: readonly { consent_type: string; policy_version: string }[]
    ): Promise<void> => {
      await bulkAcceptConsents(consents);
      // Re-evaluate to confirm the dismissal.
      await evaluate();
    },
    [evaluate]
  );

  // Move focus into the dialog when it opens (WCAG 2.4.3 — Focus Order).
  const isDialogVisible = state.needed && state.stale.length > 0;
  useEffect(() => {
    if (!isDialogVisible) return;
    dialogRef.current?.focus();
  }, [isDialogVisible]);

  // Keyboard handler — Escape is intentionally blocked here because this
  // dialog is a hard-block (required consent re-prompt). Per spec §11 the
  // only exit is accepting the updated policies.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === 'Tab') {
      // Constrain focus within the dialog (basic focus trap).
      const el = dialogRef.current;
      if (el === null) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  if (isDialogVisible) {
    return (
      <div
        ref={dialogRef}
        className="bb-auth-consent-version-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bb-auth-consent-version-heading"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="bb-auth-consent-version-modal">
          <h2 id="bb-auth-consent-version-heading" className="bb-auth-heading">
            {heading}
          </h2>
          <p className="bb-auth-description">
            Our policies have been updated. Please review and accept to continue.
          </p>
          <ConsentScreen required={state.stale} onAccept={handleAccept} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface FetchResult {
  documents: readonly ConsentDocumentRef[];
  consents: readonly ListedConsent[];
}

async function fetchWithRetry(audience: string): Promise<FetchResult> {
  try {
    return await fetchOnce(audience);
  } catch (err) {
    // One transient retry per spec — fail-open after that.
    if (isTransient(err)) {
      return fetchOnce(audience);
    }
    throw err;
  }
}

async function fetchOnce(audience: string): Promise<FetchResult> {
  const [documents, consents] = await Promise.all([
    getConsentDocuments(audience),
    listConsents(),
  ]);
  return { documents, consents };
}

function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.message.includes('fetch failed') ||
    err.message.includes('NetworkError') ||
    err.message.includes('aborted') ||
    err.message.includes('Failed to fetch')
  );
}

/**
 * Compare each REQUIRED document's policy_version against what the user has
 * accepted. A document is "stale" if:
 *   - the user has never accepted it, OR
 *   - the user's accepted policy_version is < current document's policy_version
 *
 * Optional documents are ignored — they're handled by <ConsentCenter>.
 */
export function computeStale(
  documents: readonly ConsentDocumentRef[],
  accepted: readonly ListedConsent[]
): readonly ConsentDocumentRef[] {
  const acceptedByType = new Map<string, string>();
  for (const c of accepted) {
    if (c.revoked_at !== null) continue;
    // Keep the highest accepted version per type.
    const existing = acceptedByType.get(c.consent_type);
    if (existing === undefined || compareVersions(c.policy_version, existing) > 0) {
      acceptedByType.set(c.consent_type, c.policy_version);
    }
  }

  const stale: ConsentDocumentRef[] = [];
  for (const doc of documents) {
    if (!doc.required) continue;
    const accepted = acceptedByType.get(doc.consent_type);
    if (accepted === undefined) {
      stale.push(doc);
      continue;
    }
    if (compareVersions(accepted, doc.policy_version) < 0) {
      stale.push(doc);
    }
  }
  return stale;
}

/**
 * Compare semver-ish strings ("1.0", "2.1", "1.0.0") returning -1/0/1.
 * Non-numeric segments fall back to lexicographic compare.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? '0';
    const y = pb[i] ?? '0';
    const nx = Number(x);
    const ny = Number(y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) {
      if (nx < ny) return -1;
      if (nx > ny) return 1;
      continue;
    }
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
