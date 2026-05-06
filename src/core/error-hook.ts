// @samjonaidi-ship-it/universal-auth | src/core/error-hook.ts | v1.0.0 | 2026-05-06 | BB
// P1-E — central registration point for the consumer-supplied `config.onError`
// callback. Any SDK module that previously hit `console.warn` for a soft-fail
// path now goes through `reportSoftError(err)`. If the consumer set
// `onError` on `initUniversalAuth`, their handler runs (typically piping
// into Sentry / LogRocket / Datadog). If they didn't, we fall through to
// `console.warn` so the gap is still visible during local dev.
//
// Why a separate module rather than reading config.ts directly: token-manager
// and client are loaded lazily (`await import(...)`) by initUniversalAuth.
// They cannot import config.ts without creating a circular dep through the
// imports they themselves are loaded by. This tiny module sits below both
// and is registered by config.ts at init time.

let onErrorCallback: ((err: unknown) => void) | null = null;

/**
 * Register the consumer's `onError` callback. Called once by
 * `initUniversalAuth()` after parsing `config.onError`.
 *
 * Passing `null` clears the registration (used by tests to assert
 * fallback-to-console behavior).
 */
export function registerOnError(cb: ((err: unknown) => void) | null): void {
  onErrorCallback = cb;
}

/**
 * Report a soft error from inside the SDK.
 *
 * If a consumer-provided `onError` is registered, invoke it with the error
 * (wrapped in a try/catch so a buggy consumer hook can't break the SDK's
 * internal flow). Otherwise fall through to `console.warn` so local dev
 * still sees the message.
 *
 * Use this for non-fatal soft failures: DPoP build error → fall back to
 * Bearer, refresh response missing `refresh_expires_at`, navigator.locks
 * unavailable, etc.
 */
export function reportSoftError(err: unknown): void {
  if (onErrorCallback !== null) {
    try {
      onErrorCallback(err);
      return;
    } catch (hookErr) {
      // Consumer's hook itself threw — don't let that swallow the original.
      // Fall through to console.warn with both messages.

      console.warn(
        '[@samjonaidi-ship-it/universal-auth] config.onError handler threw; falling back to console.warn.',
        hookErr,
      );
    }
  }

  console.warn(...formatForConsole(err));
}

function formatForConsole(err: unknown): unknown[] {
  if (err instanceof Error) {
    return [`[@samjonaidi-ship-it/universal-auth] ${err.message}`, err];
  }
  return ['[@samjonaidi-ship-it/universal-auth]', err];
}

/** Test-only — reset the registered hook. */
export function __resetOnErrorForTests(): void {
  onErrorCallback = null;
}
