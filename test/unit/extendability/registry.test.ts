// @bainbridgebuilders/universal-auth | test/unit/extendability/registry.test.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// A4 gate #7 — throwaway mock NotificationChannelAdapter registers + delivers.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerNotificationChannel,
  listNotificationChannels,
  getNotificationChannel,
  __resetExtendabilityForTests,
} from '../../../src/extendability/registry.js';
import type { NotificationChannelAdapter } from '../../../src/extendability/notification-channel.js';

describe('extendability/registry — NotificationChannel (§8.5.2)', () => {
  beforeEach(() => {
    __resetExtendabilityForTests();
  });

  it('starts empty', () => {
    expect(listNotificationChannels()).toEqual([]);
  });

  it('a mock adapter registers and is retrievable by key', async () => {
    const delivered: string[] = [];
    const mock: NotificationChannelAdapter = {
      channel_key: 'mock_push',
      canDeliverTo: (d) => d.startsWith('device:'),
      deliver: async (d) => {
        delivered.push(`${d.destination}::${d.body}`);
        return { ok: true, provider_message_id: 'mock-1' };
      },
    };
    registerNotificationChannel(mock);

    expect(listNotificationChannels()).toEqual(['mock_push']);
    const fetched = getNotificationChannel('mock_push');
    expect(fetched).toBe(mock);

    // End-to-end deliver
    const result = await fetched!.deliver({
      channel_key: 'mock_push',
      destination: 'device:abc',
      body: 'hello',
    });
    expect(result.ok).toBe(true);
    expect(delivered).toEqual(['device:abc::hello']);
  });

  it('rejects duplicate registration of the same channel_key', () => {
    const mock: NotificationChannelAdapter = {
      channel_key: 'sms',
      canDeliverTo: () => true,
      deliver: async () => ({ ok: true }),
    };
    registerNotificationChannel(mock);
    expect(() => registerNotificationChannel(mock)).toThrow(/already registered/);
  });

  it('returns null for unknown channel', () => {
    expect(getNotificationChannel('unknown')).toBeNull();
  });
});
