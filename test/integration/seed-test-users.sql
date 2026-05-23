-- @samjonaidi-ship-it/universal-auth | test/integration/seed-test-users.sql | v1.1.0 | 2026-05-22 | BB
--
-- Idempotent seed for the 4 test users the integration suite expects per spec §10.3:
--   - test-crew-1@test.bainbridgebuilders.com         (persona: crew)
--   - test-supplier-1@test.bainbridgebuilders.com     (persona: supplier)
--   - test-client-1@test.bainbridgebuilders.com       (persona: client)
--   - test-admin@test.bainbridgebuilders.com          (persona: admin, role: admin)
--
-- Invoked by chaos.yml integration job AFTER Neon branch is created from
-- production main, BEFORE docker compose up of ct-bff. Production is NOT
-- modified — these rows live only in the per-CI-run test branch which is
-- destroyed in the `if: always()` cleanup step.
--
-- All 4 are flagged is_test_user=TRUE so the auth-v1 test-mode shortcut
-- accepts code='000000' against them. status='active' so they pass the
-- enrollment gate. enrollment_status='active' likewise.
--
-- Idempotent: ON CONFLICT DO NOTHING on the email partial index.

INSERT INTO ct_bff.identities (email, display_name, persona_type, role, status, enrollment_status, is_test_user, primary_employee_id)
VALUES
  ('test-crew-1@test.bainbridgebuilders.com', 'Test Crew One', 'crew', 'viewer', 'active', 'active', TRUE, '8000001'),
  ('test-supplier-1@test.bainbridgebuilders.com', 'Test Supplier One', 'supplier', 'viewer', 'active', 'active', TRUE, NULL),
  ('test-client-1@test.bainbridgebuilders.com', 'Test Client One', 'client', 'viewer', 'active', 'active', TRUE, NULL),
  ('test-admin@test.bainbridgebuilders.com', 'Test Admin', 'admin', 'admin', 'active', 'active', TRUE, NULL)
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- Register the integration-test app (bb_integration_test) with the broad
-- event_types[] surface every test in this directory exercises. Without
-- this row, /events/v1/ingest rejects all events with UNKNOWN_EVENT_TYPE
-- because the app_id isn't registered.
--
-- Idempotent: ON CONFLICT DO NOTHING on the primary key.
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO ct_bff.apps (id, display_name, app_kind, status, event_types, allowed_personas)
VALUES (
  'bb_integration_test',
  'Integration Test Harness',
  'consumer',
  'active',
  ARRAY[
    -- §3.2 / §6.3 SDK-emitted events
    'feature.used',
    'sync.failed',
    'sync.flushed',
    'login.success',
    'login.failure',
    'session.refreshed',
    'session.revoked',
    'logout',
    'enrollment.code_sent',
    'enrollment.completed',
    'enrollment.code_failed',
    'enrollment.consent_recorded',
    'consent.accepted',
    'consent.revoked',
    'pin.set',
    'pin.cleared',
    'profile.updated',
    'profile.avatar_updated',
    'profile.avatar_cleared',
    'photo.uploaded',
    'permission.recorded',
    'impersonation.started',
    'impersonation.ended',
    'impersonation.local_clear_drift',
    'identity.employee_linked',
    'wizard.step_completed'
  ]::text[],
  ARRAY['crew','client','supplier','subcontractor','architect','admin']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- Register the chaos-test app (bb_chaos_test). The chaos suite signs in with
-- the same seeded test users but tags requests app_id='bb_chaos_test'; the
-- 5xx-burst scenario ingests events through /events/v1/ingest, which rejects
-- unregistered app_ids with UNKNOWN_EVENT_TYPE. Same event_types +
-- allowed_personas surface as bb_integration_test — copied via SELECT so the
-- two stay in sync without duplicating the literal array.
--
-- Idempotent: ON CONFLICT DO NOTHING on the primary key.
-- ──────────────────────────────────────────────────────────────────────────

INSERT INTO ct_bff.apps (id, display_name, app_kind, status, event_types, allowed_personas)
SELECT 'bb_chaos_test', 'Chaos Test Harness', app_kind, status, event_types, allowed_personas
FROM ct_bff.apps WHERE id = 'bb_integration_test'
ON CONFLICT (id) DO NOTHING;

-- Verification (will appear in CI log)
SELECT email, persona_type, role, is_test_user FROM ct_bff.identities WHERE email LIKE 'test-%@test.bainbridgebuilders.com' ORDER BY email;
SELECT id, app_kind, status, array_length(event_types, 1) AS n_event_types FROM ct_bff.apps WHERE id IN ('bb_integration_test', 'bb_chaos_test') ORDER BY id;
