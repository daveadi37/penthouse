-- ============================================================
-- Everything Supabase provides that plain Postgres does not.
--
-- Loaded before deploy-all.sql so the migrations run unmodified against
-- a throwaway database. The point is not that the SQL parses — the
-- checker already covers that without a database. The point is that it
-- RUNS: enums compared against cast text, plpgsql locals shadowing
-- columns of the same name, a trigger that fires on the seed. The last
-- time this harness ran it caught four such bugs that reading had not.
--
-- Two traps this file exists to avoid, both of which make a broken
-- policy look like it works:
--   * a superuser bypasses RLS even under `force row level security`,
--     so the policy tests must run as an unprivileged role;
--   * `set local` outside an explicit transaction is a silent no-op.
-- ============================================================

create schema if not exists auth;
create schema if not exists cron;
create schema if not exists net;
create schema if not exists storage;
create schema if not exists extensions;

-- The three roles every policy is written `to`.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end $$;

-- auth.users, for the foreign key on profiles.auth_user_id.
create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- auth.uid() reads a session setting, so any account can be
-- impersonated. This is what turns "the policies exist" into "the
-- policies do what they claim".
create or replace function auth.uid() returns uuid language sql stable as $fn$
  select nullif(current_setting('test.uid', true), '')::uuid
$fn$;

create or replace function auth.role() returns text language sql stable as $fn$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated')
$fn$;

-- pg_cron and pg_net: recorded rather than performed, so the calls that
-- schedule them are still exercised and what they scheduled can be read
-- back and checked.
create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text,
  command text
);

create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql as $fn$
declare id bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update
    set schedule = excluded.schedule, command = excluded.command
  returning jobid into id;
  return id;
end $fn$;

create table if not exists net.http_request (
  id bigserial primary key,
  url text,
  body jsonb
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb,
  timeout_milliseconds int default 5000
) returns bigint language plpgsql as $fn$
declare new_id bigint;
begin
  insert into net.http_request (url, body) values (url, body) returning id into new_id;
  return new_id;
end $fn$;

-- storage, enough for the bucket insert and the object policies.
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);

-- The path helpers the storage policies are written against. Supabase
-- supplies these; plain Postgres does not, and without them the policy
-- block fails with undefined_function — which its exception handler
-- does not catch, because it only catches insufficient_privilege.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $fn$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end $fn$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $fn$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[array_length(parts, 1)];
end $fn$;

create or replace function storage.extension(name text) returns text
language plpgsql immutable as $fn$
declare parts text[];
begin
  parts := string_to_array(storage.filename(name), '.');
  return parts[array_length(parts, 1)];
end $fn$;
