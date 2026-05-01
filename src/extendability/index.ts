// @bainbridgebuilders/universal-auth | src/extendability/index.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Extendability hooks per §8.5 — interface-only in v1.0; reference implementations
// land in v1.1+. The point of shipping interfaces NOW is so future capabilities
// don't require breaking SDK changes (§8.5.1 plugin matrix).

// Re-exports the three interface modules. Consumers do:
//   import { NotificationChannelAdapter } from '@bainbridgebuilders/universal-auth/extendability'
// when they implement a sibling.

export type {
  NotificationChannelAdapter,
  NotificationDelivery,
  NotificationDeliveryResult,
} from './notification-channel.js';

export type {
  AuthFlowAdapter,
  AuthFlowChallenge,
  AuthFlowAssertion,
  AuthFlowAttestation,
} from './auth-flow.js';

export type {
  RiskSignalAdapter,
  RiskSignal,
  RiskScore,
} from './risk-signal.js';

export {
  registerNotificationChannel,
  listNotificationChannels,
  getNotificationChannel,
  __resetExtendabilityForTests,
} from './registry.js';
