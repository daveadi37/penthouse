#!/usr/bin/env bash
# Build the schema once, then run a SQL file against it and drop it.
#   bash app/scripts/pg-harness/inspect.sh policies.sql
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bundle="$here/../../supabase/deploy-all.sql"
query="${1:?usage: inspect.sh <file.sql>}"
[ -f "$query" ] || query="$here/$query"
db="penthouse_inspect_$RANDOM"

cleanup() { dropdb --if-exists "$db" 2>/dev/null; }
trap cleanup EXIT

createdb "$db" || exit 1
psql -q -d "$db" -v ON_ERROR_STOP=1 -f "$here/prelude.sql" >/dev/null 2>&1 || exit 1
sed -E '/create extension if not exists (pg_cron|pg_net)/d' "$bundle" \
  | psql -q -d "$db" -v ON_ERROR_STOP=1 >/dev/null 2>&1

# ON_ERROR_STOP, because a probe row that fails to insert makes a
# capability test read as a refusal — which is precisely the wrong
# answer to get quietly.
psql -q -d "$db" -v ON_ERROR_STOP=1 -f "$query"
