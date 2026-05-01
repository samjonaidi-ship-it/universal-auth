#!/bin/bash
# bb-integration-stack | run-ct-bff-migrations.sh | 2026-05-01 | BB
#
# Postgres docker-entrypoint-initdb.d only walks the TOP level. CT BFF
# migrations are mounted under a subdir (`/docker-entrypoint-initdb.d/ct_bff`)
# to keep them out of the seed file's namespace.
#
# This shim runs AFTER 00_seed_bb_runtime_app.sql (alphabetical: 00 < 01) and
# BEFORE ct-bff service tries to start (postgres healthcheck waits for initdb
# to finish).
#
# It applies all CT BFF migrations in numeric order against the same Neon-test
# DB the seed bootstrapped, picking up where 00_seed left off.

set -euo pipefail

MIGRATIONS_DIR="/docker-entrypoint-initdb.d/ct_bff"
DB_USER="${POSTGRES_USER:-bb_test}"
DB_NAME="${POSTGRES_DB:-ct_bff_test}"

echo "[run-ct-bff-migrations] Applying CT BFF migrations from $MIGRATIONS_DIR"

# Find numbered SQL files (NNN_*.sql) sorted by leading number
shopt -s nullglob
FILES=("$MIGRATIONS_DIR"/[0-9][0-9][0-9]_*.sql)

if [ ${#FILES[@]} -eq 0 ]; then
  echo "[run-ct-bff-migrations] No migration files found"
  exit 0
fi

for f in "${FILES[@]}"; do
  echo "[run-ct-bff-migrations] Applying $(basename "$f")"
  if ! psql -v ON_ERROR_STOP=1 --username "$DB_USER" --dbname "$DB_NAME" -f "$f"; then
    echo "[run-ct-bff-migrations] FAILED on $(basename "$f")"
    exit 1
  fi
done

echo "[run-ct-bff-migrations] All ${#FILES[@]} CT BFF migrations applied"
