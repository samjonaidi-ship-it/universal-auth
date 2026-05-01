// @bainbridgebuilders/universal-auth | src/extendability/registry.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Adapter registry — consumer apps register plugins at init time.
// v1 only wires NotificationChannelAdapter; AuthFlow + RiskSignal are
// reserved interfaces (no built-in dispatch yet).

import type { NotificationChannelAdapter } from './notification-channel.js';

const channels = new Map<string, NotificationChannelAdapter>();

export function registerNotificationChannel(adapter: NotificationChannelAdapter): void {
  if (channels.has(adapter.channel_key)) {
    throw new Error(
      `[@bainbridgebuilders/universal-auth] Notification channel '${adapter.channel_key}' is already registered.`
    );
  }
  channels.set(adapter.channel_key, adapter);
}

export function listNotificationChannels(): readonly string[] {
  return [...channels.keys()];
}

export function getNotificationChannel(key: string): NotificationChannelAdapter | null {
  return channels.get(key) ?? null;
}

export function __resetExtendabilityForTests(): void {
  channels.clear();
}
