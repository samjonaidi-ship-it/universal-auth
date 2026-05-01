// @bainbridgebuilders/universal-auth | src/extendability/notification-channel.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Per §8.5.2 — notification channel adapter interface.
// v1 ships SMS (Twilio) + email (Resend) as built-ins behind this interface.
// v1.1+ may register Push, Slack, Teams, WhatsApp, etc., without an SDK bump.

export interface NotificationDelivery {
  /** Stable channel identifier (e.g., 'sms', 'email', 'push', 'slack'). */
  channel_key: string;
  /** Recipient address — semantics defined per channel (E.164, email, etc.). */
  destination: string;
  /** Body text (channel may render or transform). */
  body: string;
  /** Optional subject (used by email; ignored by SMS). */
  subject?: string;
  /** Channel-specific metadata. Channel adapter decides how to interpret. */
  metadata?: Record<string, unknown>;
}

export interface NotificationDeliveryResult {
  ok: boolean;
  /** Provider message id (e.g., Twilio SID, Resend message id). */
  provider_message_id?: string;
  /** Reason on failure. */
  reason?: string;
}

/**
 * Adapter contract — a sibling package or app implements this and registers
 * via `registerNotificationChannel`. The SDK never reaches into providers
 * directly; it routes by `channel_key`.
 */
export interface NotificationChannelAdapter {
  channel_key: string;
  /**
   * Probe whether this adapter can deliver to the given destination.
   * Used by the dispatcher to decide channel ranking when an event allows
   * multiple channels (e.g., SMS preferred, email fallback).
   */
  canDeliverTo(destination: string): boolean;
  deliver(delivery: NotificationDelivery): Promise<NotificationDeliveryResult>;
}
