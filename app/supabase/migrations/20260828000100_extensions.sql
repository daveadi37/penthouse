-- ============================================================
-- Foundations. The three extensions the rest of the schema leans
-- on, and the one trigger function that every editable table shares.
--
-- Nothing here creates a table. It exists so that the files after it
-- can call gen_random_uuid(), schedule the 09:00 jobs and reach the
-- push service without each one re-declaring the same machinery.
-- ============================================================

-- gen_random_uuid() is the default for nearly every primary key in
-- this schema. Without pgcrypto the very next migration fails.
create extension if not exists pgcrypto;

-- The running sheet has to be posted to the 3808 Home group by 09:00,
-- so the sheet reminder, the late flag, the day builder and the expiry
-- sweeps all run on a clock rather than on someone opening the app.
-- pg_cron is what holds that clock.
create extension if not exists pg_cron;

-- The scheduled jobs have to reach outside Postgres — the web push
-- endpoint for notifications, and the Edge Function that formats the
-- sheet for WhatsApp. pg_net makes the outbound HTTP call.
create extension if not exists pg_net;


-- ============================================================
-- One trigger function, used by every table that carries updated_at.
--
-- Written once here rather than per table because there is exactly one
-- rule — the row was touched, so stamp it — and thirty-odd tables that
-- need it. search_path is pinned empty so the function cannot be
-- redirected by a caller's path; now() still resolves because
-- pg_catalog is always searched.
-- ============================================================

create or replace function touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function touch_updated_at() is
  'Sets updated_at to now() on every UPDATE. Attached by a before-update trigger to each editable table.';
