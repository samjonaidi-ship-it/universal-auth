#!/bin/bash
# bb-integration-stack | run-ct-bff-migrations.sh | v1.1.1 | 2026-05-19 | BB
# v1.1.1: force C-locale collation so the glob sorts in byte (ASCII) order.
#         Without LC_ALL=C, the postgres container's default `C.UTF-8` locale
#         gives a locale-aware sort that places 049b_seat_pools.sql BEFORE
#         049_subscriptions.sql (UTF-8 collation can ignore/reorder
#         punctuation like `_`). 049b then ran first and FAILED because
#         049's subscriptions table didn't exist yet — exiting the script
#         before 049 ever ran. C-locale = strict ASCII order = `_` (0x5F)
#         < `b` (0x62) so `049_*` correctly precedes `049b_*`.
# v1.1.0: glob now also picks up letter-suffixed migration files
#         (049b_seat_pools.sql, 049c_bridge_master_snapshot.sql, etc.).
#         The previous `[0-9][0-9][0-9]_*.sql` required an underscore
#         immediately after the 3-digit prefix, which skipped 049c
#         entirely — and 050_stakeholder_search.sql then failed because
#         it references ct_bff.bridge_master_snapshot from 049c.
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

# Force ASCII collation for the glob expansion below — see v1.1.1 note.
export LC_ALL=C

MIGRATIONS_DIR="/docker-entrypoint-initdb.d/ct_bff"
DB_USER="${POSTGRES_USER:-bb_test}"
DB_NAME="${POSTGRES_DB:-ct_bff_test}"

echo "[run-ct-bff-migrations] Applying CT BFF migrations from $MIGRATIONS_DIR"

# Find numbered SQL files (NNN_*.sql AND NNN<letter>_*.sql) sorted by name.
# Lexical sort in C locale keeps the correct order: 049 < 049b < 049c < 050
# (ASCII `_` (0x5F) sorts before `b` (0x62), so `049_*` comes before
# `049b_*` before `049c_*` before `050_*`).
shopt -s nullglob
FILES=("$MIGRATIONS_DIR"/[0-9][0-9][0-9]*_*.sql)

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
