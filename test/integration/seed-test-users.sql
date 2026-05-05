-- @samjonaidi-ship-it/universal-auth | test/integration/seed-test-users.sql | v1.0.0 | 2026-05-04 | BB
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

-- Verification (will appear in CI log)
SELECT email, persona_type, role, is_test_user FROM ct_bff.identities WHERE email LIKE 'test-%@test.bainbridgebuilders.com' ORDER BY email;
