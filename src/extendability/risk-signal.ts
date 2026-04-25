// @bb/universal-auth | src/extendability/risk-signal.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Per §8.5.1 — risk-signal adapter for adaptive step-up.
// v1.0 ships device + rate-limit signals server-side. Future v1.2+ may
// register geo, time-of-day, velocity, etc. Interface reserved here so the
// adapter shape is stable when those land.

export interface RiskSignal {
  /** Stable signal id (e.g., 'geo_anomaly', 'velocity', 'time_of_day'). */
  signal_key: string;
  /** Numeric score 0..1 where 1 = highest risk for THIS signal. */
  score: number;
  /** Human-readable reason — surfaced in admin tooling. */
  reason?: string;
  /** Free-form details for audit. */
  metadata?: Record<string, unknown>;
}

export interface RiskScore {
  /** Overall combined score 0..1. */
  score: number;
  /** Active signals contributing to the score. */
  signals: readonly RiskSignal[];
}

export interface RiskSignalAdapter {
  signal_key: string;
  /**
   * Evaluate this signal for the given action context. Returns null when the
   * signal is not applicable (e.g., geo signal on a server-to-server call).
   */
  evaluate(context: {
    action: string;
    identity_id?: string;
    device_id?: string;
    timestamp_ms: number;
    metadata?: Record<string, unknown>;
  }): Promise<RiskSignal | null>;
}
