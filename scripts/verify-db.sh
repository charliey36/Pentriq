#!/usr/bin/env bash
# Applies Pentriq's full database setup to a scratch PostgreSQL database and runs the SQL test suites.
#
#   1. supabase/tests/supabase-shim.sql  (stand-in for Supabase's auth/storage schemas and roles)
#   2. supabase/schema.sql
#   3. every supabase/migrations/*.sql in numeric order, TWICE (every migration must be safe to re-run)
#   4. every supabase/tests/*.test.sql (each raises an exception on failure), then supabase/tests/claim-race.sh
#      (concurrent connections racing for the same scheduled sends)
#   5. scripts/check-schema-drift.mjs: every column the code selects/filters on, and every column declared in
#      src/lib/database.types.ts, must exist in the migrated schema
#
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=... scripts/verify-db.sh [database_name]
# Never point this at a real Supabase project: step 1 creates objects Supabase already owns, and the
# database named below is dropped and recreated.
set -euo pipefail

DB="${1:-pentriq_verify}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set=client_min_messages=warning -d "$DB")

if [[ "$DB" != *verify* && "$DB" != *test* ]]; then
  echo "Refusing to drop '$DB': the database name must contain 'verify' or 'test'." >&2
  exit 2
fi

echo "==> Recreating database $DB"
dropdb --if-exists "$DB"
createdb "$DB"

echo "==> Supabase stand-in"
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase-shim.sql"

echo "==> schema.sql"
"${PSQL[@]}" -f "$ROOT/supabase/schema.sql"

for pass in 1 2; do
  echo "==> Migrations, pass $pass"
  for file in "$ROOT"/supabase/migrations/*.sql; do
    if ! out=$("${PSQL[@]}" -f "$file" 2>&1); then
      echo "FAILED (pass $pass): $(basename "$file")" >&2
      echo "$out" >&2
      exit 1
    fi
  done
done

echo "==> SQL tests"
shopt -s nullglob
tests=("$ROOT"/supabase/tests/*.test.sql)
if [[ ${#tests[@]} -eq 0 ]]; then
  echo "No SQL tests found." >&2
  exit 1
fi
for file in "${tests[@]}"; do
  if ! out=$("${PSQL[@]}" -f "$file" 2>&1); then
    echo "FAILED: $(basename "$file")" >&2
    echo "$out" >&2
    exit 1
  fi
  echo "    ok  $(basename "$file")"
done

echo "==> Concurrent claims (cron senders)"
bash "$ROOT/supabase/tests/claim-race.sh" "$DB"

echo "==> Code and types against the migrated schema"
columns_file="$(mktemp)"
trap 'rm -f "$columns_file"' EXIT
psql -X -At -d "$DB" -c "select json_object_agg(table_name, cols) from (select table_name, json_agg(column_name order by ordinal_position) as cols from information_schema.columns where table_schema = 'public' group by table_name) s" > "$columns_file"
node "$ROOT/scripts/check-schema-drift.mjs" "$columns_file"

echo "==> All database checks passed"
