#!/usr/bin/env bash
# ============================================================
# Run the whole schema against a throwaway Postgres.
#
#   bash app/scripts/pg-harness/run.sh
#
# Needs a local Postgres and a role that can create databases. On WSL:
#   sudo apt-get install -y postgresql
#   sudo -u postgres createuser -s "$(whoami)"
#
# Exits non-zero on the first error, because a migration that fails
# halfway is exactly the failure this is looking for.
# ============================================================
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bundle="$here/../../supabase/deploy-all.sql"
db="penthouse_harness_$$"

if [ ! -f "$bundle" ]; then
  echo "no bundle at $bundle — run: npm run sql:bundle" >&2
  exit 1
fi

cleanup() { dropdb --if-exists "$db" 2>/dev/null; }
trap cleanup EXIT

echo "→ creating $db"
createdb "$db" || { echo "could not create a database — is the role set up?" >&2; exit 1; }

echo "→ loading the Supabase stubs"
psql -q -d "$db" -v ON_ERROR_STOP=1 -f "$here/prelude.sql" || exit 1

# pg_cron and pg_net are hosted-only. The prelude has already supplied
# cron.schedule() and net.http_post(), so the calls still run.
echo "→ running the bundle"
sed -E '/create extension if not exists (pg_cron|pg_net)/d' "$bundle" \
  | psql -q -d "$db" -v ON_ERROR_STOP=1 2>&1 \
  | tee "$here/last-run.log"

status="${PIPESTATUS[1]}"
if [ "$status" -ne 0 ]; then
  echo ""
  echo "✗ the bundle FAILED — this is what a client's paste would do"
  echo "  the error is above, and in $here/last-run.log"
  exit 1
fi

echo ""
echo "→ what was built"
psql -q -d "$db" -At -F' ' <<'SQL'
select 'tables          ', count(*) from pg_tables where schemaname = 'public';
select 'with RLS        ', count(*) from pg_tables t
  join pg_class c on c.relname = t.tablename and c.relnamespace = 'public'::regnamespace
  where t.schemaname = 'public' and c.relrowsecurity;
select 'forced RLS      ', count(*) from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relforcerowsecurity;
select 'policies        ', count(*) from pg_policies where schemaname = 'public';
select 'functions       ', count(*) from pg_proc where pronamespace = 'public'::regnamespace;
select 'enums           ', count(*) from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e';
select 'cron jobs       ', count(*) from cron.job;
select 'roles seeded    ', count(*) from roles;
select 'profiles seeded ', count(*) from profiles;
select 'capabilities    ', count(*) from role_capabilities;
SQL

echo ""
echo "→ tables with no policy at all (readable by nobody)"
psql -q -d "$db" -At <<'SQL'
select '  ' || t.tablename
  from pg_tables t
 where t.schemaname = 'public'
   and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = t.tablename)
 order by 1;
SQL

echo ""
echo "→ grant_table() must not have survived the paste"
psql -q -d "$db" -At -c "select case when count(*) = 0 then '  gone, as intended' else '  STILL PRESENT — it can write policies' end from pg_proc where proname = 'grant_table';"

# The schema running is half of it. The other half is whether the
# policies refuse what they claim to — which can only be answered by
# being each person in turn, as a role that RLS applies to.
psql -q -d "$db" -v ON_ERROR_STOP=1 -f "$here/policy-test.sql" || {
  echo "✗ the policy tests failed" >&2
  exit 1
}

echo ""
echo "✓ the bundle ran clean and the policies hold"
