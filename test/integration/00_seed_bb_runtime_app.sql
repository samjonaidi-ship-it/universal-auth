-- bb-integration-stack | 00_seed_bb_runtime_app.sql | generated 2026-05-01 | BB
-- Stub of bb_runtime_app.ct_users for integration test postgres.
-- Source: live Neon prod (polished-lab-12287925/production) via neondb_owner.
-- Mounts FIRST alphabetically so CT BFF migrations resolve FKs to bb_runtime_app.

CREATE SCHEMA IF NOT EXISTS bb_runtime_app;

CREATE TABLE IF NOT EXISTS bb_runtime_app.ct_users (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  pin_algo TEXT NOT NULL DEFAULT 'pbkdf2-sha256'::text,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);

ALTER TABLE bb_runtime_app.ct_users DROP CONSTRAINT IF EXISTS ct_users_pkey;
ALTER TABLE bb_runtime_app.ct_users ADD PRIMARY KEY (id);
