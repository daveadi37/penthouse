-- ============================================================
--  GENERATED FILE — DO NOT EDIT.
--
--  16 migrations and seed.sql, concatenated in filename order, so
--  the database can be built with one paste into the Supabase SQL
--  editor instead of seventeen.
--
--  Regenerate with:  npm run sql:bundle
--  Source of truth:  supabase/migrations/ and supabase/seed.sql
--
--  If you have the Supabase CLI, do not use this file. Use
--  `supabase db push`, which records what it has already run. This
--  file does not, so running it twice is not the same as running it
--  once — see the note on re-runs below.
--
--  BEFORE RUNNING THIS, in the dashboard:
--    Database → Extensions → enable **pg_cron** and **pg_net**.
--  The first migration creates them, but on a hosted project they may
--  need enabling from the dashboard first. If it fails on either, that
--  is why.
--
--  Re-runs: the migrations are written to be run once. seed.sql is
--  safe to re-run on its own — every insert is ON CONFLICT DO NOTHING.
--  The migrations are not: a second run fails on the first CREATE TYPE
--  that already exists. That failure is loud and harmless.
-- ============================================================


-- ============================================================
-- 20260828000100_extensions.sql
-- ============================================================

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

-- ============================================================
-- 20260828000200_enums.sql
-- ============================================================

-- ============================================================
-- The fixed vocabularies.
--
-- Every closed union in src/types/index.ts and src/types/prayer.ts
-- becomes a Postgres enum here. The point is that the database refuses
-- a value the app could never have produced — a sheet cannot be
-- 'sent', an issue cannot be 'pending', a break is served or it is not.
--
-- Two conventions, both deliberate:
--
--   The type names are snake_case with no prefix. app_role rather than
--   role, because role collides with Postgres's own vocabulary.
--
--   The VALUES are the TypeScript string literals character for
--   character — 'areaDeep', 'Changes requested', 'in_progress'. They
--   are not tidied into snake_case. The adapter
--   that replaces the local store reads and writes these strings
--   directly, so a rename here would mean a translation layer in the
--   app, and a translation layer is where drift starts.
-- ============================================================

-- ---------- the spine ----------

-- One zone. The office side was dropped on 2026-08-28. It stays an enum
-- of one rather than disappearing, because thirty tables carry the
-- column and a second premises would otherwise be a thirty-table
-- migration instead of one ALTER TYPE.
create type zone as enum ('household');

-- There is deliberately no app_role enum. Roles are rows in the roles
-- table, because admins and owners create and edit the hierarchy at
-- runtime, and a role you can invent on a Tuesday cannot be a type that
-- only changes on a deployment. What is fixed is the capability list —
-- see the capability enum below, and has_capability() in
-- 20260828000300_identity_premises.sql.

create type staff_role as enum (
  'housekeeping',
  'cooking',
  'cook',
  'priestcare',
  'driver',
  'maintenance',
  'any'
);

-- The fixed vocabulary of powers. A role is composed from these; it
-- cannot invent one, because every value here corresponds to a policy
-- that has been written. Adding a capability is a migration and a code
-- change together, which is the correct amount of friction.
create type capability as enum (
  'day.view',
  'day.tick',
  'day.assign',
  'library.edit',
  'sheet.view',
  'sheet.edit',
  'sheet.check',
  'sheet.post',
  'issue.raise',
  'issue.viewAll',
  'issue.manage',
  'inventory.view',
  'inventory.edit',
  'cooking.view',
  'cooking.edit',
  'cooking.approve',
  'money.view',
  'money.viewOwner',
  'property.view',
  'property.edit',
  'register.view',
  'register.edit',
  'people.view',
  'people.manage',
  'occasions.view',
  'occasions.edit',
  'shrine.view',
  'shrine.log',
  'documents.view',
  'documents.viewOwner',
  'settings.edit',
  'roles.manage',
  'accounts.manage',
  'audit.view'
);

-- ---------- premises ----------

create type area_type as enum (
  'bedroom',
  'bathroom',
  'kitchen',
  'living',
  'shrine',
  'prayer',
  'utility',
  'storage',
  'outdoor',
  'circulation'
);

create type area_status as enum ('occupied', 'guest', 'unused', 'active');

-- High-use bathrooms get an extra midday pass; low-use rooms do not.
create type area_use as enum ('high', 'low');

-- ---------- work ----------

create type freq as enum (
  'daily',
  'weekly',
  'fortnightly',
  'monthly',
  'areaDeep',
  'weekdays'
);

create type apply_scope as enum ('global', 'areaType', 'area', 'zone');

-- Generated categories. A category with one of these is filled by the
-- system rather than hand-listed in the library.
create type category_system as enum ('laundry', 'cooking', 'occasion', 'plants', 'contracts');

create type task_source as enum (
  'library',
  'adhoc',
  'occasion',
  'plant',
  'contract',
  'meal',
  'laundry'
);

-- ---------- schedule ----------

create type appointment_kind as enum (
  'vendor',
  'meeting',
  'personal',
  'school',
  'delivery',
  'medical',
  'other'
);

create type absence_type as enum (
  'Day off',
  'Annual leave',
  'Sick',
  'Unpaid',
  'Public holiday'
);

-- ---------- issues and incidents ----------

create type issue_kind as enum ('fault', 'condition', 'request', 'supply');

create type issue_priority as enum ('urgent', 'high', 'normal', 'low');

-- The order below is the order the app walks the issue through.
create type issue_status as enum (
  'reported',
  'acknowledged',
  'assigned',
  'in_progress',
  'awaiting_vendor',
  'resolved',
  'closed'
);

create type incident_type as enum (
  'Damage',
  'Injury',
  'Security',
  'Water',
  'Electrical',
  'Fire',
  'Other'
);

-- ---------- supplies ----------

create type movement_reason as enum (
  'count',
  'used',
  'purchased',
  'wasted',
  'transferred',
  'adjustment'
);

create type shopping_status as enum ('needed', 'ordered', 'purchased');

-- ---------- kitchen ----------

create type meal_type as enum ('Breakfast', 'Lunch', 'Dinner');

create type meal_status as enum (
  'Draft',
  'Submitted',
  'Changes requested',
  'Approved',
  'Prepared',
  'Completed'
);

create type leftovers as enum ('None', 'Small amount', 'Planned leftovers');

-- ---------- property ----------

create type asset_cat as enum (
  'Appliances',
  'Electronics',
  'Furniture',
  'Outdoor',
  'Lighting',
  'Soft furnishings',
  'Artwork',
  'Kitchen equipment',
  'Cleaning equipment',
  'Fixtures',
  'Other'
);

-- Salik is the Dubai road toll. It is its own line because it arrives
-- as its own statement.
create type vehicle_log_type as enum (
  'Fuel',
  'Service',
  'Repair',
  'Fine',
  'Toll',
  'Salik',
  'Other'
);

create type contract_cat as enum (
  'AC',
  'Water tank',
  'Pest control',
  'Pool',
  'Lift',
  'Fire safety',
  'Generator',
  'Cleaning',
  'Windows',
  'IT',
  'Other'
);

-- ---------- people and access ----------

create type contact_cat as enum (
  'Emergency',
  'Building',
  'Medical',
  'Family',
  'School',
  'Vet',
  'Government',
  'Other'
);

create type vendor_cat as enum (
  'Cleaning',
  'Rugs',
  'Upholstery',
  'Pest control',
  'AC',
  'Plumbing',
  'Electrical',
  'Pool',
  'Handyman',
  'Appliances',
  'IT',
  'Stationery',
  'Grocery',
  'Laundry',
  'Vehicle',
  'Other'
);

create type delivery_status as enum ('received', 'collected', 'returned');

create type credential_kind as enum ('Key', 'Fob', 'Code', 'Remote', 'Card');

-- ---------- money ----------

create type expense_kind as enum (
  'household',
  'staff',
  'vehicle',
  'maintenance',
  'supplies',
  'utilities',
  'other'
);

-- Who may read a figure. 'manager' means everyone from manager upward;
-- 'owner' means Shrien and Aditya only.
create type visibility as enum ('owner', 'manager');

create type payment_method as enum (
  'Card',
  'Bank transfer',
  'Cash',
  'Petty cash',
  'Direct debit',
  'Cheque'
);

-- What a transaction can be pinned to. Deliberately narrower than
-- document_link_type — you cannot bill a transaction to a transaction.
create type transaction_link_type as enum (
  'issue',
  'asset',
  'vehicle',
  'contract',
  'shopping',
  'staff'
);

create type charge_kind as enum ('bill', 'subscription');

create type charge_cadence as enum ('monthly', 'quarterly', 'biannual', 'annual', 'weekly');

-- 'float' is money handed out, 'spend' is money used, 'return' is what
-- came back. The three together have to reconcile.
create type petty_direction as enum ('float', 'spend', 'return');

create type doc_cat as enum (
  'Tenancy',
  'Insurance',
  'Warranty',
  'Permit',
  'Visa',
  'Passport',
  'Contract',
  'Manual',
  'Invoice',
  'Receipt',
  'Certificate',
  'Payslip',
  'Other'
);

create type document_link_type as enum (
  'asset',
  'vehicle',
  'contract',
  'staff',
  'issue',
  'transaction'
);

-- ---------- employment ----------

-- 'derived' means the hours came from the shift pattern rather than
-- from someone clocking in, and should be treated as an assumption.
create type attendance_source as enum ('manual', 'derived');

create type leave_status as enum ('requested', 'approved', 'declined', 'taken');

-- ---------- occasions ----------

create type offset_unit as enum ('days', 'hours', 'minutes');

create type offset_direction as enum ('before', 'after');

create type occasion_status as enum ('planned', 'active', 'complete', 'cancelled');

create type occasion_kind as enum ('guest', 'event');

-- A vacation task belongs to one of three runs: before leaving, while
-- away, after coming back.
create type vacation_phase as enum ('pre', 'during', 'post');

-- ---------- notifications ----------

create type notif_kind as enum (
  'day_ready',
  'task_assigned',
  'task_reminder',
  'issue_raised',
  'issue_update',
  'meal_approval',
  'stock_low',
  'bill_due',
  'expiry',
  'coverage_gap',
  'delivery',
  'incident'
);

-- The class is what a person switches off. Nobody mutes 'assigned'
-- work in practice, but they do mute reminders.
create type notif_class as enum ('assigned', 'reminder', 'escalation', 'response');

-- ---------- the running sheet ----------

-- 'draft' while it is being filled in, 'checked' once Earl has read
-- it, 'posted' once it has gone to the group. The step from checked to
-- posted is the one the footer rule guards.
create type sheet_status as enum ('draft', 'checked', 'posted');

-- The shopping list's in-stock column. 'unknown' is the honest default
-- — nobody has looked yet — and is not the same as 'no'.
create type stock_state as enum ('yes', 'no', 'partial', 'unknown');

create type divo_action as enum ('lit', 'topped', 'checked', 'extinguished');

create type oil_level as enum ('full', 'half', 'low', 'empty');

-- The two photographs that go on the group each night.
create type sheet_photo_kind as enum ('setup', 'clearup');

-- ============================================================
-- 20260828000300_identity_premises.sql
-- ============================================================

-- ============================================================
-- People, powers and place. The tables everything else points at.
--
-- roles and role_capabilities are the hierarchy, and they are rows
-- rather than an enum because admins and owners edit the hierarchy from
-- inside the app. has_capability() is the function every policy in
-- 20260828001400_rls.sql calls, so 'what may this person do' is asked
-- and answered in exactly one place.
--
-- profiles is every person the app knows — Rosie, Reza, Marvin, the two
-- cooks, Earl, Aditya, Shrien, Salyna, the household and the priests.
-- areas is the rooms of apartment 3808. settings is one row, and it
-- carries the lines printed on the running sheet: the address, the
-- WhatsApp group, the 09:00 post-by time and Earl's name.
--
-- Three conventions that hold for the whole schema and are stated once
-- here rather than repeated in every file:
--
--   The TypeScript Stamp type is epoch milliseconds. It becomes
--   timestamptz. A moment in time is a moment in time, and the adapter
--   converts at the boundary; storing a bigint would mean the database
--   could not answer a question about a date range.
--
--   Anything the app calls `order` becomes `sort_order`. ORDER is
--   reserved in Postgres.
--
--   A profile is never deleted, only deactivated — so foreign keys that
--   name the person responsible for a record use ON DELETE RESTRICT,
--   and keys that merely assign work use ON DELETE SET NULL.
-- ============================================================


-- ---------- roles ----------

-- Text primary key, and the seeded ids are words: owner, admin,
-- manager, staff, helper, family. A role invented later gets a
-- slugified id from its name. Ids are stable because profiles.role
-- points at them and the seed data names them.
create table roles (
  id text primary key,
  name text not null,
  -- Higher outranks lower. This is the whole hierarchy: a role may only
  -- be granted, edited or deleted by somebody who outranks it, which is
  -- what stops whoever holds roles.manage from promoting themselves.
  rank smallint not null,
  description text not null default '',
  -- People in this role do the work: tasks route to them, they appear on
  -- the rota and on the running sheet. An owner who also cooks is still
  -- not staff.
  works boolean not null default false,
  -- Seeded roles cannot be deleted, because the seed data and the
  -- policies below both name them. Their capabilities stay editable.
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_rank_range check (rank between 1 and 100)
);

comment on table roles is 'The hierarchy, as rows. Editable at runtime by anyone holding roles.manage, within the limit of their own rank.';
comment on column roles.rank is 'Higher outranks lower. A role may only be granted by somebody at or above its rank.';
comment on column roles.works is 'Whether work routes to people in this role. Read by the day builder in place of a hardcoded ''staff''.';
comment on column roles.is_system is 'Seeded roles. Deletable never, editable yes.';

create trigger roles_touch before update on roles
  for each row execute function touch_updated_at();


-- What each role may do. A join table rather than an array column
-- because policies read it constantly and an index on a join table is
-- worth more than the tidiness of one row per role.
create table role_capabilities (
  role_id text not null references roles (id) on delete cascade,
  capability capability not null,
  primary key (role_id, capability)
);

comment on table role_capabilities is 'The capability grid. Every row is a power one role holds; the absence of a row is a refusal, not a hidden menu.';

create index role_capabilities_cap_idx on role_capabilities (capability);


-- ---------- profiles ----------

-- Text primary key, not uuid. The app hardcodes these ids: the store
-- defaults to 'p-earl', Cooking.tsx routes meal approvals to Earl by id,
-- and the laundry rota names 'p-rosie', 'p-reza' and 'p-marvin'
-- directly. Those are not seed rows that can be regenerated — they are
-- constants in the source, so the id has to survive a rebuild.
create table profiles (
  id text primary key,
  -- Links a profile to a Supabase auth user. Making a row here does not
  -- create a way to sign in; the invite does, and this column is what
  -- joins the two. Null for the priests and for anyone who never logs in.
  auth_user_id uuid unique,
  name text not null,
  -- A reference, not an enum. RESTRICT rather than CASCADE: deleting a
  -- role that somebody still holds should fail loudly, not silently
  -- take their account with it.
  role text not null references roles (id) on delete restrict,
  -- Only meaningful for roles marked works.
  staff_roles staff_role[] not null default '{}',
  email text not null default '',
  phone text not null default '',
  initials text not null,
  active boolean not null default true,
  -- Whether this person has a login at all. The two cooks and the
  -- priests are on every sheet and never open the app.
  can_sign_in boolean not null default false,
  -- Household members appear in the laundry rota and the meal portions.
  is_household_member boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Every person the app knows — the staff, the two cooks, Earl, Aditya, Shrien, Salyna, the household and the priests. Deactivated, never deleted.';
comment on column profiles.id is 'Stable text id. Hardcoded in the app source (p-earl, p-rosie, p-reza, p-marvin), so it must not be regenerated.';
comment on column profiles.auth_user_id is 'The Supabase auth user this profile signs in as. Null for people with no login. Set by the admin-users Edge Function, never from the browser.';
comment on column profiles.staff_roles is 'What this person is for. Drives auto-routing of work. Empty for anyone whose role is not marked works.';
comment on column profiles.can_sign_in is 'Whether a login exists or is intended. False for the cooks and the priests.';
comment on column profiles.initials is 'Two letters, shown on the avatar chip where there is no room for a name.';

create index profiles_role_idx on profiles (role) where active;
create index profiles_active_idx on profiles (active);

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();


-- ---------- areas ----------

-- Text primary key for the same reason as profiles: library tasks are
-- written against 'a-sh1' (the shrine) and 'a-pr1' (the prayer area),
-- and the seeded library would have to be rewritten if these were
-- regenerated on every rebuild.
create table areas (
  id text primary key,
  name text not null,
  type area_type not null,
  zone zone not null,
  floor text not null default '',
  status area_status not null,
  -- Deep-clean cycle in days. 0 means the room is not on a cycle at all.
  deep_freq smallint not null default 0,
  -- Day of week the deep clean falls on, 0 = Sunday.
  deep_dow smallint not null default 0,
  -- Fortnightly rooms alternate on this. Measured from settings.parity_epoch.
  parity smallint not null default 0,
  -- High-use bathrooms get an extra midday pass. Null means normal use.
  use_level area_use,
  -- What "done" looks like in this room, in the words the staff read.
  standard text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_deep_freq_allowed check (deep_freq in (0, 7, 14, 30)),
  constraint areas_deep_dow_range check (deep_dow between 0 and 6),
  constraint areas_parity_binary check (parity in (0, 1))
);

comment on table areas is 'The rooms of apartment 3808. The shrine and the prayer area are areas like any other, so work can be scheduled against them.';
comment on column areas.id is 'Stable text id. The seeded task library references a-sh1 and a-pr1 by name.';
comment on column areas.deep_freq is '0 = not on a deep-clean cycle, 7 = weekly, 14 = fortnightly, 30 = monthly.';
comment on column areas.parity is 'Which half of the fortnight a fortnightly room falls in. Counted from settings.parity_epoch.';
comment on column areas.use_level is 'High-use bathrooms get an extra midday pass. Null for normal use.';

create index areas_zone_idx on areas (zone) where active;
create index areas_type_idx on areas (type);

create trigger areas_touch before update on areas
  for each row execute function touch_updated_at();


-- ---------- settings ----------

-- One row, forever. The boolean primary key with a check that it is
-- true is the standard way to say so in Postgres: a second row cannot
-- be inserted because there is no second value.
create table settings (
  id boolean primary key default true,
  house text not null,
  -- Printed at the top of every running sheet.
  address text not null,
  -- Where the sheet is posted each morning.
  whatsapp_group text not null,
  -- The sheet is late after this. The documents say 09:00.
  sheet_post_by time not null default '09:00',
  -- Fixed on the printed sheet. Earl checks it before it goes out.
  checked_by_name text not null,
  currency text not null default 'AED',
  locale text not null default 'en-GB',
  -- Meal name to serve time, e.g. {"Dinner": "20:30"}. A map rather than
  -- a table because it is a handful of pairs read as a whole and never
  -- queried across.
  meal_times jsonb not null default '{}'::jsonb,
  portion_default smallint not null default 4,
  -- The working week: which days the cooks and the deliveries keep to,
  -- and the window on those days. The prayers keep to none of it, which
  -- is why the sheet runs seven days a week.
  working_days smallint[] not null default '{}',
  working_start time not null default '09:00',
  working_end time not null default '18:00',
  -- The observance that owns the running sheet. Outside these dates the
  -- app opens on Today instead, and the food rule stops biting.
  observance_from date,
  observance_to date,
  -- How many days ahead a visa, warranty or contract expiry starts warning.
  alert_lead_days smallint not null default 30,
  -- The named stages a load moves through. Ordered.
  laundry_stages text[] not null default '{}',
  -- Days of the week the unused rooms fall to a reduced schedule.
  unused_dows smallint[] not null default '{}',
  -- The window the day plan is laid out across.
  plan_start time not null default '06:00',
  plan_end time not null default '22:00',
  -- Fortnightly parity is measured from here.
  parity_epoch date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_single_row check (id),
  constraint settings_plan_window check (plan_end > plan_start),
  constraint settings_working_window check (working_end > working_start),
  constraint settings_observance_order check (observance_to is null or observance_from is null or observance_to >= observance_from)
);

comment on table settings is 'One row. Carries the house identity and the lines printed on the running sheet — the address, the 3808 Home group, the 09:00 post-by time and Earl''s name.';
comment on column settings.id is 'Always true. The check constraint is what makes this table a singleton.';
comment on column settings.sheet_post_by is 'The sheet is late after this time. R4 in the spec.';
comment on column settings.checked_by_name is 'A name, not a profile id, because it is a printed line on the page.';
comment on column settings.meal_times is 'Meal name to serve time. Read whole, never queried across, so a map and not a table.';
comment on column settings.parity_epoch is 'Day zero for fortnightly parity. Move it and every fortnightly room flips.';
comment on column settings.observance_from is 'First day of the observance. The running sheet is the front of the app between these dates and a record outside them.';

create trigger settings_touch before update on settings
  for each row execute function touch_updated_at();


-- ============================================================
-- The one question the whole security model asks.
--
-- Every policy in 20260828001400_rls.sql is written in terms of this
-- function, and nothing else. That matters for two reasons: a
-- capability is defined once rather than spelled out in forty policies,
-- and a role invented next month works everywhere the moment its
-- capability rows exist, with no policy to remember to update.
--
-- SECURITY DEFINER because a caller must be able to ask 'may I read
-- profiles' without already being able to read profiles — otherwise the
-- lookup is itself blocked by the policy it is meant to answer.
-- search_path is pinned so the definer rights cannot be pointed at a
-- attacker-supplied schema.
-- ============================================================

create or replace function has_capability(cap capability) returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from profiles p
    join roles r on r.id = p.role and r.active
    join role_capabilities rc on rc.role_id = r.id
    where p.auth_user_id = auth.uid()
      and p.active
      and rc.capability = cap
  );
$$;

comment on function has_capability(capability) is
  'True when the signed-in account holds this capability through its role. The single predicate every RLS policy is written against.';


-- Who am I, as a profile id. Used by the policies that let somebody
-- read their own row and nobody else's.
create or replace function my_profile_id() returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select id from profiles where auth_user_id = auth.uid() and active limit 1;
$$;

comment on function my_profile_id() is 'The signed-in account''s profile id, or null. Lets a policy say "their own row" without a join.';


-- My rank in the hierarchy. The guard on granting roles: you cannot
-- hand out a role that stands at or above where you stand.
create or replace function my_rank() returns smallint
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(max(r.rank), 0)::smallint
  from profiles p
  join roles r on r.id = p.role and r.active
  where p.auth_user_id = auth.uid() and p.active;
$$;

comment on function my_rank() is 'The signed-in account''s rank. Used to stop a manager minting themselves an owner.';

-- ============================================================
-- 20260828000400_work_schedule.sql
-- ============================================================

-- ============================================================
-- The everyday work, and the shape of the week.
--
-- Two halves. The library is what should happen — written once, per
-- room or per room type, with a frequency. task_instances is what
-- actually happened on a given date, materialised from the library each
-- morning and then freely moved, reassigned and ticked. The two are
-- separate on purpose: editing a library task must not rewrite
-- yesterday's record of who did what.
--
-- The rest is the calendar the work has to fit around — appointments,
-- shift patterns, absences, and who covers a role when its holder is off.
-- ============================================================


-- ---------- task categories ----------

-- Text primary key. The store builds ad-hoc tasks against 'c-household'
-- and Cooking.tsx reads 'c-laundry' by name, so these ids are constants
-- in the source and not regenerable seed values.
create table task_categories (
  id text primary key,
  name text not null,
  icon text not null default '',
  sort_order integer not null default 0,
  -- 'any' means the category is not tied to a zone at all.
  zone text not null default 'any',
  -- Set where the category is filled by the system rather than by hand.
  system category_system,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_categories_zone_allowed check (zone in ('household', 'any'))
);

comment on table task_categories is 'How the day is grouped on screen — bedrooms, bathrooms, kitchen, laundry, close-down and the rest.';
comment on column task_categories.id is 'Stable text id. The app names c-household and c-laundry in source.';
comment on column task_categories.zone is 'A zone, or the literal ''any''. Text with a check rather than the zone enum, because ''any'' is not a zone.';
comment on column task_categories.system is 'Non-null where the category is generated — laundry, cooking, occasions, plants, contracts.';

create index task_categories_zone_idx on task_categories (zone) where active;

create trigger task_categories_touch before update on task_categories
  for each row execute function touch_updated_at();


-- ---------- the library ----------

-- Text primary key. Task instances carry library_id forward for months,
-- and the seeded library is referenced by id from the procedures and the
-- occasion templates.
create table library_tasks (
  id text primary key,
  category_id text not null references task_categories (id) on delete restrict,
  text text not null,
  apply apply_scope not null,
  -- Set when apply = 'areaType'.
  area_type area_type,
  -- Set when apply = 'area'.
  area_id text references areas (id) on delete cascade,
  zone text not null default 'any',
  freq freq not null,
  -- Day of week for weekly and fortnightly tasks, 0 = Sunday.
  dow smallint not null default 0,
  parity smallint not null default 0,
  instructions text not null default '',
  -- Auto-routing: whoever holds this staff role and is working today.
  role staff_role not null default 'any',
  -- Optional clock time, inherited by the instance and freely moved.
  default_time time,
  est_minutes smallint not null default 10,
  -- Instances sharing a group_as string are shown as one block.
  group_as text not null default '',
  -- Light tasks still run on a reduced schedule in unused rooms.
  light boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_tasks_zone_allowed check (zone in ('household', 'any')),
  constraint library_tasks_dow_range check (dow between 0 and 6),
  constraint library_tasks_parity_binary check (parity in (0, 1)),
  -- The scope has to agree with which target is filled in. A task
  -- scoped to one area with no area named would silently never appear.
  constraint library_tasks_scope_target check (
    (apply = 'area' and area_id is not null)
    or (apply = 'areaType' and area_type is not null)
    or (apply in ('global', 'zone'))
  )
);

comment on table library_tasks is 'What should happen, written once. The day builder reads this and materialises task_instances from it.';
comment on column library_tasks.id is 'Stable text id. Instances keep it as library_id for months after the fact.';
comment on column library_tasks.area_id is 'Cascades: a task written for one specific room has no meaning once that room is gone.';
comment on column library_tasks.apply is 'How wide the task reaches — everywhere, one zone, one type of room, or one named room.';
comment on column library_tasks.role is 'The staff role this routes to. ''any'' means whoever is free.';
comment on column library_tasks.light is 'A light task keeps running in a room marked unused, at reduced frequency.';


create index library_tasks_category_idx on library_tasks (category_id) where active;
create index library_tasks_area_idx on library_tasks (area_id);
create index library_tasks_freq_idx on library_tasks (freq) where active;
create index library_tasks_role_idx on library_tasks (role);

create trigger library_tasks_touch before update on library_tasks
  for each row execute function touch_updated_at();


-- ---------- the materialised day ----------

create table task_instances (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  -- Set null, not cascade. A library task can be retired or rewritten
  -- at any time; the record that someone cleaned the shrine on the 9th
  -- day of the Prayer must survive that.
  library_id text references library_tasks (id) on delete set null,
  category_id text not null references task_categories (id) on delete restrict,
  title text not null,
  instructions text,
  -- Set null, not cascade. If a room is deleted the work that was done
  -- in it must not vanish from the record along with it — the row stays,
  -- and area_name below is what it still prints.
  area_id text references areas (id) on delete set null,
  -- The room's name as it was on the day. Kept alongside area_id so the
  -- row still reads correctly after the area is renamed or removed.
  area_name text,
  zone zone not null,
  role staff_role not null default 'any',
  assigned_to text references profiles (id) on delete set null,
  scheduled_at time,
  est_minutes smallint not null default 10,
  group_as text,
  done boolean not null default false,
  done_by text references profiles (id) on delete set null,
  done_at timestamptz,
  note text,
  source task_source not null default 'library',
  -- Free reference back to whatever generated it — a meal id, a plant
  -- id, a contract id. Not a foreign key, because the target table
  -- varies by source.
  source_ref text,
  -- Off means it fell on the assignee's day off and is not counted
  -- against them in the completion figures.
  off boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A tick has to say who and when. Half a tick is worse than none.
  constraint task_instances_done_attributed check (
    done = false or (done_by is not null and done_at is not null)
  )
);

comment on table task_instances is 'What actually happened on a date. Built from the library each morning, then moved, reassigned and ticked. This is the historical record.';
comment on column task_instances.library_id is 'Where it came from, if it came from the library. Set null on delete so history survives a library edit.';
comment on column task_instances.area_id is 'Set null on delete, deliberately — the work still happened. area_name keeps it readable.';
comment on column task_instances.area_name is 'The room name as printed on the day, so the row reads correctly after a rename.';
comment on column task_instances.source_ref is 'Free reference to the generator — a meal, a plant, a contract. Not a foreign key: the target table varies.';
comment on column task_instances.off is 'Fell on the assignee''s day off. Shown, but not counted against them.';

create index task_instances_date_idx on task_instances (date);
create index task_instances_date_assignee_idx on task_instances (date, assigned_to);
create index task_instances_library_idx on task_instances (library_id);
create index task_instances_category_idx on task_instances (category_id);
create index task_instances_area_idx on task_instances (area_id);
create index task_instances_assigned_idx on task_instances (assigned_to);
create index task_instances_done_by_idx on task_instances (done_by);
create index task_instances_open_idx on task_instances (date) where not done;

create trigger task_instances_touch before update on task_instances
  for each row execute function touch_updated_at();


-- ---------- procedures ----------

create table procedures (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '',
  zone text not null default 'any',
  purpose text not null default '',
  -- Free text, e.g. 'Every morning', 'Fortnightly'. Not the freq enum,
  -- because a procedure describes rather than schedules.
  frequency text not null default '',
  supplies text not null default '',
  -- Ordered. The array is the document; nothing queries a single step.
  steps text[] not null default '{}',
  standard text not null default '',
  watch_for text not null default '',
  role staff_role not null default 'any',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint procedures_zone_allowed check (zone in ('household', 'any'))
);

comment on table procedures is 'The written method for a job — purpose, supplies, steps, what done looks like, what to watch for. Read by staff, not executed by the app.';
comment on column procedures.steps is 'Ordered steps. An array because the whole list is the document; no query ever wants one step.';
comment on column procedures.frequency is 'Free text description, not a schedule. The library schedules; this explains.';
comment on column procedures.version is 'Bumped by hand when the method changes, so a printed copy can be checked against the current one.';

create index procedures_role_idx on procedures (role);
create index procedures_zone_idx on procedures (zone);

create trigger procedures_touch before update on procedures
  for each row execute function touch_updated_at();


-- ---------- appointments ----------

create table appointments (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  title text not null,
  kind appointment_kind not null default 'other',
  zone zone not null,
  area_id text references areas (id) on delete set null,
  -- Foreign key added in 20260828000900_people_access.sql, where
  -- vendors is created.
  vendor_id uuid,
  -- Staff member who must be present or prepare for it.
  assigned_to text references profiles (id) on delete set null,
  attendees text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_window check (end_time >= start_time)
);

comment on table appointments is 'Anything with a time and a door — vendor visits, meetings, school runs, deliveries, medical.';
comment on column appointments.vendor_id is 'The vendor attending. Foreign key added later in the sequence, once vendors exists.';
comment on column appointments.assigned_to is 'Who has to be there or prepare for it. Set null on delete: the appointment stands.';

create index appointments_date_idx on appointments (date);
create index appointments_area_idx on appointments (area_id);
create index appointments_vendor_idx on appointments (vendor_id);
create index appointments_assigned_idx on appointments (assigned_to);

create trigger appointments_touch before update on appointments
  for each row execute function touch_updated_at();


-- ---------- shifts ----------

create table shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  -- Days of week worked, 0 = Sunday.
  days smallint[] not null default '{}',
  start_time time not null,
  end_time time not null,
  -- The one day a week they are off. 0 = Sunday.
  day_off smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_day_off_range check (day_off between 0 and 6)
);

comment on table shifts is 'The standing pattern — which days, which hours, which day off. Reza is 14:00 to 22:00; Jagdishbhai is 15:00 to 17:00.';
comment on column shifts.staff_id is 'Cascades: a shift pattern is part of the person''s setup and has no life without them.';
comment on column shifts.days is 'Days of week worked, 0 = Sunday.';
comment on column shifts.end_time is 'May be earlier than start_time for a shift that crosses midnight, so no window check here.';

create index shifts_staff_idx on shifts (staff_id);

create trigger shifts_touch before update on shifts
  for each row execute function touch_updated_at();


-- ---------- absences ----------

create table absences (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  type absence_type not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint absences_range check (to_date >= from_date)
);

comment on table absences is 'Days somebody is not here. The day builder marks their tasks off rather than assigning them.';
comment on column absences.staff_id is 'Cascades with the person. Leave that must outlive the profile is in leave_requests, not here.';

create index absences_staff_idx on absences (staff_id);
create index absences_range_idx on absences (from_date, to_date);

create trigger absences_touch before update on absences
  for each row execute function touch_updated_at();


-- ---------- coverage rules ----------

create table coverage_rules (
  id uuid primary key default gen_random_uuid(),
  role staff_role not null,
  zone text not null default 'any',
  -- Restrict, not set null. A coverage rule with nobody covering is a
  -- silent gap, which is the exact failure the rule exists to prevent.
  cover_staff_id text not null references profiles (id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coverage_rules_zone_allowed check (zone in ('household', 'any'))
);

comment on table coverage_rules is 'Who picks up a role when its holder is off. The cook''s work falls to Rosie; the priests'' care falls to Earl.';
comment on column coverage_rules.cover_staff_id is 'Restrict on delete: a rule pointing at nobody is a coverage gap that nothing would flag.';

create index coverage_rules_role_idx on coverage_rules (role);
create index coverage_rules_cover_idx on coverage_rules (cover_staff_id);

create trigger coverage_rules_touch before update on coverage_rules
  for each row execute function touch_updated_at();

-- ============================================================
-- 20260828000500_running_sheet.sql
-- ============================================================

-- ============================================================
-- The daily prayer running sheet. The spine of the product.
--
-- One printed page per date, posted to the 3808 Home WhatsApp group by
-- 09:00. It carries six sections — who is working, the order of the day,
-- the menu, the shopping list, the guests, and thirty-one checks in four
-- groups — plus what happens while the prayers run: the breaks where
-- water goes round, the guest toilet every twenty minutes, and the two
-- photographs that go on the group at the end of the night.
--
-- The six repeating sections are child tables, not jsonb. They are edited
-- row by row by different people during the day, they are ticked
-- individually with a name and a time against each tick, and the whole
-- point of the sheet is that you can ask who did what. None of that
-- survives being a blob.
--
-- The one constraint that matters most is at the bottom of the
-- running_sheets definition. The documents state it more emphatically
-- than anything else on the page:
--
--   "Never send this sheet out with the prayer start time or the number
--    of meals left blank."
--
-- So the database refuses it, not just the form.
-- ============================================================


-- ---------- the sheet ----------

create table running_sheets (
  id uuid primary key default gen_random_uuid(),
  -- Unique. There is one sheet per day and the app stores them keyed by
  -- date; two sheets for the same date would mean two different answers
  -- to what is happening today.
  date date not null unique,
  -- The header line as printed — '9th day of the Prayer'.
  occasion text not null default '',
  -- Which day of the observance this is, where one is running.
  occasion_day_no smallint,
  -- Number of meals to lay. Blank blocks posting.
  meals smallint,
  guests smallint,
  -- Blank blocks posting.
  prayers_start time,
  -- Planned finish, as printed on the sheet.
  prayers_end time,
  -- When they actually finished. This is the figure Marvin needs so the
  -- breads are timed right, and it is not the same as the planned end.
  actual_prayers_end time,
  -- 'Dinner' on the 21 August sheet; the blank template says only 'Menu'.
  sitting text not null default '',
  status sheet_status not null default 'draft',
  -- Names, not profile ids. These two are printed lines on the page, and
  -- the person who prepared it is sometimes not an account holder.
  prepared_by text,
  prepared_at timestamptz,
  checked_by text,
  checked_at timestamptz,
  posted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The footer rule, enforced. A sheet cannot reach 'posted' with the
  -- prayer start time or the meals count blank. Meals must also be above
  -- zero: the app treats 0 as blank, and a sheet claiming no meals on a
  -- prayer day is a data-entry slip, not a fact.
  constraint running_sheets_posted_needs_start_and_meals check (
    status <> 'posted'
    or (prayers_start is not null and meals is not null and meals > 0)
  ),
  -- A posted sheet has to say who prepared it. R23.
  constraint running_sheets_posted_needs_preparer check (
    status <> 'posted' or coalesce(prepared_by, '') <> ''
  ),
  constraint running_sheets_meals_sane check (meals is null or meals >= 0),
  constraint running_sheets_guests_sane check (guests is null or guests >= 0),
  constraint running_sheets_day_no_sane check (occasion_day_no is null or occasion_day_no > 0)
);

comment on table running_sheets is 'One running sheet per date. The header bar, the status, and the prepared-by and checked-by lines. Its six sections are the child tables below.';
comment on column running_sheets.date is 'Unique. One sheet per day, keyed by date exactly as the app stores it.';
comment on column running_sheets.occasion is 'The printed occasion line, e.g. ''9th day of the Prayer''.';
comment on column running_sheets.occasion_day_no is 'Day number within a multi-day observance. Null outside one.';
comment on column running_sheets.meals is 'Meals to lay. Null blocks posting — see running_sheets_posted_needs_start_and_meals.';
comment on column running_sheets.prayers_start is 'Null blocks posting. The documents are emphatic about this one.';
comment on column running_sheets.actual_prayers_end is 'When the prayers really finished, passed to Marvin so the breads are timed right. R22.';
comment on column running_sheets.sitting is 'Which sitting the menu is for — ''Dinner'' on the completed example.';
comment on column running_sheets.prepared_by is 'A name, not a profile id. It is a printed line, and whoever prepared it may not hold an account.';
comment on column running_sheets.checked_by is 'A name, not a profile id. Earl Tiongco on every sheet.';

create index running_sheets_date_idx on running_sheets (date);
create index running_sheets_status_idx on running_sheets (status);
create index running_sheets_unposted_idx on running_sheets (date) where status <> 'posted';

create trigger running_sheets_touch before update on running_sheets
  for each row execute function touch_updated_at();


-- ---------- section 1: who is working today ----------

create table sheet_roster_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  -- Set where the row is a real account. Blank for the Priests and for
  -- one-off helpers, which is why the name below is stored as well.
  person_id text references profiles (id) on delete set null,
  who text not null,
  job text not null default '',
  -- Free text, because the real sheet writes 'Lives in — on duty until
  -- close-down', 'As directed' and '—' as often as it writes clock hours.
  hours text not null default '',
  duties text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_roster_rows is 'Section 1. Who is working today, their job, their hours and what they do — in the words printed on the page.';
comment on column sheet_roster_rows.person_id is 'The account, where there is one. Null for the Priests and one-off helpers; `who` always carries the name.';
comment on column sheet_roster_rows.hours is 'Free text. ''Lives in — on duty until close-down'' is a valid value.';

create index sheet_roster_rows_sheet_idx on sheet_roster_rows (sheet_id, sort_order);
create index sheet_roster_rows_person_idx on sheet_roster_rows (person_id);

create trigger sheet_roster_rows_touch before update on sheet_roster_rows
  for each row execute function touch_updated_at();


-- ---------- section 2: order of the day ----------

create table sheet_order_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  -- Often not a clock time at all. 'Morning', 'By 15:45', 'During
  -- prayers', 'Straight after aarti', 'After the meal' and 'Before bed'
  -- are all real values off the source document.
  time_label text not null,
  -- Optional clock time, used only to place the row on a timeline.
  sort_at time,
  what text not null,
  -- Free text. The sheet writes 'Reza / Aditya / Earl / Rosie'.
  who text not null default '',
  sort_order integer not null default 0,
  done boolean not null default false,
  done_by text references profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sheet_order_rows_done_attributed check (
    done = false or (done_by is not null and done_at is not null)
  )
);

comment on table sheet_order_rows is 'Section 2. The order of the day, from Marvin''s morning shop to the divo check before bed.';
comment on column sheet_order_rows.time_label is 'What is printed in the Time column. Not always a clock time.';
comment on column sheet_order_rows.sort_at is 'Optional clock time for ordering only. Null for ''Morning'', ''During prayers'' and the like.';

create index sheet_order_rows_sheet_idx on sheet_order_rows (sheet_id, sort_order);
create index sheet_order_rows_done_by_idx on sheet_order_rows (done_by);

create trigger sheet_order_rows_touch before update on sheet_order_rows
  for each row execute function touch_updated_at();


-- ---------- section 3: menu ----------

create table sheet_menu_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  dish text not null default '',
  who_makes text not null default '',
  -- Free text, and blank as often as not on the source sheet.
  how_many text not null default '',
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_menu_rows is 'Section 3. Dish, who makes it, how many, notes. The blank template lays six empty rows and they are real rows, so dish may be empty.';
comment on column sheet_menu_rows.how_many is 'Free text, not a number. The source sheet leaves it blank more often than it fills it.';

create index sheet_menu_rows_sheet_idx on sheet_menu_rows (sheet_id, sort_order);

create trigger sheet_menu_rows_touch before update on sheet_menu_rows
  for each row execute function touch_updated_at();


-- ---------- section 4: shopping list ----------

create table sheet_shopping_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  item text not null default '',
  -- Multi-line on the real sheet — '2L low-fat fresh milk' on one line,
  -- '1kg yoghurt' on the next.
  how_much text not null default '',
  inStock stock_state not null default 'unknown',
  who_buys text not null default '',
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_shopping_rows is 'Section 4. The standing rows carry over every day: the daily milk and yoghurt, the divo oil kept two spare, and the flowers, incense, matches and wicks.';
comment on column sheet_shopping_rows.how_much is 'May contain newlines. The source cell holds two quantities on two lines.';
comment on column sheet_shopping_rows."instock" is 'Whether it is in stock. ''unknown'' means nobody has looked, which is not the same as ''no''.';

create index sheet_shopping_rows_sheet_idx on sheet_shopping_rows (sheet_id, sort_order);
create index sheet_shopping_rows_short_idx on sheet_shopping_rows (sheet_id) where inStock <> 'yes';

create trigger sheet_shopping_rows_touch before update on sheet_shopping_rows
  for each row execute function touch_updated_at();


-- ---------- section 5: guests ----------

create table sheet_guest_rows (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  name text not null default '',
  -- Free text. The source sheet uses '-' when nobody knows yet.
  arriving text not null default '',
  -- What they cannot eat, and where they sit.
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_guest_rows is 'Section 5. Who is coming, when, and what they cannot eat. Separate from the occasions `guests` table, which is for people staying in the house.';
comment on column sheet_guest_rows.arriving is 'Free text. ''-'' is what the source sheet writes when the time is not known.';
comment on column sheet_guest_rows.notes is 'Food they cannot eat, and seating. Mama prefers sugar-free tea.';

create index sheet_guest_rows_sheet_idx on sheet_guest_rows (sheet_id, sort_order);

create trigger sheet_guest_rows_touch before update on sheet_guest_rows
  for each row execute function touch_updated_at();


-- ---------- section 6: the thirty-one daily checks ----------

create table sheet_check_groups (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  title text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_check_groups is 'Four groups on every sheet: SHRINE before prayers, PRAYER SET-UP finished by 15:45, THE HOUSE before the first guest, AFTER THE MEAL close-down.';
comment on column sheet_check_groups.title is 'The heading as printed, including the timing clause after the dash.';

create index sheet_check_groups_sheet_idx on sheet_check_groups (sheet_id, sort_order);

create trigger sheet_check_groups_touch before update on sheet_check_groups
  for each row execute function touch_updated_at();


create table sheet_check_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references sheet_check_groups (id) on delete cascade,
  text text not null,
  done boolean not null default false,
  done_by text references profiles (id) on delete set null,
  done_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- R14: tickable, with who ticked and when. A tick with no name against
  -- it tells nobody anything the morning after.
  constraint sheet_check_items_done_attributed check (
    done = false or (done_by is not null and done_at is not null)
  )
);

comment on table sheet_check_items is 'Seven shrine checks, eight prayer set-up, seven house, nine close-down. Thirty-one in all, in the exact order the documents give them.';
comment on column sheet_check_items.text is 'The check as written, e.g. ''Divo lit and topped up — correct oil only''.';
comment on column sheet_check_items.done_by is 'Who ticked it. Required once done is true.';

create index sheet_check_items_group_idx on sheet_check_items (group_id, sort_order);
create index sheet_check_items_done_by_idx on sheet_check_items (done_by);
create index sheet_check_items_outstanding_idx on sheet_check_items (group_id) where not done;

create trigger sheet_check_items_touch before update on sheet_check_items
  for each row execute function touch_updated_at();


-- ---------- what happens while the prayers run ----------

create table prayer_breaks (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- R15. Water goes round at every break, without exception, so this is
  -- recorded rather than assumed.
  water_served boolean not null default false,
  served_by text references profiles (id) on delete set null,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prayer_breaks_window check (ended_at is null or ended_at >= started_at)
);

comment on table prayer_breaks is 'Two or three each day. The prayers run 16:00 to about 19:30 and break in the middle; water is served to everyone at every break.';
comment on column prayer_breaks.water_served is 'R15. Recorded, not assumed — the documents make it a rule for every break.';
comment on column prayer_breaks.ended_at is 'Null while the break is still running.';

create index prayer_breaks_sheet_idx on prayer_breaks (sheet_id, started_at);
create index prayer_breaks_served_by_idx on prayer_breaks (served_by);

create trigger prayer_breaks_touch before update on prayer_breaks
  for each row execute function touch_updated_at();


-- Append-only: a reading taken at a moment, never revised. No
-- updated_at, and no trigger.
create table toilet_checks (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  at timestamptz not null default now(),
  -- Restrict: the value of the record is that it names who looked.
  by_id text not null references profiles (id) on delete restrict,
  clean boolean not null default true,
  restocked boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

comment on table toilet_checks is 'R16. The guest toilet, checked and restocked every twenty minutes while the prayers run. Append-only — a reading is not revised.';
comment on column toilet_checks.by_id is 'Who looked. Restrict on delete, because an unattributed check is worthless.';
comment on column toilet_checks.restocked is 'Whether toilet paper was actually put out, as distinct from whether the room was clean.';

create index toilet_checks_sheet_idx on toilet_checks (sheet_id, at);
create index toilet_checks_by_idx on toilet_checks (by_id);


create table sheet_photos (
  id uuid primary key default gen_random_uuid(),
  sheet_id uuid not null references running_sheets (id) on delete cascade,
  kind sheet_photo_kind not null,
  -- Storage path in the files bucket. May be empty: on the seeded
  -- history the photographs only ever existed in the WhatsApp group.
  path text not null default '',
  at timestamptz not null default now(),
  by_id text not null references profiles (id) on delete restrict,
  -- R18. The photograph existing is not the point; it being on the group
  -- is the point.
  posted_to_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sheet_photos is 'R18. The set-up and clear-up photographs that go on the 3808 Home group before bed.';
comment on column sheet_photos.path is 'Storage path. Empty where the photograph only ever lived in the WhatsApp group.';
comment on column sheet_photos.posted_to_group is 'Whether it actually reached the group. That is the requirement, not the file existing.';

create index sheet_photos_sheet_idx on sheet_photos (sheet_id, kind);
create index sheet_photos_by_idx on sheet_photos (by_id);

create trigger sheet_photos_touch before update on sheet_photos
  for each row execute function touch_updated_at();

-- ============================================================
-- 20260828000600_issues_incidents.sql
-- ============================================================

-- ============================================================
-- Issues, and the incident log.
--
-- One table, not four. A fault ("the tap drips"), a condition flag
-- ("the shrine cloth is fraying"), a request ("can we have a second
-- kettle") and a supply request ("we are out of divo oil") are the same
-- object with a different `kind`: something is wrong or wanted,
-- somebody said so, somebody has to decide, and it moves through the
-- same seven statuses. Four tables would mean four status flows, four
-- notification paths and four screens that drift apart.
--
-- This was flagged at the time as one of the three contestable calls in
-- the build plan. It is still the right one, and the discriminator is
-- what keeps it honest: kind is not cosmetic, it decides which fields
-- are required and who gets told.
--
-- The incident log is separate and is not an issue. An issue is work.
-- An incident is a thing that happened — a burn, a leak, a stranger at
-- the door — and it is written once, in the past tense, and never
-- reopened. Different lifecycle, different table.
-- ============================================================


-- ---------- issues ----------

create table issues (
  id uuid primary key default gen_random_uuid(),
  kind issue_kind not null,
  title text not null,
  detail text not null default '',
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  priority issue_priority not null default 'normal',
  status issue_status not null default 'reported',
  -- Whoever said so. RESTRICT: an unattributed fault is a rumour.
  reported_by text not null references profiles (id) on delete restrict,
  reported_at timestamptz not null default now(),
  -- Whoever has to do something about it. SET NULL, because reassigning
  -- work when somebody leaves is normal and losing the fault is not.
  assigned_to text references profiles (id) on delete set null,
  vendor_id uuid,
  asset_id uuid,
  cost numeric(12, 2),
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A supply request that does not say what is needed is not a request.
  constraint issues_supply_needs_detail
    check (kind <> 'supply' or length(trim(detail)) > 0),

  -- Resolved means resolved: the two fields move together or not at all.
  constraint issues_resolution_complete
    check (
      (status in ('resolved', 'closed') and resolved_at is not null)
      or (status not in ('resolved', 'closed') and resolved_at is null)
    ),

  constraint issues_cost_not_negative check (cost is null or cost >= 0)
);

comment on table issues is 'Faults, condition flags, requests and supply requests in one table, discriminated by kind. One status flow, one notification path, one screen.';
comment on column issues.kind is 'What sort of thing this is. Not cosmetic — it decides which fields are required and who is told.';
comment on column issues.reported_by is 'Who said so. Restrict on delete: an unattributed fault is a rumour.';
comment on column issues.assigned_to is 'Who has to act. Set null on delete, because work is reassigned and faults are not lost.';
comment on column issues.resolved_at is 'Moves with status by constraint, so "resolved" always has a date and an open issue never does.';

create index issues_status_idx on issues (status) where status not in ('resolved', 'closed');
create index issues_assigned_idx on issues (assigned_to) where status not in ('resolved', 'closed');
create index issues_reporter_idx on issues (reported_by);
create index issues_area_idx on issues (area_id);
create index issues_priority_idx on issues (priority, reported_at desc);

create trigger issues_touch before update on issues
  for each row execute function touch_updated_at();


-- ---------- photographs on an issue ----------

-- A photograph of the thing is worth more than the sentence describing
-- it, and it is the difference between a vendor quoting on the phone
-- and a vendor visiting to look.
create table issue_photos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues (id) on delete cascade,
  -- A path in the files bucket, not a URL. The app asks for a signed
  -- link each time, and that link expires; storing a URL would mean
  -- storing something that either never expires or stops working.
  path text not null,
  caption text not null default '',
  taken_at timestamptz not null default now(),
  by_id text not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table issue_photos is 'Photographs attached to an issue. Paths into the files bucket — never public URLs.';
comment on column issue_photos.path is 'Storage path. The app requests a short-lived signed link on each open.';

create index issue_photos_issue_idx on issue_photos (issue_id);


-- ---------- the comment thread ----------

create table issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues (id) on delete cascade,
  by_id text not null references profiles (id) on delete restrict,
  said_at timestamptz not null default now(),
  body text not null,
  created_at timestamptz not null default now(),
  constraint issue_comments_not_empty check (length(trim(body)) > 0)
);

comment on table issue_comments is 'The thread on an issue. Append-only in practice — the history of a decision is the point of it.';

create index issue_comments_issue_idx on issue_comments (issue_id, said_at);


-- ---------- incidents ----------

create table incidents (
  id uuid primary key default gen_random_uuid(),
  happened_on date not null,
  happened_at time not null,
  type incident_type not null,
  zone zone not null default 'household',
  area_id text references areas (id) on delete set null,
  description text not null,
  -- Names, not ids: the people involved are often not people the app
  -- knows. A contractor, a delivery driver, a guest's child.
  people text not null default '',
  action_taken text not null default '',
  reported_by text not null references profiles (id) on delete restrict,
  -- Where an incident turned into work, this is the work.
  follow_up_issue_id uuid references issues (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint incidents_described check (length(trim(description)) > 0)
);

comment on table incidents is 'Things that happened. Written once, in the past tense, and never reopened — which is why this is not an issue with a kind.';
comment on column incidents.people is 'Free text. The people in an incident are frequently not people the app has a profile for.';
comment on column incidents.follow_up_issue_id is 'Set where the incident produced work. The incident itself still closes.';

create index incidents_date_idx on incidents (happened_on desc);
create index incidents_type_idx on incidents (type);

create trigger incidents_touch before update on incidents
  for each row execute function touch_updated_at();


create table incident_photos (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents (id) on delete cascade,
  path text not null,
  caption text not null default '',
  taken_at timestamptz not null default now(),
  by_id text not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table incident_photos is 'Photographs attached to an incident. Same storage rules as issue photographs.';

create index incident_photos_incident_idx on incident_photos (incident_id);

-- ============================================================
-- 20260828000700_supplies_kitchen.sql
-- ============================================================

-- ============================================================
-- Stock, shopping, meals and waste.
--
-- Two flags on inventory carry rules from the running sheet that exist
-- nowhere else in the schema, and both of them matter more than they
-- look:
--
--   prayer_item — brought for prayer, marked on the lid, and never used
--   for consumption. A prayer-marked litre of milk is not a litre of
--   milk you have. If a container is not marked, the sheet says treat
--   it as prayer stock and ask.
--
--   shrine_only — the shrine cloth and the shrine sponge. The cloth
--   never meets a spray or a chemical; the sponge never meets meat or
--   the normal washing-up. If either cannot be found, the instruction
--   is to say so and wait, not to substitute.
--
-- meals carries the food rule. During the observance nothing on the
-- menu may contain meat, fish or eggs, and that is checked in the app
-- before a meal can be approved (src/lib/foodrule.ts). It is not
-- checked here, because the rule has dates and this table does not know
-- them — see the approval trigger at the foot of this file, which does.
-- ============================================================


-- ---------- categories ----------

create table inventory_categories (
  id text primary key,
  name text not null,
  zone zone not null default 'household',
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table inventory_categories is 'How the stock list is grouped on screen. Text ids because the seeded items name them.';

create trigger inventory_categories_touch before update on inventory_categories
  for each row execute function touch_updated_at();


-- ---------- items ----------

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id text not null references inventory_categories (id) on delete restrict,
  zone zone not null default 'household',
  qty numeric(12, 2) not null default 0,
  -- Below this, the item is on the shopping list and Earl is told.
  min_qty numeric(12, 2) not null default 0,
  unit text not null default 'units',
  -- Bought on a rhythm rather than when it runs out.
  recurring boolean not null default false,
  vendor_id uuid,
  notes text not null default '',
  -- R6. Brought for prayer, marked, and never used for consumption.
  prayer_item boolean not null default false,
  -- R7. The shrine cloth and the shrine sponge. Never meat, never chemicals.
  shrine_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_qty_not_negative check (qty >= 0),
  constraint inventory_min_not_negative check (min_qty >= 0),
  -- Nothing is both brought for prayer and a shrine cleaning item. One
  -- is consumed and set aside; the other is equipment.
  constraint inventory_flags_exclusive check (not (prayer_item and shrine_only))
);

comment on table inventory_items is 'Everything counted. Two flags carry rules from the running sheet: prayer_item and shrine_only.';
comment on column inventory_items.prayer_item is 'R6. Marked and never used for consumption. Excluded from what counts as available.';
comment on column inventory_items.shrine_only is 'R7. The shrine cloth and sponge. Never a spray, never meat, never substituted.';
comment on column inventory_items.min_qty is 'Below this it lands on the shopping list. Divo oil sits at 2 for a reason — it burns down over about three days.';

create index inventory_category_idx on inventory_items (category_id) where active;
create index inventory_low_idx on inventory_items (qty) where active;
create index inventory_prayer_idx on inventory_items (prayer_item) where prayer_item;

create trigger inventory_items_touch before update on inventory_items
  for each row execute function touch_updated_at();


-- ---------- movements ----------

-- Append-only, and that is the point. Two devices offline at once
-- produce two rows and both are correct; a single qty column reconciled
-- by last-write would silently lose one of them. The qty above is a
-- cached total, and this is the truth.
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items (id) on delete cascade,
  -- Signed. Negative is used or wasted, positive is bought or found.
  delta numeric(12, 2) not null,
  reason movement_reason not null,
  by_id text not null references profiles (id) on delete restrict,
  happened_at timestamptz not null default now(),
  -- Free text pointing at whatever caused it — a meal, a shopping run.
  ref text not null default '',
  created_at timestamptz not null default now(),
  constraint movements_delta_not_zero check (delta <> 0)
);

comment on table inventory_movements is 'Every change to stock, append-only. The item''s qty is a cache; this is the record.';
comment on column inventory_movements.delta is 'Signed. A count correction is a movement too, with reason = count.';

create index movements_item_idx on inventory_movements (item_id, happened_at desc);
create index movements_when_idx on inventory_movements (happened_at desc);


-- Keep the cached total honest. Doing this in the database rather than
-- the app means an offline device's queued movements land correctly
-- whenever they arrive, in whatever order they arrive.
create or replace function apply_movement() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  update inventory_items
     set qty = greatest(0, qty + new.delta)
   where id = new.item_id;
  return new;
end;
$$;

comment on function apply_movement() is 'Keeps inventory_items.qty in step with the movement log. Clamped at zero — a negative shelf is a data error, not a fact.';

create trigger inventory_movements_apply after insert on inventory_movements
  for each row execute function apply_movement();


-- ---------- the shopping list ----------

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  -- Null where somebody wrote a line that is not a tracked item.
  item_id uuid references inventory_items (id) on delete set null,
  name text not null,
  zone zone not null default 'household',
  qty numeric(12, 2) not null default 1,
  unit text not null default 'units',
  status shopping_status not null default 'needed',
  added_by text not null references profiles (id) on delete restrict,
  added_at timestamptz not null default now(),
  purchased_at timestamptz,
  cost numeric(12, 2),
  vendor_id uuid,
  notes text not null default '',
  -- The three rows printed on every running sheet: the daily milk and
  -- yoghurt, the divo oil, and the flowers, incense, matches and wicks.
  -- Standing rows are never cleared off the list.
  standing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_purchased_has_date
    check ((status = 'purchased') = (purchased_at is not null))
);

comment on table shopping_items is 'What needs buying. The three standing rows are printed on every sheet and are never cleared.';
comment on column shopping_items.standing is 'R12. The milk and yoghurt run, the divo oil, and the flowers, incense, matches and wicks.';

create index shopping_status_idx on shopping_items (status) where status <> 'purchased';

create trigger shopping_items_touch before update on shopping_items
  for each row execute function touch_updated_at();


-- ---------- meals ----------

create table meals (
  id uuid primary key default gen_random_uuid(),
  served_on date not null,
  type meal_type not null,
  name text not null,
  portions smallint not null default 4,
  serve_at time not null,
  zone zone not null default 'household',
  prep text not null default '',
  cook text not null default '',
  diet text not null default '',
  leftovers leftovers not null default 'None',
  status meal_status not null default 'Draft',
  proposed_by text not null references profiles (id) on delete restrict,
  proposed_at timestamptz not null default now(),
  approved_by text references profiles (id) on delete set null,
  feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meals_portions_positive check (portions > 0),
  -- Approved means somebody approved it. A menu that approved itself is
  -- how the wrong food reaches a table on a prayer day.
  constraint meals_approval_attributed
    check (status not in ('Approved', 'Prepared', 'Completed') or approved_by is not null),
  -- Changes requested without saying what changes is not feedback.
  constraint meals_changes_explained
    check (status <> 'Changes requested' or length(trim(feedback)) > 0)
);

comment on table meals is 'The menu, by sitting. Status is a workflow — Draft, Submitted, Approved, Prepared, Completed — and approval is attributed by constraint.';
comment on column meals.diet is 'What must not be in it. During the observance this reads "vegetarian" and the app enforces it before approval.';

create index meals_date_idx on meals (served_on, serve_at);
create index meals_status_idx on meals (status) where status in ('Submitted', 'Changes requested');

create trigger meals_touch before update on meals
  for each row execute function touch_updated_at();


create table meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals (id) on delete cascade,
  -- Null where the cook wrote something that is not tracked stock.
  item_id uuid references inventory_items (id) on delete set null,
  name text not null,
  qty numeric(12, 2) not null default 1,
  unit text not null default 'units',
  created_at timestamptz not null default now()
);

comment on table meal_ingredients is 'What a dish needs. Checked against stock while the menu is written, not at the shop.';

create index meal_ingredients_meal_idx on meal_ingredients (meal_id);
create index meal_ingredients_item_idx on meal_ingredients (item_id);


-- ---------- the food rule, in the database ----------

-- The app checks this before it offers the Approve button
-- (src/lib/foodrule.ts). This trigger is the second line, for the same
-- reason every capability is checked twice: a rule that only exists in
-- the interface is a rule that exists until somebody uses the API.
--
-- Deliberately narrow. It fires on approval only, not on drafting —
-- writing down a dish to think about is not the same as putting it on
-- the table, and a cook typing "no eggs" into the diet note should not
-- be fought with.
create or replace function enforce_food_rule() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  banned constant text :=
    '\y(chicken|murgh|lamb|mutton|gosht|beef|steak|veal|pork|bacon|ham|gammon|sausage|chorizo|pepperoni|salami|duck|turkey|quail|fish|salmon|tuna|cod|hamour|sardine|anchovy|prawn|shrimp|crab|lobster|squid|calamari|shellfish|egg|eggs|omelette|shakshuka|meringue|mince|keema|kofta|kebab|gelatin|gelatine)\y';
  s settings%rowtype;
  offending text;
begin
  if new.status not in ('Approved', 'Prepared', 'Completed') then
    return new;
  end if;

  select * into s from settings limit 1;
  if s.observance_from is null
     or new.served_on < s.observance_from
     or new.served_on > s.observance_to then
    return new;
  end if;

  select string_agg(hit, ', ')
    into offending
    from (
      select new.name as hit where new.name ~* banned
      union all
      select i.name from meal_ingredients i where i.meal_id = new.id and i.name ~* banned
    ) t;

  if offending is not null then
    raise exception
      'FOOD RULE — THIS IS NOT OPTIONAL. % falls inside the observance (% to %), and this menu has: %. All food is vegetarian: no meat, no fish, no eggs. Milk, cheese, yoghurt and butter are fine.',
      new.served_on, s.observance_from, s.observance_to, offending
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function enforce_food_rule() is
  'Refuses to approve a meal containing meat, fish or eggs on a date inside the observance. The second of two checks; the first is in the app, before the button is offered.';

create trigger meals_food_rule before insert or update on meals
  for each row execute function enforce_food_rule();


-- ---------- waste ----------

create table waste_entries (
  id uuid primary key default gen_random_uuid(),
  wasted_on date not null,
  meal_id uuid references meals (id) on delete set null,
  description text not null,
  reason text not null default '',
  approx_value numeric(12, 2),
  by_id text not null references profiles (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint waste_value_not_negative check (approx_value is null or approx_value >= 0)
);

comment on table waste_entries is 'What got thrown away and why. Append-only: the point is the pattern over a month, not the individual bin.';

create index waste_date_idx on waste_entries (wasted_on desc);


-- ---------- the laundry rota ----------

create table laundry_slots (
  id uuid primary key default gen_random_uuid(),
  -- 0 = Sunday, matching JavaScript's getDay() and every other dow in
  -- this schema.
  dow smallint not null,
  -- A name, not a profile id. Half the rota is household members who
  -- have no account, and the other half is 'Household' meaning everyone.
  person text not null,
  load_type text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint laundry_dow_range check (dow between 0 and 6)
);

comment on table laundry_slots is 'Whose washing goes on which day. Names rather than profile ids, because half of it is household members with no account.';

create index laundry_dow_idx on laundry_slots (dow, sort_order);

-- ============================================================
-- 20260828000800_property.sql
-- ============================================================

-- ============================================================
-- The things the house owns, and the dates attached to them.
--
-- Nearly every table here exists for one reason: something expires and
-- nobody notices. A warranty, a service interval, a registration, an
-- insurance policy, a contract. The rows are cheap; the sweep in
-- 20260828001500_functions_cron.sql that reads them every morning is
-- what makes them worth having.
--
-- Service history is a separate table rather than a jsonb column,
-- because "when was the AC last done and by whom" is a question people
-- ask across assets, not within one.
-- ============================================================


-- ---------- assets ----------

create table assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat asset_cat not null,
  sub text not null default '',
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  brand text not null default '',
  model text not null default '',
  serial text not null default '',
  qty smallint not null default 1,
  -- Storage path, same rules as everywhere: never a public URL.
  photo_path text,
  description text not null default '',
  -- How this particular thing is looked after. Read by staff, so it is
  -- written in their words, not the manual's.
  care text not null default '',
  assigned_to text references profiles (id) on delete set null,

  purchase_date date,
  purchase_price numeric(12, 2),
  purchase_vendor_id uuid,
  purchase_ref text not null default '',

  warranty_start date,
  warranty_end date,
  warranty_provider text not null default '',
  warranty_notes text not null default '',

  -- 0 means it is not on a service cycle at all.
  service_freq_days smallint not null default 0,
  service_last date,
  service_next date,
  service_vendor_id uuid,
  service_notes text not null default '',

  lifespan_years smallint,
  replace_by date,
  replace_budget numeric(12, 2),
  replace_notes text not null default '',

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assets_qty_positive check (qty > 0),
  constraint assets_service_freq_allowed check (service_freq_days in (0, 90, 180, 365, 730)),
  constraint assets_warranty_order check (warranty_end is null or warranty_start is null or warranty_end >= warranty_start)
);

comment on table assets is 'Everything owned that has a warranty, a service interval or a replacement date. The expiry sweep reads this table every morning.';
comment on column assets.care is 'How to look after this one. Written for the person doing it, not copied from the manual.';
comment on column assets.service_next is 'Maintained by the app when a service is logged. Denormalised on purpose: the alert query reads it on every asset, every day.';

create index assets_area_idx on assets (area_id) where active;
create index assets_warranty_idx on assets (warranty_end) where active and warranty_end is not null;
create index assets_service_idx on assets (service_next) where active and service_next is not null;

create trigger assets_touch before update on assets
  for each row execute function touch_updated_at();


create table asset_service_log (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets (id) on delete cascade,
  serviced_on date not null,
  vendor_id uuid,
  cost numeric(12, 2),
  notes text not null default '',
  document_id uuid,
  created_at timestamptz not null default now(),
  constraint asset_service_cost_not_negative check (cost is null or cost >= 0)
);

comment on table asset_service_log is 'Every visit, on every asset. A separate table because "when was the AC last done" is asked across assets, not within one.';

create index asset_service_asset_idx on asset_service_log (asset_id, serviced_on desc);


-- ---------- vehicles ----------

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  make text not null default '',
  model text not null default '',
  year text not null default '',
  plate text not null default '',
  vin text not null default '',
  zone zone not null default 'household',
  assigned_to text references profiles (id) on delete set null,
  colour text not null default '',
  odometer integer not null default 0,
  -- The two dates that stop a car being legal. Both are swept daily.
  registration_expiry date,
  insurance_expiry date,
  insurance_provider text not null default '',
  policy_no text not null default '',
  service_freq_days smallint not null default 0,
  service_last date,
  service_next date,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_odometer_not_negative check (odometer >= 0)
);

comment on table vehicles is 'The household car. Registration and insurance expiry are swept daily — both of them make the car undriveable, not merely overdue.';

create index vehicles_expiry_idx on vehicles (registration_expiry, insurance_expiry) where active;

create trigger vehicles_touch before update on vehicles
  for each row execute function touch_updated_at();


create table vehicle_log (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  logged_on date not null,
  type vehicle_log_type not null,
  odometer integer,
  cost numeric(12, 2),
  vendor_id uuid,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint vehicle_log_odometer_not_negative check (odometer is null or odometer >= 0)
);

comment on table vehicle_log is 'Fuel, service, repairs, fines, tolls and Salik. Append-only — it is a running cost record.';

create index vehicle_log_vehicle_idx on vehicle_log (vehicle_id, logged_on desc);


-- ---------- service contracts ----------

create table service_contracts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat contract_cat not null,
  zone zone not null default 'household',
  vendor_id uuid,
  -- The visit cycle, in days. Distinct from the contract term below.
  freq_days smallint not null default 0,
  last_visit date,
  next_visit date,
  contract_start date,
  contract_end date,
  cost numeric(12, 2),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_term_order check (contract_end is null or contract_start is null or contract_end >= contract_start)
);

comment on table service_contracts is 'AC, pest, water tank, window cleaning. Two clocks: when the next visit is due, and when the contract itself runs out.';
comment on column service_contracts.freq_days is 'The visit cycle. A quarterly AC contract has freq_days 90 and a term of a year.';

create index contracts_next_idx on service_contracts (next_visit) where active;
create index contracts_end_idx on service_contracts (contract_end) where active;

create trigger service_contracts_touch before update on service_contracts
  for each row execute function touch_updated_at();


create table contract_documents (
  contract_id uuid not null references service_contracts (id) on delete cascade,
  document_id uuid not null,
  primary key (contract_id, document_id)
);

comment on table contract_documents is 'Which filed documents belong to which contract. The foreign key to documents is added in 20260828001000_money_documents.sql, once that table exists.';


-- ---------- plants ----------

create table plants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  species text not null default '',
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  water_freq_days smallint not null default 7,
  last_watered date,
  feed_freq_days smallint not null default 0,
  last_fed date,
  light text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plants_water_freq_positive check (water_freq_days > 0)
);

comment on table plants is 'Watering and feeding cycles. The day builder turns these into tasks, which is the only reason a plant needs a row at all.';

create index plants_area_idx on plants (area_id) where active;

create trigger plants_touch before update on plants
  for each row execute function touch_updated_at();

-- ============================================================
-- 20260828000900_people_access.sql
-- ============================================================

-- ============================================================
-- Contacts, vendors, who came to the door, and who holds a key.
--
-- access_credentials is the one table in this schema written to be
-- deliberately incomplete, and it is the third of the three contestable
-- calls in the build plan.
--
-- It records that a code exists, which door it opens, who holds it, and
-- when it was last changed. It does not record the digits. There is no
-- column for them and there is not meant to be, because a household
-- database reached by a dozen accounts is not where the front door code
-- belongs — and a register that knows a code is three years old and
-- held by a contractor who left is worth more than one that knows the
-- number and is never opened.
--
-- If somebody asks for a "code" field later, the answer is a password
-- manager, not a column.
-- ============================================================


-- ---------- contacts ----------

create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat contact_cat not null,
  org text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  -- The handful that go on the emergency card by the door.
  emergency boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table contacts is 'People to ring. The emergency flag is what gets printed and stuck to the fridge.';

create index contacts_cat_idx on contacts (cat) where active;
create index contacts_emergency_idx on contacts (emergency) where emergency and active;

create trigger contacts_touch before update on contacts
  for each row execute function touch_updated_at();


-- ---------- vendors ----------

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat vendor_cat not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  account_ref text not null default '',
  -- What they are actually like to deal with. The most useful column
  -- on the table and the one most likely to be left empty.
  notes text not null default '',
  rating smallint,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_rating_range check (rating is null or rating between 1 and 5)
);

comment on table vendors is 'Who gets called for what. The notes column is the point of the table — the phone number is on the internet, the opinion is not.';

create index vendors_cat_idx on vendors (cat) where active;

create trigger vendors_touch before update on vendors
  for each row execute function touch_updated_at();


-- The forward references left dangling by the earlier files, resolved
-- now that vendors exists. Declared here rather than as inline columns
-- so the migration order stays a straight line with no cycles.
alter table inventory_items
  add constraint inventory_items_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table shopping_items
  add constraint shopping_items_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table issues
  add constraint issues_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table issues
  add constraint issues_asset_fk
  foreign key (asset_id) references assets (id) on delete set null;

alter table assets
  add constraint assets_purchase_vendor_fk
  foreign key (purchase_vendor_id) references vendors (id) on delete set null;

alter table assets
  add constraint assets_service_vendor_fk
  foreign key (service_vendor_id) references vendors (id) on delete set null;

alter table asset_service_log
  add constraint asset_service_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table vehicle_log
  add constraint vehicle_log_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table service_contracts
  add constraint service_contracts_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;


-- ---------- visitors ----------

create table visitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org text not null default '',
  visiting text not null default '',
  purpose text not null default '',
  zone zone not null default 'household',
  visited_on date not null,
  arrived time not null,
  departed time,
  badge text not null default '',
  logged_by text not null references profiles (id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitors_departure_after_arrival check (departed is null or departed >= arrived)
);

comment on table visitors is 'Who came, when, and whether they left. During the prayers this is a long list, which is exactly when it matters.';
comment on column visitors.departed is 'Null means still on site. The screen counts those, because an open entry at midnight is the thing worth seeing.';

create index visitors_open_idx on visitors (visited_on) where departed is null;
create index visitors_date_idx on visitors (visited_on desc);

create trigger visitors_touch before update on visitors
  for each row execute function touch_updated_at();


-- ---------- contractor visits ----------

create table contractor_visits (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors (id) on delete set null,
  people text not null default '',
  purpose text not null,
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  visited_on date not null,
  arrived time,
  departed time,
  -- Somebody from the house has to be with them. Recording who is the
  -- point of the table.
  escorted_by text references profiles (id) on delete set null,
  issue_id uuid references issues (id) on delete set null,
  work_done text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table contractor_visits is 'Trades in the house. Separate from visitors because a contractor is escorted, does work, and is usually attached to an issue.';
comment on column contractor_visits.escorted_by is 'Who stayed with them. An unescorted contractor is the thing this table exists to make visible.';

create index contractor_visits_date_idx on contractor_visits (visited_on desc);
create index contractor_visits_issue_idx on contractor_visits (issue_id);

create trigger contractor_visits_touch before update on contractor_visits
  for each row execute function touch_updated_at();


-- ---------- deliveries ----------

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  courier text not null default '',
  for_profile_id text references profiles (id) on delete set null,
  -- Free text for anything addressed to the house rather than a person.
  for_whom text not null default '',
  zone zone not null default 'household',
  received_on date not null,
  arrived time not null,
  received_by text not null references profiles (id) on delete restrict,
  status delivery_status not null default 'received',
  collected_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_collected_has_time
    check ((status = 'collected') = (collected_at is not null))
);

comment on table deliveries is 'Parcels. Marvin logs them and posts them on the group; the uncollected count is what stops a box sitting in the hall for a week.';

create index deliveries_uncollected_idx on deliveries (received_on) where status = 'received';

create trigger deliveries_touch before update on deliveries
  for each row execute function touch_updated_at();


-- ---------- keys, fobs and codes ----------

create table access_credentials (
  id uuid primary key default gen_random_uuid(),
  kind credential_kind not null,
  label text not null,
  zone zone not null default 'household',
  -- Where the physical thing lives, or which door the code opens.
  -- NOT the code itself. There is no column for that, on purpose.
  held_where text not null default '',
  -- A name rather than a profile id: half of these are with a
  -- contractor, a building manager or a relative.
  issued_to_name text not null default '',
  issued_to_profile_id text references profiles (id) on delete set null,
  issued_at date,
  -- The date that makes the register useful. A code last changed when
  -- somebody who has since left still knew it is the finding.
  last_changed date,
  copies smallint not null default 1,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credentials_copies_positive check (copies > 0)
);

comment on table access_credentials is 'The register of keys, fobs and codes. Records that a code exists, which door, who holds it and when it last changed — never the digits. Eleven accounts can reach this database; the front door code does not belong in it.';
comment on column access_credentials.held_where is 'Where the key lives, or which door the code opens. Not the code. There is deliberately no column for the code.';
comment on column access_credentials.last_changed is 'The column the register is really for. An old date beside a departed holder is the alert.';

create index credentials_kind_idx on access_credentials (kind) where active;
create index credentials_stale_idx on access_credentials (last_changed) where active;

-- ============================================================
-- 20260828001000_money_documents.sql
-- ============================================================

-- ============================================================
-- Money, and the filing cabinet.
--
-- One column decides who sees what in this file: `visibility`. A
-- transaction marked 'owner' is staff pay and private household
-- spending; one marked 'manager' is the running of the house. Earl sees
-- the second and not the first, and that is enforced by the policy in
-- 20260828001400_rls.sql calling has_capability('money.viewOwner') —
-- not by the app filtering a list it was already handed.
--
-- The distinction is worth stating plainly because it is the one place
-- in this schema where getting it wrong publishes somebody's salary to
-- the person they work alongside.
-- ============================================================


-- ---------- categories and budgets ----------

create table expense_categories (
  id text primary key,
  name text not null,
  kind expense_kind not null,
  zone zone not null default 'household',
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table expense_categories is 'How spending is grouped. Text ids because budgets and transactions in the seed name them.';

create trigger expense_categories_touch before update on expense_categories
  for each row execute function touch_updated_at();


create table budgets (
  id uuid primary key default gen_random_uuid(),
  -- 'YYYY-MM'. A text month rather than a date because a budget is for
  -- a month, not for the first of it, and every query groups by it.
  month text not null,
  category_id text not null references expense_categories (id) on delete cascade,
  zone zone not null default 'household',
  amount numeric(12, 2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_format check (month ~ '^\d{4}-\d{2}$'),
  constraint budgets_amount_not_negative check (amount >= 0),
  unique (month, category_id)
);

comment on table budgets is 'One figure per category per month. Unique on the pair, so a category cannot quietly have two budgets.';
comment on column budgets.month is 'YYYY-MM. Text, because a budget belongs to a month rather than to a day in it.';

create index budgets_month_idx on budgets (month);

create trigger budgets_touch before update on budgets
  for each row execute function touch_updated_at();


-- ---------- transactions ----------

create table transactions (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  description text not null,
  amount numeric(12, 2) not null,
  category_id text not null references expense_categories (id) on delete restrict,
  zone zone not null default 'household',
  vendor_id uuid references vendors (id) on delete set null,
  method payment_method not null,
  ref text not null default '',
  entered_by text not null references profiles (id) on delete restrict,
  -- The column this file is about. 'owner' is pay and private spending;
  -- 'manager' is the running of the house.
  visibility visibility not null default 'manager',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_not_zero check (amount <> 0)
);

comment on table transactions is 'Every payment. Split by visibility: manager-visible is the running of the house, owner-only is pay and private spending.';
comment on column transactions.visibility is 'Owner-only rows are refused to anyone without money.viewOwner — by the policy, not by the app filtering a list it already has.';

create index transactions_date_idx on transactions (spent_on desc);
create index transactions_category_idx on transactions (category_id, spent_on desc);
create index transactions_visibility_idx on transactions (visibility);

create trigger transactions_touch before update on transactions
  for each row execute function touch_updated_at();


-- What a payment was for, where it was for something in the app.
create table transaction_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  link_type transaction_link_type not null,
  link_id text not null,
  created_at timestamptz not null default now()
);

comment on table transaction_links is 'Ties a payment to the thing it paid for — an issue, an asset, a contract. Polymorphic by necessity: the alternative is six nullable columns.';

create index transaction_links_tx_idx on transaction_links (transaction_id);
create index transaction_links_target_idx on transaction_links (link_type, link_id);


-- ---------- recurring charges ----------

create table recurring_charges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind charge_kind not null,
  category_id text not null references expense_categories (id) on delete restrict,
  zone zone not null default 'household',
  amount numeric(12, 2) not null default 0,
  cadence charge_cadence not null,
  next_due date,
  -- Autopay changes what the reminder is for: a nudge to check it went
  -- out, rather than a nudge to pay it.
  autopay boolean not null default false,
  account_ref text not null default '',
  visibility visibility not null default 'manager',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_amount_not_negative check (amount >= 0)
);

comment on table recurring_charges is 'Bills and subscriptions. Swept daily for anything due inside a fortnight.';
comment on column recurring_charges.autopay is 'Changes the meaning of the reminder: check it went out, rather than go and pay it.';

create index recurring_due_idx on recurring_charges (next_due) where active;

create trigger recurring_charges_touch before update on recurring_charges
  for each row execute function touch_updated_at();


-- ---------- petty cash ----------

create table petty_cash (
  id uuid primary key default gen_random_uuid(),
  happened_on date not null,
  -- float = money handed out, spend = money used, return = change back.
  direction petty_direction not null,
  profile_id text not null references profiles (id) on delete restrict,
  amount numeric(12, 2) not null,
  description text not null default '',
  -- R19. Cash spent is logged with receipts. The photograph is the
  -- receipt, and its absence is what the screen shows.
  receipt_path text,
  entered_by text not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint petty_amount_positive check (amount > 0)
);

comment on table petty_cash is 'Cash out, cash spent, change back. R19 — every spend is meant to carry a receipt, and the missing ones are the report.';
comment on column petty_cash.receipt_path is 'Storage path to the photographed receipt. Null is allowed and is precisely what gets chased.';

create index petty_profile_idx on petty_cash (profile_id, happened_on desc);
create index petty_no_receipt_idx on petty_cash (happened_on) where direction = 'spend' and receipt_path is null;


-- ---------- documents ----------

create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cat doc_cat not null,
  filename text not null default '',
  mime text not null default 'application/pdf',
  size_kb integer not null default 0,
  -- Storage path in the files bucket. Empty on a record kept for the
  -- dates alone, where the paper itself is in a drawer.
  path text not null default '',
  zone zone not null default 'household',
  issue_date date,
  expiry_date date,
  reminder_days smallint not null default 30,
  visibility visibility not null default 'manager',
  uploaded_by text not null references profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_size_not_negative check (size_kb >= 0)
);

comment on table documents is 'The filing cabinet. A row with an empty path is still useful — it is the expiry date of a paper that lives in a drawer.';
comment on column documents.expiry_date is 'What the daily sweep reads. reminder_days sets how far ahead it starts saying so.';

create index documents_expiry_idx on documents (expiry_date) where expiry_date is not null;
create index documents_cat_idx on documents (cat);
create index documents_visibility_idx on documents (visibility);

create trigger documents_touch before update on documents
  for each row execute function touch_updated_at();


create table document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  link_type document_link_type not null,
  link_id text not null,
  created_at timestamptz not null default now()
);

comment on table document_links is 'Which document belongs to which asset, vehicle, contract or person.';

create index document_links_doc_idx on document_links (document_id);
create index document_links_target_idx on document_links (link_type, link_id);


-- The forward references from the property file, now resolvable.
alter table contract_documents
  add constraint contract_documents_document_fk
  foreign key (document_id) references documents (id) on delete cascade;

alter table asset_service_log
  add constraint asset_service_document_fk
  foreign key (document_id) references documents (id) on delete set null;

-- ============================================================
-- 20260828001100_employment.sql
-- ============================================================

-- ============================================================
-- Employment. Visas, attendance, leave and reviews.
--
-- Every table in this file is owner-and-manager only, and the policies
-- say so. A staff member reads their own row and nobody else's, which
-- is not a nicety — Rosie's salary, Reza's visa date and Marvin's
-- passport expiry are three of the most sensitive columns in the whole
-- database, and they sit beside a shopping list.
--
-- The three expiry dates are why this file exists at all. A residence
-- visa renewal takes about three weeks, a visa renewal needs six months
-- of passport validity, and a medical has to be done before the visa.
-- Missing any of them by a week is a real problem for a real person,
-- so all three are swept every morning and warned on well ahead.
-- ============================================================


-- ---------- the employment record ----------

create table staff_details (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null unique references profiles (id) on delete cascade,
  role_title text not null default '',
  contract_start date,
  contract_end date,

  -- The three that stop somebody being legally able to work, in the
  -- order they depend on each other.
  visa_expiry date,
  passport_expiry date,
  medical_expiry date,

  leave_entitlement_days smallint not null default 30,
  pay_day smallint not null default 28,
  salary numeric(12, 2),
  lives_in boolean not null default false,
  emergency_contact text not null default '',
  emergency_phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint staff_pay_day_range check (pay_day between 1 and 31),
  constraint staff_salary_not_negative check (salary is null or salary >= 0),
  constraint staff_contract_order check (contract_end is null or contract_start is null or contract_end >= contract_start)
);

comment on table staff_details is 'The employment record. Owner and manager only — this table holds salaries and visa dates.';
comment on column staff_details.visa_expiry is 'Renewal takes about three weeks. Warned on well before, because the lead time is the whole problem.';
comment on column staff_details.passport_expiry is 'A visa renewal needs six months of passport validity, so this expiring is really the visa expiring early.';
comment on column staff_details.lives_in is 'Rosie lives in and is on until close-down. It changes what a day off actually means.';

create index staff_details_visa_idx on staff_details (visa_expiry);
create index staff_details_passport_idx on staff_details (passport_expiry);
create index staff_details_medical_idx on staff_details (medical_expiry);

create trigger staff_details_touch before update on staff_details
  for each row execute function touch_updated_at();


-- ---------- attendance ----------

-- Append-only. Reza is paid by the hour, so this table is the pay
-- record, and a row that can be edited quietly is a pay record nobody
-- can rely on. Corrections are a new row with a note, not an update.
create table attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  worked_on date not null,
  clock_in time,
  clock_out time,
  hours numeric(5, 2),
  source attendance_source not null default 'manual',
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint attendance_hours_sane check (hours is null or (hours >= 0 and hours <= 24)),
  constraint attendance_out_after_in check (clock_out is null or clock_in is null or clock_out >= clock_in)
);

comment on table attendance is 'Hours worked. Append-only, because for Reza this is the pay record and an editable pay record is not one.';
comment on column attendance.source is 'manual where somebody typed it, derived where it came from the shift pattern.';

create index attendance_staff_idx on attendance (staff_id, worked_on desc);
create index attendance_date_idx on attendance (worked_on desc);


-- ---------- leave ----------

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  type absence_type not null,
  days numeric(4, 1) not null default 1,
  status leave_status not null default 'requested',
  requested_at timestamptz not null default now(),
  approved_by text references profiles (id) on delete set null,
  approved_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_dates_order check (to_date >= from_date),
  constraint leave_days_positive check (days > 0),
  -- Approved by somebody, or not approved. Silent approval is how a
  -- house ends up with nobody in it during a prayer week.
  constraint leave_approval_attributed
    check (status <> 'approved' or (approved_by is not null and approved_at is not null))
);

comment on table leave_requests is 'Time off, requested and answered. Approval is attributed by constraint — silent approval is how a prayer week ends up uncovered.';

create index leave_staff_idx on leave_requests (staff_id, from_date desc);
create index leave_pending_idx on leave_requests (status) where status = 'requested';
create index leave_window_idx on leave_requests (from_date, to_date) where status in ('approved', 'taken');

create trigger leave_requests_touch before update on leave_requests
  for each row execute function touch_updated_at();


-- ---------- reviews ----------

create table staff_reviews (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references profiles (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  -- Taken from the checklist, not typed in. A review that argues with
  -- the record is a conversation worth having; one that invents the
  -- record is not.
  completion_pct smallint,
  strengths text not null default '',
  development text not null default '',
  notes text not null default '',
  reviewed_by text not null references profiles (id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_period_order check (period_end >= period_start),
  constraint reviews_pct_range check (completion_pct is null or completion_pct between 0 and 100)
);

comment on table staff_reviews is 'The periodic conversation, with the completion figure taken from the checklist rather than typed in.';
comment on column staff_reviews.completion_pct is 'Computed from the materialised days across the period. It is evidence, not an opinion.';

create index staff_reviews_staff_idx on staff_reviews (staff_id, period_end desc);

create trigger staff_reviews_touch before update on staff_reviews
  for each row execute function touch_updated_at();

-- ============================================================
-- 20260828001200_occasions_shrine.sql
-- ============================================================

-- ============================================================
-- Guests, events, the observance, and the shrine record.
--
-- Occasions all work the same way: a thing with a date, and a list of
-- tasks positioned by an offset from it — three days before, two hours
-- before, on the day, after. One engine, three shapes (a guest staying,
-- an event happening, the house empty while everyone is away).
--
-- The observance is what names every running sheet. '9th day of the
-- Prayer' is not typed in; it is computed from the start date, which is
-- why the sheet for the 21st of August says what it says. It also
-- decides two other things: whether the running sheet is the front of
-- the app or a record, and whether the food rule bites.
--
-- divo_log and shrine_checks are append-only and are the most
-- consequential small tables in the schema. The divo burns down over
-- about three days. Two spare bottles of oil, always — not one, because
-- Marvin buys it first thing and one spare is already a problem.
-- ============================================================


-- ---------- guests ----------

create table guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  arrival date not null,
  arrival_time time,
  departure date,
  area_id text references areas (id) on delete set null,
  -- What they cannot eat, and where they sit. Section 5 of the sheet.
  dietary text not null default '',
  notes text not null default '',
  status occasion_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_departure_after_arrival check (departure is null or departure >= arrival)
);

comment on table guests is 'People staying. R13 — the dietary note and the seating note are the two things the sheet asks for.';

create index guests_arrival_idx on guests (arrival);
create index guests_active_idx on guests (status) where status = 'active';

create trigger guests_touch before update on guests
  for each row execute function touch_updated_at();


-- ---------- events ----------

create table house_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  happens_on date not null,
  starts_at time,
  headcount smallint,
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  notes text not null default '',
  status occasion_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_headcount_positive check (headcount is null or headcount > 0)
);

comment on table house_events is 'A dinner, a birthday, a sitting. Same offset engine as a guest arrival.';

create index house_events_date_idx on house_events (happens_on);

create trigger house_events_touch before update on house_events
  for each row execute function touch_updated_at();


-- ---------- occasion tasks ----------

-- One table for guest, event and vacation tasks. The offset is the
-- interesting column: it positions the task relative to the occasion,
-- so moving a dinner by a day moves everything with it.
create table occasion_tasks (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references guests (id) on delete cascade,
  event_id uuid references house_events (id) on delete cascade,
  vacation_id uuid,
  -- Which phase of a vacation this belongs to. Null for guests and events.
  phase vacation_phase,
  text text not null,
  offset_n smallint not null default 0,
  offset_unit offset_unit not null default 'days',
  offset_dir offset_direction not null default 'before',
  role staff_role not null default 'housekeeping',
  est_minutes smallint not null default 15,
  sort_order smallint not null default 0,
  done boolean not null default false,
  done_by text references profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Exactly one owner. A task belonging to a guest and an event at once
  -- would appear twice and be ticked once.
  constraint occasion_tasks_one_owner check (
    (guest_id is not null)::int + (event_id is not null)::int + (vacation_id is not null)::int = 1
  ),
  constraint occasion_tasks_done_attributed
    check (done = false or (done_by is not null and done_at is not null))
);

comment on table occasion_tasks is 'Preparation, positioned by an offset from the occasion. Move the dinner and everything moves with it.';
comment on constraint occasion_tasks_one_owner on occasion_tasks is 'Exactly one of guest, event or vacation. Two owners would mean the task appears twice and is ticked once.';

create index occasion_tasks_guest_idx on occasion_tasks (guest_id) where guest_id is not null;
create index occasion_tasks_event_idx on occasion_tasks (event_id) where event_id is not null;
create index occasion_tasks_vacation_idx on occasion_tasks (vacation_id) where vacation_id is not null;

create trigger occasion_tasks_touch before update on occasion_tasks
  for each row execute function touch_updated_at();


-- ---------- templates ----------

create table occasion_templates (
  id text primary key,
  kind occasion_kind not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table occasion_templates is 'The starting task list for a kind of occasion. Copied on use, not referenced — editing the template must not rewrite history.';

create table occasion_template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references occasion_templates (id) on delete cascade,
  text text not null,
  offset_n smallint not null default 0,
  offset_unit offset_unit not null default 'days',
  offset_dir offset_direction not null default 'before',
  role staff_role not null default 'housekeeping',
  est_minutes smallint not null default 15,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index occasion_template_tasks_template_idx on occasion_template_tasks (template_id, sort_order);


-- ---------- vacations ----------

create table vacations (
  id uuid primary key default gen_random_uuid(),
  depart date not null,
  return_on date not null,
  notes text not null default '',
  status occasion_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vacations_dates_order check (return_on >= depart)
);

comment on table vacations is 'The house empty. Three phases of task — before leaving, while away, on return.';

create trigger vacations_touch before update on vacations
  for each row execute function touch_updated_at();

alter table occasion_tasks
  add constraint occasion_tasks_vacation_fk
  foreign key (vacation_id) references vacations (id) on delete cascade;


-- ---------- the observance ----------

create table observances (
  id text primary key,
  name text not null,
  start_date date not null,
  end_date date not null,
  day_count smallint not null,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint observances_dates_order check (end_date >= start_date)
);

comment on table observances is 'The multi-day observance that names every running sheet. The current one runs 13 August to 11 September 2026 — thirty days.';
comment on column observances.start_date is 'Day one. The sheet dated 21 August is headed "9th day of the Prayer", which is what fixes it at 13 August.';

create trigger observances_touch before update on observances
  for each row execute function touch_updated_at();


-- '9th day of the Prayer', computed rather than typed. Written as a
-- function because the sheet, the export and the reminder job all need
-- the same answer and must not each have their own arithmetic.
create or replace function observance_day_no(o_id text, d date) returns smallint
language sql
stable
set search_path = public, pg_catalog
as $$
  select case
           when d < o.start_date or d > o.end_date then 0
           else (d - o.start_date + 1)::smallint
         end
  from observances o
  where o.id = o_id;
$$;

comment on function observance_day_no(text, date) is 'Which day of the observance a date is, or 0 outside it. One arithmetic, used by the sheet, the export and the 09:00 job alike.';


-- ---------- the divo ----------

-- Append-only. A reading is not revised: "it was low at 18:00" stays
-- true after somebody tops it up at 18:05, and the pair of rows is the
-- record that it was caught.
create table divo_log (
  id uuid primary key default gen_random_uuid(),
  logged_at timestamptz not null default now(),
  action divo_action not null,
  oil_level oil_level,
  by_id text not null references profiles (id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now()
);

comment on table divo_log is 'The divo, logged every time it is checked or topped up. Append-only: a reading is not revised, and the pair of rows is the proof it was caught.';
comment on column divo_log.oil_level is 'Low or empty raises an alert to Earl automatically. Two spare bottles, always — the divo burns down over about three days.';

create index divo_log_when_idx on divo_log (logged_at desc);
create index divo_log_low_idx on divo_log (logged_at desc) where oil_level in ('low', 'empty');


-- ---------- the shrine, daily ----------

create table shrine_checks (
  id uuid primary key default gen_random_uuid(),
  checked_on date not null,
  -- The seven things checked before prayers. Stored as named booleans
  -- rather than a generic tick table because these seven are fixed by
  -- the sheet, and naming them means a query can ask which one slips.
  divo_lit boolean not null default false,
  shoes_off boolean not null default false,
  dusted_with_shrine_cloth boolean not null default false,
  ash_cleared boolean not null default false,
  statues_not_moved boolean not null default false,
  area_clear boolean not null default false,
  supplies_two_deep boolean not null default false,
  by_id text not null references profiles (id) on delete restrict,
  checked_at timestamptz not null default now(),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (checked_on)
);

comment on table shrine_checks is 'The seven shrine checks, one row a day. Named columns rather than generic ticks, so "which one slips" is a query and not a report.';
comment on column shrine_checks.supplies_two_deep is 'Matches, wicks and two spare bottles of divo oil. Two, not one.';
comment on column shrine_checks.statues_not_moved is 'Not to dust behind, not to make room, not back again afterwards.';

create index shrine_checks_date_idx on shrine_checks (checked_on desc);

-- ============================================================
-- 20260828001300_notifications_audit.sql
-- ============================================================

-- ============================================================
-- Notifications, and the audit trail.
--
-- The queue is a table rather than a fire-and-forget call because a
-- push that failed to send is a fact worth keeping. A row exists,
-- sent_at is null, and the next sweep tries again. Anything else means
-- an iPad in a lift silently loses the message that the sheet is due.
--
-- Quiet hours are per person and are honoured for everything except an
-- urgent issue. That exception is the whole design: if quiet hours also
-- swallowed a burst pipe at two in the morning, people would turn quiet
-- hours off, and then nothing would be quiet.
--
-- The audit trail is append-only and readable by owners. It exists for
-- one question, asked months later: who changed that, and when.
-- ============================================================


-- ---------- the queue ----------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles (id) on delete cascade,
  kind notif_kind not null,
  title text not null,
  body text not null default '',
  -- A deep link into the app, e.g. '#/issues/<id>'. Stored so the
  -- notification lands somebody on the thing itself.
  url text not null default '',
  priority issue_priority not null default 'normal',
  created_at timestamptz not null default now(),
  -- Null until it actually went. The sweep retries these.
  sent_at timestamptz,
  read_at timestamptz,
  -- Why it has not gone yet, where that is known.
  last_error text
);

comment on table notifications is 'The queue. A row with a null sent_at is one that has not gone yet, and the sweep will try again — which is the reason this is a table and not a function call.';
comment on column notifications.url is 'Deep link. A notification that lands somebody on the app''s front page has wasted the interruption.';
comment on column notifications.sent_at is 'Null means unsent. Not "failed" — failed is unsent with a last_error.';

create index notifications_unsent_idx on notifications (created_at) where sent_at is null;
create index notifications_person_idx on notifications (profile_id, created_at desc);
create index notifications_unread_idx on notifications (profile_id) where read_at is null;


-- ---------- preferences ----------

create table notification_prefs (
  profile_id text primary key references profiles (id) on delete cascade,
  -- Which classes this person receives at all.
  assigned boolean not null default true,
  reminder boolean not null default true,
  escalation boolean not null default true,
  response boolean not null default true,
  quiet_from time not null default '22:00',
  quiet_to time not null default '06:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table notification_prefs is 'Per person, per class. Quiet hours are honoured for everything except an urgent issue — see should_send_now().';
comment on column notification_prefs.quiet_from is 'Quiet hours wrap midnight, which is why the comparison in should_send_now() is not a simple between.';

create trigger notification_prefs_touch before update on notification_prefs
  for each row execute function touch_updated_at();


-- Whether this notification may be delivered to this person right now.
-- Written as a function because the sweep, the immediate send path and
-- the settings screen's preview all have to agree, and quiet hours that
-- wrap midnight are easy to get subtly wrong three separate times.
create or replace function should_send_now(
  p_profile_id text,
  p_kind notif_kind,
  p_priority issue_priority,
  p_at timestamptz default now()
) returns boolean
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  pref notification_prefs%rowtype;
  cls text;
  local_time time;
  in_quiet boolean;
begin
  select * into pref from notification_prefs where profile_id = p_profile_id;
  -- No preferences set is not the same as wanting nothing.
  if not found then
    return true;
  end if;

  cls := case p_kind
           when 'day_ready' then 'assigned'
           when 'task_assigned' then 'assigned'
           when 'task_reminder' then 'reminder'
           when 'issue_raised' then 'escalation'
           when 'issue_update' then 'response'
           when 'meal_approval' then 'escalation'
           when 'stock_low' then 'escalation'
           when 'bill_due' then 'escalation'
           when 'expiry' then 'escalation'
           when 'coverage_gap' then 'escalation'
           when 'delivery' then 'response'
           when 'incident' then 'escalation'
         end;

  if (cls = 'assigned' and not pref.assigned)
     or (cls = 'reminder' and not pref.reminder)
     or (cls = 'escalation' and not pref.escalation)
     or (cls = 'response' and not pref.response) then
    return false;
  end if;

  -- Dubai. Fixed rather than per person: everybody in this household is
  -- in the same city, and a per-person timezone would be a column that
  -- is wrong the first time somebody travels.
  local_time := (p_at at time zone 'Asia/Dubai')::time;

  in_quiet := case
                when pref.quiet_from <= pref.quiet_to
                  then local_time >= pref.quiet_from and local_time < pref.quiet_to
                -- Wraps midnight, which is the normal case: 22:00 to 06:30.
                else local_time >= pref.quiet_from or local_time < pref.quiet_to
              end;

  -- The one exception, and the reason quiet hours stay switched on.
  if in_quiet and p_priority <> 'urgent' then
    return false;
  end if;

  return true;
end;
$$;

comment on function should_send_now(text, notif_kind, issue_priority, timestamptz) is
  'Whether this may be delivered now. Quiet hours wrap midnight and are honoured for everything except an urgent issue — the exception is what stops people turning quiet hours off entirely.';


-- ---------- push subscriptions ----------

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles (id) on delete cascade,
  -- 'Rosie's iPad', 'Earl's iPhone'. Named so a stale one can be
  -- recognised and removed by somebody who is not technical.
  device text not null default '',
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_delivery timestamptz,
  active boolean not null default true
);

comment on table push_subscriptions is 'One row per installed device. On iOS this only exists once the app is on the home screen — a Safari tab cannot hold one.';
comment on column push_subscriptions.device is 'A human name. Somebody non-technical has to be able to spot the old iPad and remove it.';
comment on column push_subscriptions.endpoint is 'Unique. Re-subscribing the same device must update the row rather than adding a second.';

create index push_subs_profile_idx on push_subscriptions (profile_id) where active;


-- ---------- audit ----------

create table audit_log (
  id bigserial primary key,
  happened_at timestamptz not null default now(),
  -- Null where the change came from a scheduled job rather than a person.
  actor_id text references profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text not null default '',
  summary text not null default '',
  -- Enough of the change to answer the question without keeping a full
  -- copy of every row forever.
  detail jsonb
);

comment on table audit_log is 'Append-only. Exists for one question asked months later: who changed that, and when.';
comment on column audit_log.actor_id is 'Null where a scheduled job made the change. That is a real answer, not a missing one.';

create index audit_when_idx on audit_log (happened_at desc);
create index audit_entity_idx on audit_log (entity, entity_id);
create index audit_actor_idx on audit_log (actor_id, happened_at desc);


-- Recording a change. Called by the app rather than by triggers on
-- every table: a trigger cannot know that four column updates were one
-- decision, and "Earl approved the menu" is worth more in this log than
-- four rows saying a column changed.
create or replace function record_audit(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_summary text default '',
  p_detail jsonb default null
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, summary, detail)
  values (my_profile_id(), p_action, p_entity, p_entity_id, p_summary, p_detail);
end;
$$;

comment on function record_audit(text, text, text, text, jsonb) is
  'Records one decision, not one column change. Called by the app, because only the app knows that four updates were a single act.';

-- ============================================================
-- 20260828001400_rls.sql
-- ============================================================

-- ============================================================
-- Row-level security. The file that makes the capability grid real.
--
-- Everything above this point is shape. This is enforcement, and it is
-- the reason the hierarchy can be edited from inside the app without
-- that being a security hole: a role invented on a Tuesday works
-- everywhere the moment its capability rows exist, because no policy
-- names a role. Every one of them asks has_capability().
--
-- Four rules hold throughout:
--
--   1. RLS is enabled on every table, with no exceptions. A table with
--      RLS off is readable by every signed-in account, and "we will add
--      it later" is how that happens.
--
--   2. There is no default-allow. A table with RLS on and no policy
--      returns nothing, which is the correct failure: a screen goes
--      empty and somebody says so. The dangerous failure is the other
--      way round.
--
--   3. Read and write are separate. A great many people need to see the
--      stock list; three may change it.
--
--   4. Where a person may see their own row and no other, the policy
--      says so with my_profile_id() rather than trusting a filter in
--      the app. The app's filter is a courtesy; this is the rule.
--
-- service_role bypasses all of it, which is how the Edge Functions and
-- the scheduled jobs work. That key is never in the browser bundle.
-- ============================================================


-- ---------- 1. on, everywhere ----------

do $$
declare t text;
begin
  foreach t in array array[
    'roles', 'role_capabilities', 'profiles', 'areas', 'settings',
    'task_categories', 'library_tasks', 'task_instances', 'procedures',
    'appointments', 'shifts', 'absences', 'coverage_rules',
    'running_sheets', 'sheet_roster_rows', 'sheet_order_rows', 'sheet_menu_rows',
    'sheet_shopping_rows', 'sheet_guest_rows', 'sheet_check_groups',
    'sheet_check_items', 'prayer_breaks', 'toilet_checks', 'sheet_photos',
    'issues', 'issue_photos', 'issue_comments', 'incidents', 'incident_photos',
    'inventory_categories', 'inventory_items', 'inventory_movements',
    'shopping_items', 'meals', 'meal_ingredients', 'waste_entries', 'laundry_slots',
    'assets', 'asset_service_log', 'vehicles', 'vehicle_log',
    'service_contracts', 'contract_documents', 'plants',
    'contacts', 'vendors', 'visitors', 'contractor_visits', 'deliveries',
    'access_credentials',
    'expense_categories', 'budgets', 'transactions', 'transaction_links',
    'recurring_charges', 'petty_cash', 'documents', 'document_links',
    'staff_details', 'attendance', 'leave_requests', 'staff_reviews',
    'guests', 'house_events', 'occasion_tasks', 'occasion_templates',
    'occasion_template_tasks', 'vacations', 'observances', 'divo_log', 'shrine_checks',
    'notifications', 'notification_prefs', 'push_subscriptions', 'audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- Force it for the table owner too. Without this, a superuser
    -- session — which is what the SQL editor gives you — silently
    -- ignores every policy below, and the rules look like they work
    -- when they have never once been exercised.
    execute format('alter table %I force row level security', t);
  end loop;
end;
$$;


-- ---------- 2. a shorthand for the common shapes ----------

-- Read gated by one capability, write gated by another. Nearly every
-- table in the schema is this, so it is written once. The alternative
-- is four hundred lines of near-identical policy that nobody proofreads.
create or replace function grant_table(t text, read_cap text, write_cap text) returns void
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  execute format(
    'create policy %I on %I for select to authenticated using (has_capability(%L))',
    t || '_read', t, read_cap);
  execute format(
    'create policy %I on %I for insert to authenticated with check (has_capability(%L))',
    t || '_insert', t, write_cap);
  execute format(
    'create policy %I on %I for update to authenticated using (has_capability(%L)) with check (has_capability(%L))',
    t || '_update', t, write_cap, write_cap);
  execute format(
    'create policy %I on %I for delete to authenticated using (has_capability(%L))',
    t || '_delete', t, write_cap);
end;
$$;

comment on function grant_table(text, text, text) is
  'Writes the four ordinary policies for a table: read on one capability, write on another. Used for the tables with no per-row rule.';


-- ---------- 3. the ordinary tables ----------

select grant_table('areas', 'day.view', 'settings.edit');
select grant_table('task_categories', 'day.view', 'library.edit');
select grant_table('library_tasks', 'day.view', 'library.edit');
select grant_table('procedures', 'day.view', 'library.edit');
select grant_table('appointments', 'day.view', 'day.assign');
select grant_table('shifts', 'day.view', 'people.manage');
select grant_table('absences', 'day.view', 'people.manage');
select grant_table('coverage_rules', 'day.view', 'people.manage');

select grant_table('inventory_categories', 'inventory.view', 'inventory.edit');
select grant_table('inventory_items', 'inventory.view', 'inventory.edit');
select grant_table('inventory_movements', 'inventory.view', 'inventory.edit');
select grant_table('shopping_items', 'inventory.view', 'inventory.edit');
select grant_table('meals', 'cooking.view', 'cooking.edit');
select grant_table('meal_ingredients', 'cooking.view', 'cooking.edit');
select grant_table('waste_entries', 'cooking.view', 'cooking.edit');
select grant_table('laundry_slots', 'day.view', 'settings.edit');

select grant_table('assets', 'property.view', 'property.edit');
select grant_table('asset_service_log', 'property.view', 'property.edit');
select grant_table('vehicles', 'property.view', 'property.edit');
select grant_table('vehicle_log', 'property.view', 'property.edit');
select grant_table('service_contracts', 'property.view', 'property.edit');
select grant_table('contract_documents', 'property.view', 'property.edit');
select grant_table('plants', 'day.view', 'property.edit');

select grant_table('contacts', 'register.view', 'register.edit');
select grant_table('vendors', 'register.view', 'register.edit');
select grant_table('visitors', 'register.view', 'register.edit');
select grant_table('contractor_visits', 'register.view', 'register.edit');
select grant_table('deliveries', 'register.view', 'register.edit');
select grant_table('access_credentials', 'register.view', 'property.edit');

select grant_table('expense_categories', 'money.view', 'settings.edit');
select grant_table('budgets', 'money.view', 'money.view');
select grant_table('transaction_links', 'money.view', 'money.view');
select grant_table('recurring_charges', 'money.view', 'money.view');

select grant_table('guests', 'occasions.view', 'occasions.edit');
select grant_table('house_events', 'occasions.view', 'occasions.edit');
select grant_table('occasion_tasks', 'occasions.view', 'day.tick');
select grant_table('occasion_templates', 'occasions.view', 'occasions.edit');
select grant_table('occasion_template_tasks', 'occasions.view', 'occasions.edit');
select grant_table('vacations', 'occasions.view', 'occasions.edit');
select grant_table('observances', 'sheet.view', 'settings.edit');

select grant_table('incidents', 'issue.viewAll', 'issue.raise');
select grant_table('incident_photos', 'issue.viewAll', 'issue.raise');

select grant_table('running_sheets', 'sheet.view', 'sheet.edit');
select grant_table('sheet_roster_rows', 'sheet.view', 'sheet.edit');
select grant_table('sheet_order_rows', 'sheet.view', 'sheet.edit');
select grant_table('sheet_menu_rows', 'sheet.view', 'sheet.edit');
select grant_table('sheet_shopping_rows', 'sheet.view', 'sheet.edit');
select grant_table('sheet_guest_rows', 'sheet.view', 'sheet.edit');
select grant_table('sheet_check_groups', 'sheet.view', 'sheet.edit');
select grant_table('sheet_check_items', 'sheet.view', 'sheet.edit');
select grant_table('prayer_breaks', 'sheet.view', 'sheet.edit');
select grant_table('toilet_checks', 'sheet.view', 'sheet.edit');
select grant_table('sheet_photos', 'sheet.view', 'sheet.edit');

select grant_table('divo_log', 'shrine.view', 'shrine.log');
select grant_table('shrine_checks', 'shrine.view', 'shrine.log');

select grant_table('task_instances', 'day.view', 'day.tick');


-- ---------- 4. the tables that need a per-row rule ----------

-- Roles. Readable by everyone signed in, because the app has to render
-- somebody's role name on their own avatar. Writable only within your
-- own rank — this is the rule that stops whoever holds roles.manage
-- from quietly minting themselves an owner.
create policy roles_read on roles
  for select to authenticated using (true);

create policy roles_insert on roles
  for insert to authenticated
  with check (has_capability('roles.manage') and rank <= my_rank());

create policy roles_update on roles
  for update to authenticated
  using (has_capability('roles.manage') and rank <= my_rank())
  with check (has_capability('roles.manage') and rank <= my_rank());

-- Seeded roles are never deleted. The seed data and the policies above
-- both name them, and retiring one is a flag, not a DELETE.
create policy roles_delete on roles
  for delete to authenticated
  using (has_capability('roles.manage') and rank < my_rank() and not is_system);

create policy role_capabilities_read on role_capabilities
  for select to authenticated using (true);

-- You cannot grant a capability you do not hold yourself. Without this,
-- roles.manage is quietly equivalent to every capability there is.
create policy role_capabilities_write on role_capabilities
  for all to authenticated
  using (
    has_capability('roles.manage')
    and has_capability(capability)
    and (select rank from roles where id = role_id) <= my_rank()
  )
  with check (
    has_capability('roles.manage')
    and has_capability(capability)
    and (select rank from roles where id = role_id) <= my_rank()
  );


-- Profiles. Everybody signed in can see who everybody is — names,
-- initials and roles are on every screen in the app, and hiding them
-- would mean a checklist that cannot say who a task is for. What is not
-- here is anything sensitive: pay, visas and passports are in
-- staff_details, which is a different table with a different rule.
create policy profiles_read on profiles
  for select to authenticated using (true);

create policy profiles_insert on profiles
  for insert to authenticated
  with check (
    has_capability('accounts.manage')
    and (select rank from roles where id = role) <= my_rank()
  );

-- Two ways to update a profile: you hold accounts.manage and the target
-- role is at or below your rank, or it is your own row and you are
-- changing your own details. The second is checked again in the WITH
-- CHECK so that editing yourself cannot be used to change your own role.
create policy profiles_update on profiles
  for update to authenticated
  using (
    (has_capability('accounts.manage') and (select rank from roles where id = role) <= my_rank())
    or id = my_profile_id()
  )
  with check (
    (has_capability('accounts.manage') and (select rank from roles where id = role) <= my_rank())
    or (id = my_profile_id() and role = (select p.role from profiles p where p.id = my_profile_id()))
  );

-- No delete policy at all. A profile is deactivated, never deleted:
-- every attributed record in the schema points at one with RESTRICT,
-- and losing the person would mean losing who ticked what.


-- Settings. One row, read by everyone, changed by few.
create policy settings_read on settings
  for select to authenticated using (true);

create policy settings_write on settings
  for all to authenticated
  using (has_capability('settings.edit'))
  with check (has_capability('settings.edit'));


-- Issues. The one table with a genuine per-row read rule: whoever
-- raised it can always see it, whether or not they can see anybody
-- else's. That is what lets somebody report a fault without being given
-- the run of the house.
create policy issues_read on issues
  for select to authenticated
  using (has_capability('issue.viewAll') or reported_by = my_profile_id() or assigned_to = my_profile_id());

create policy issues_insert on issues
  for insert to authenticated
  with check (has_capability('issue.raise') and reported_by = my_profile_id());

create policy issues_update on issues
  for update to authenticated
  using (has_capability('issue.manage') or assigned_to = my_profile_id() or reported_by = my_profile_id())
  with check (has_capability('issue.manage') or assigned_to = my_profile_id() or reported_by = my_profile_id());

create policy issues_delete on issues
  for delete to authenticated using (has_capability('issue.manage'));

-- Photographs and comments follow their issue. Written as a subquery
-- against issues rather than repeating the rule, so the two can never
-- disagree about who may see what.
create policy issue_photos_read on issue_photos
  for select to authenticated
  using (exists (select 1 from issues i where i.id = issue_id));

create policy issue_photos_write on issue_photos
  for all to authenticated
  using (exists (select 1 from issues i where i.id = issue_id) and by_id = my_profile_id())
  with check (exists (select 1 from issues i where i.id = issue_id) and by_id = my_profile_id());

create policy issue_comments_read on issue_comments
  for select to authenticated
  using (exists (select 1 from issues i where i.id = issue_id));

create policy issue_comments_insert on issue_comments
  for insert to authenticated
  with check (exists (select 1 from issues i where i.id = issue_id) and by_id = my_profile_id());

-- No update or delete on comments. A thread that can be quietly edited
-- afterwards is not a record of a decision.


-- Money. Owner-only rows are refused, not filtered — the app never
-- receives them, so no bug in the app can display them.
create policy transactions_read on transactions
  for select to authenticated
  using (has_capability('money.view') and (visibility = 'manager' or has_capability('money.viewOwner')));

create policy transactions_insert on transactions
  for insert to authenticated
  with check (has_capability('money.view') and (visibility = 'manager' or has_capability('money.viewOwner')));

create policy transactions_update on transactions
  for update to authenticated
  using (has_capability('money.view') and (visibility = 'manager' or has_capability('money.viewOwner')))
  with check (has_capability('money.view') and (visibility = 'manager' or has_capability('money.viewOwner')));

create policy transactions_delete on transactions
  for delete to authenticated using (has_capability('money.viewOwner'));

-- Petty cash: your own float, always. Everyone else's needs money.view.
create policy petty_cash_read on petty_cash
  for select to authenticated
  using (has_capability('money.view') or profile_id = my_profile_id());

create policy petty_cash_insert on petty_cash
  for insert to authenticated
  with check (has_capability('money.view') or entered_by = my_profile_id());

create policy petty_cash_update on petty_cash
  for update to authenticated
  using (has_capability('money.view'))
  with check (has_capability('money.view'));


-- Documents. Same shape as transactions, same reason.
create policy documents_read on documents
  for select to authenticated
  using (has_capability('documents.view') and (visibility = 'manager' or has_capability('documents.viewOwner')));

create policy documents_write on documents
  for all to authenticated
  using (has_capability('documents.view') and (visibility = 'manager' or has_capability('documents.viewOwner')))
  with check (has_capability('documents.view') and (visibility = 'manager' or has_capability('documents.viewOwner')));

create policy document_links_read on document_links
  for select to authenticated
  using (exists (select 1 from documents d where d.id = document_id));

create policy document_links_write on document_links
  for all to authenticated
  using (has_capability('documents.view'))
  with check (has_capability('documents.view'));


-- Employment. Your own record, or people.manage. This is the table with
-- the salaries in it.
create policy staff_details_read on staff_details
  for select to authenticated
  using (has_capability('people.manage') or profile_id = my_profile_id());

create policy staff_details_write on staff_details
  for all to authenticated
  using (has_capability('people.manage'))
  with check (has_capability('people.manage'));

create policy attendance_read on attendance
  for select to authenticated
  using (has_capability('people.view') or staff_id = my_profile_id());

create policy attendance_insert on attendance
  for insert to authenticated
  with check (has_capability('people.manage') or staff_id = my_profile_id());

-- No update, no delete. For Reza this is the pay record, and a pay
-- record that can be quietly edited is not one.

create policy leave_read on leave_requests
  for select to authenticated
  using (has_capability('people.view') or staff_id = my_profile_id());

create policy leave_insert on leave_requests
  for insert to authenticated
  with check (has_capability('people.manage') or (staff_id = my_profile_id() and status = 'requested'));

-- Approving your own leave is the obvious hole, so it is closed here
-- rather than in the screen that offers the button.
create policy leave_update on leave_requests
  for update to authenticated
  using (has_capability('people.manage') or (staff_id = my_profile_id() and status = 'requested'))
  with check (
    (has_capability('people.manage') and approved_by <> staff_id)
    or (staff_id = my_profile_id() and status = 'requested')
  );

create policy staff_reviews_read on staff_reviews
  for select to authenticated
  using (has_capability('people.manage') or staff_id = my_profile_id());

create policy staff_reviews_write on staff_reviews
  for all to authenticated
  using (has_capability('people.manage'))
  with check (has_capability('people.manage'));


-- Notifications. Yours and nobody else's, in every direction. There is
-- no capability that grants reading somebody else's notifications,
-- because there is no reason for one.
create policy notifications_read on notifications
  for select to authenticated using (profile_id = my_profile_id());

create policy notifications_update on notifications
  for update to authenticated
  using (profile_id = my_profile_id())
  with check (profile_id = my_profile_id());

-- Inserts come from the service role — the scheduled jobs and the app's
-- own server-side paths. A browser cannot queue a notification to
-- somebody else, which is the point.

create policy notification_prefs_all on notification_prefs
  for all to authenticated
  using (profile_id = my_profile_id())
  with check (profile_id = my_profile_id());

create policy push_subscriptions_all on push_subscriptions
  for all to authenticated
  using (profile_id = my_profile_id())
  with check (profile_id = my_profile_id());


-- The audit trail. Readable by whoever holds audit.view; written only
-- through record_audit(), which is SECURITY DEFINER. No insert policy
-- exists, so nothing can write a line straight into it.
create policy audit_read on audit_log
  for select to authenticated using (has_capability('audit.view'));


-- ---------- 5. the shorthand does not outlive the file ----------

-- grant_table() writes policies, which means anybody who could call it
-- could write themselves a policy. It has done its work.
drop function grant_table(text, text, text);

-- ============================================================
-- 20260828001500_functions_cron.sql
-- ============================================================

-- ============================================================
-- The work that happens whether or not anybody opens the app.
--
-- Five jobs, all on Dubai time. pg_cron schedules in UTC, so every
-- schedule below is written as UTC with the Dubai time it corresponds
-- to in the comment. Dubai does not observe daylight saving, so UTC+4
-- holds all year and there is no seasonal drift to allow for.
--
-- The day builder is the one that matters most. It runs at 05:00 so
-- that the day exists before Rosie is up, which means push can fire
-- against real tasks and the checklist is never empty on a bad
-- connection.
--
-- The 09:00 pair are the running sheet's whole reason for existing: a
-- reminder before, a late flag after. A sheet that goes out at 09:40
-- has already missed Marvin's shopping run.
-- ============================================================


-- ---------- 1. build tomorrow's day ----------

-- The same rules as buildDay() in src/lib/schedule.ts, which is
-- deliberate and is a real duplication with a real cost: change the
-- recurrence rules in one and the other is wrong. It is accepted
-- because the alternative is a day that only exists once somebody opens
-- the app, and the whole point of a 05:00 job is that it does not.
create or replace function build_day(d date) returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  s settings%rowtype;
  -- Prefixed, because library_tasks and areas both have columns called
  -- dow and parity. An unqualified `dow` inside the INSERT below is
  -- ambiguous, and Postgres is right to refuse it.
  v_dow smallint;
  v_dom smallint;
  v_parity smallint;
  made integer := 0;
begin
  select * into s from settings limit 1;
  if not found then
    raise exception 'build_day: no settings row. Run seed.sql.';
  end if;

  -- Already built. Never rebuild over a day somebody has been ticking.
  if exists (select 1 from task_instances where date = d) then
    return 0;
  end if;

  v_dow := extract(dow from d)::smallint;
  v_dom := extract(day from d)::smallint;
  v_parity := (((d - s.parity_epoch) / 7) % 2)::smallint;

  insert into task_instances (
    date, library_id, category_id, title, instructions, area_id, area_name,
    zone, role, assigned_to, scheduled_at, est_minutes, group_as, source,
    source_ref, sort_order
  )
  select
    d,
    t.id,
    t.category_id,
    case when a.id is null then t.text else t.text || ' — ' || a.name end,
    t.instructions,
    a.id,
    a.name,
    coalesce(a.zone, 'household'),
    t.role,
    route_to(t.role, d, t.id, t.default_time),
    t.default_time,
    t.est_minutes,
    coalesce(nullif(t.group_as, ''), a.name, ''),
    'library',
    t.id,
    coalesce(c.sort_order, 50) * 1000 + t.sort_order
  from library_tasks t
  join task_categories c on c.id = t.category_id
  -- The area join is the apply scope. A global task has no area, which
  -- is why this is a left join against a subquery rather than a plain one.
  left join areas a
    on a.active
   and (
     (t.apply = 'area' and a.id = t.area_id)
     or (t.apply = 'areaType' and a.type = t.area_type and (t.zone = 'any' or a.zone::text = t.zone))
     or (t.apply = 'zone' and (t.zone = 'any' or a.zone::text = t.zone))
   )
  where t.active
    and (t.apply <> 'global' or a.id is null)
    -- Recurrence.
    and case t.freq
          when 'daily' then true
          when 'weekdays' then v_dow = any (s.working_days)
          when 'weekly' then v_dow = t.dow
          when 'fortnightly' then v_dow = t.dow and v_parity = t.parity
          when 'monthly' then v_dow = t.dow and v_dom <= 7
          when 'areaDeep' then
            a.id is not null
            and a.deep_freq > 0
            and v_dow = a.deep_dow
            and (a.deep_freq = 7
                 or (a.deep_freq = 14 and v_parity = a.parity)
                 or (a.deep_freq = 30 and v_dom <= 7))
          else false
        end
    -- Unused rooms run only the light tasks, and only on set days.
    and (a.id is null or a.status <> 'unused' or t.light or v_dow = any (s.unused_dows));

  get diagnostics made = row_count;

  perform record_audit('build', 'day', d::text, format('Built %s tasks for %s', made, d));
  return made;
end;
$$;

comment on function build_day(date) is
  'Materialises a day from the task library. Mirrors buildDay() in src/lib/schedule.ts — a real duplication, accepted so the day exists at 05:00 rather than when somebody opens the app.';


-- Who a task goes to. The same four steps as routeTo() in the app:
-- whoever holds the role, is working, and is on shift at the hour the
-- task wants; then the coverage rule; then anyone working; then nobody.
create or replace function route_to(
  p_role staff_role,
  d date,
  p_key text,
  p_at time default null
) returns text
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_dow smallint := extract(dow from d)::smallint;
  chosen text;
  pool text[];
begin
  -- Holders of the role who are working today and on shift at that hour.
  select array_agg(p.id order by p.id) into pool
  from profiles p
  join roles r on r.id = p.role and r.works and r.active
  join shifts sh on sh.staff_id = p.id
  where p.active
    and (p_role = any (p.staff_roles) or 'any' = any (p.staff_roles))
    and v_dow = any (sh.days)
    and not exists (
      select 1 from absences ab
      where ab.staff_id = p.id and d between ab.from_date and ab.to_date
    )
    and (p_at is null or (p_at >= sh.start_time and p_at <= sh.end_time));

  -- Nobody on shift at that hour: fall back to anyone holding the role
  -- who is in today at all.
  if pool is null then
    select array_agg(p.id order by p.id) into pool
    from profiles p
    join roles r on r.id = p.role and r.works and r.active
    join shifts sh on sh.staff_id = p.id
    where p.active
      and (p_role = any (p.staff_roles) or 'any' = any (p.staff_roles))
      and v_dow = any (sh.days)
      and not exists (
        select 1 from absences ab
        where ab.staff_id = p.id and d between ab.from_date and ab.to_date
      );
  end if;

  -- Spread the work rather than giving it all to whoever sorts first,
  -- and do it stably, so the same task lands on the same person each
  -- day. hashtext is deterministic within a major version, which is all
  -- this needs.
  if pool is not null and array_length(pool, 1) > 0 then
    return pool[(abs(hashtext(coalesce(p_key, p_role::text))) % array_length(pool, 1)) + 1];
  end if;

  select cr.cover_staff_id into chosen
  from coverage_rules cr
  join shifts sh on sh.staff_id = cr.cover_staff_id
  where cr.role = p_role
    and v_dow = any (sh.days)
    and not exists (
      select 1 from absences ab
      where ab.staff_id = cr.cover_staff_id and d between ab.from_date and ab.to_date
    )
  limit 1;

  return chosen;
end;
$$;

comment on function route_to(staff_role, date, text, time) is
  'Auto-routing. Spread deterministically across everyone qualified and on shift, so Rosie does not collect every housekeeping task while Reza shows zero.';


-- ---------- 2. open tomorrow's running sheet ----------

create or replace function ensure_sheet(d date) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  sheet_id uuid;
  obs observances%rowtype;
  n smallint;
begin
  select id into sheet_id from running_sheets where date = d;
  if found then
    return sheet_id;
  end if;

  select * into obs from observances where active and d between start_date and end_date limit 1;
  n := case when obs.id is null then null else (d - obs.start_date + 1)::smallint end;

  insert into running_sheets (date, occasion, occasion_day_no)
  values (
    d,
    case
      when obs.id is null then ''
      else ordinal_day(n) || ' day of ' || regexp_replace(obs.name, '^The ', 'the ')
    end,
    n
  )
  returning id into sheet_id;

  return sheet_id;
end;
$$;

comment on function ensure_sheet(date) is 'Opens a blank sheet for a date, headed with the day of the observance where one is running.';


create or replace function ordinal_day(n smallint) returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select n::text || case
    when n % 100 between 11 and 13 then 'th'
    when n % 10 = 1 then 'st'
    when n % 10 = 2 then 'nd'
    when n % 10 = 3 then 'rd'
    else 'th'
  end;
$$;

comment on function ordinal_day(smallint) is 'Turns 9 into 9th. Written once, because the sheet, the export and the reminder all print it.';


-- ---------- 3. the 09:00 pair ----------

-- Before. Whoever is preparing it, and Earl, are told the sheet is due.
create or replace function remind_sheet_due() returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  s settings%rowtype;
  sheet running_sheets%rowtype;
  sent integer := 0;
  p record;
begin
  select * into s from settings limit 1;
  select * into sheet from running_sheets where date = current_date;

  if sheet.id is null or sheet.status = 'posted' then
    return 0;
  end if;

  for p in
    select pr.id
    from profiles pr
    join roles r on r.id = pr.role and r.active
    join role_capabilities rc on rc.role_id = r.id
    where pr.active and pr.can_sign_in and rc.capability in ('sheet.post', 'sheet.check')
    group by pr.id
  loop
    if should_send_now(p.id, 'task_reminder', 'normal') then
      insert into notifications (profile_id, kind, title, body, url, priority)
      values (
        p.id, 'task_reminder',
        'Today''s running sheet is due',
        format('It goes to the %s group by %s. %s', s.whatsapp_group, to_char(s.sheet_post_by, 'HH24:MI'),
               case
                 when sheet.prayers_start is null and sheet.meals is null then 'The prayer start time and the number of meals are both still blank.'
                 when sheet.prayers_start is null then 'The prayer start time is still blank.'
                 when sheet.meals is null then 'The number of meals is still blank.'
                 else 'It is filled in and needs checking.'
               end),
        '#/sheet', 'normal'
      );
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$$;

comment on function remind_sheet_due() is 'The nudge before 09:00, sent to whoever can post or check the sheet. Says which field is blank, because that is the actionable part.';


-- After. The sheet is late, and the whole point of the deadline is
-- that being late is visible rather than quietly normal.
create or replace function flag_sheet_late() returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  s settings%rowtype;
  sheet running_sheets%rowtype;
  sent integer := 0;
  p record;
begin
  select * into s from settings limit 1;
  select * into sheet from running_sheets where date = current_date;

  if sheet.id is null or sheet.status = 'posted' then
    return 0;
  end if;

  perform record_audit('late', 'running_sheet', current_date::text,
                       format('Not posted by %s', to_char(s.sheet_post_by, 'HH24:MI')));

  for p in
    select pr.id
    from profiles pr
    join roles r on r.id = pr.role and r.active
    join role_capabilities rc on rc.role_id = r.id
    where pr.active and pr.can_sign_in and rc.capability = 'sheet.check'
    group by pr.id
  loop
    insert into notifications (profile_id, kind, title, body, url, priority)
    values (p.id, 'task_reminder', 'The running sheet is late',
            format('The %s group has not had today''s sheet. A sheet that goes out at 09:40 has already missed the shopping run.', s.whatsapp_group),
            '#/sheet', 'high');
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

comment on function flag_sheet_late() is 'The flag after 09:00. High priority rather than urgent — it is late, not on fire, and urgent is reserved for what wakes people.';


-- ---------- 4. the expiry and stock sweeps ----------

create or replace function sweep_expiries() returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  s settings%rowtype;
  horizon date;
  raised integer := 0;
  r record;
  mgr record;
begin
  select * into s from settings limit 1;
  horizon := current_date + s.alert_lead_days;

  for r in
    select 'Warranty' as kind, a.name as what, a.warranty_end as due, '#/property' as url
      from assets a where a.active and a.warranty_end between current_date - 365 and horizon
    union all
    select 'Service', a.name, a.service_next, '#/property'
      from assets a where a.active and a.service_next is not null and a.service_next <= horizon
    union all
    select 'Registration', v.name, v.registration_expiry, '#/property'
      from vehicles v where v.active and v.registration_expiry <= horizon
    union all
    select 'Insurance', v.name, v.insurance_expiry, '#/property'
      from vehicles v where v.active and v.insurance_expiry <= horizon
    union all
    select 'Contract', sc.name, sc.contract_end, '#/register'
      from service_contracts sc where sc.active and sc.contract_end <= horizon
    union all
    select 'Document', d.title, d.expiry_date, '#/documents'
      from documents d where d.expiry_date is not null and d.expiry_date <= current_date + d.reminder_days
  loop
    for mgr in
      select pr.id from profiles pr
      join roles r2 on r2.id = pr.role and r2.active
      join role_capabilities rc on rc.role_id = r2.id
      where pr.active and pr.can_sign_in and rc.capability = 'property.view'
      group by pr.id
    loop
      if should_send_now(mgr.id, 'expiry', 'normal') then
        insert into notifications (profile_id, kind, title, body, url, priority)
        values (mgr.id, 'expiry', format('%s — %s', r.what, r.kind),
                case when r.due < current_date
                     then format('Overdue by %s days.', current_date - r.due)
                     else format('Due in %s days.', r.due - current_date) end,
                r.url,
                case when r.due < current_date then 'high' else 'normal' end);
        raised := raised + 1;
      end if;
    end loop;
  end loop;

  return raised;
end;
$$;

comment on function sweep_expiries() is 'The daily read of every date that expires. Warranties, services, registration, insurance, contracts and documents in one pass.';


-- Stock, and the divo in particular. Two spare bottles, always.
create or replace function sweep_stock() returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  low_count integer;
  divo_low boolean;
  raised integer := 0;
  p record;
begin
  select count(*) into low_count
  from inventory_items
  where active and qty < min_qty and not prayer_item;

  select exists (
    select 1 from divo_log
    where oil_level in ('low', 'empty')
      and logged_at > now() - interval '24 hours'
  ) into divo_low;

  if low_count = 0 and not divo_low then
    return 0;
  end if;

  for p in
    select pr.id from profiles pr
    join roles r on r.id = pr.role and r.active
    join role_capabilities rc on rc.role_id = r.id
    where pr.active and pr.can_sign_in and rc.capability = 'inventory.edit'
    group by pr.id
  loop
    if divo_low and should_send_now(p.id, 'stock_low', 'high') then
      insert into notifications (profile_id, kind, title, body, url, priority)
      values (p.id, 'stock_low', 'The divo oil is low',
              'Logged low or empty in the last day. Two spare bottles, always — it burns down over about three days and Marvin buys it first thing.',
              '#/inventory', 'high');
      raised := raised + 1;
    end if;
    if low_count > 0 and should_send_now(p.id, 'stock_low', 'normal') then
      insert into notifications (profile_id, kind, title, body, url, priority)
      values (p.id, 'stock_low', format('%s items below minimum', low_count),
              'On the shopping list. Prayer-marked stock is excluded — it is not available to use.',
              '#/inventory', 'normal');
      raised := raised + 1;
    end if;
  end loop;

  return raised;
end;
$$;

comment on function sweep_stock() is 'Low stock, and the divo. Prayer-marked items are excluded from the count because they are not stock anybody may use.';


-- ---------- 5. the schedule ----------

-- All times UTC. Dubai is UTC+4 all year — no daylight saving, so these
-- do not drift.
select cron.schedule('build-tomorrow',   '0 1 * * *',  $$select build_day(current_date + 1), ensure_sheet(current_date + 1)$$);  -- 05:00 Dubai
select cron.schedule('build-today',      '30 1 * * *', $$select build_day(current_date), ensure_sheet(current_date)$$);          -- 05:30 Dubai, a safety net
select cron.schedule('sheet-due',        '0 4 * * *',  $$select remind_sheet_due()$$);                                            -- 08:00 Dubai
select cron.schedule('sheet-late',       '15 5 * * *', $$select flag_sheet_late()$$);                                             -- 09:15 Dubai
select cron.schedule('sweep-expiries',   '0 3 * * *',  $$select sweep_expiries()$$);                                              -- 07:00 Dubai
select cron.schedule('sweep-stock',      '0 3 * * *',  $$select sweep_stock()$$);                                                 -- 07:00 Dubai

-- Deliveries are sent by the push Edge Function, which reads the queue.
-- Scheduling it here rather than in the function keeps every clock in
-- this schema in one file.
select cron.schedule('push-queue', '*/2 * * * *', $$
  select net.http_post(
    url := current_setting('app.functions_url', true) || '/push-send',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  )
  where current_setting('app.functions_url', true) is not null
$$);

comment on extension pg_cron is 'Holds the clock for the 05:00 day build and the 09:00 sheet deadline. Schedules are UTC; Dubai is UTC+4 all year.';

-- ============================================================
-- 20260828001600_storage.sql
-- ============================================================

-- ============================================================
-- The file store.
--
-- One private bucket. Nothing in it is publicly readable, and there is
-- no route by which it could become so: the app asks for a signed link
-- each time a file is opened, and that link expires. A public bucket
-- would mean a photograph of the inside of somebody's bedroom, or a
-- passport scan, sitting on a guessable URL forever.
--
-- Paths are prefixed by what the file belongs to:
--
--   issues/<issue-id>/<file>        photographs of a fault
--   incidents/<incident-id>/<file>  photographs of an incident
--   sheets/<date>/<file>            the set-up and clear-up photographs
--   assets/<asset-id>/<file>        the thing itself, and its manual
--   documents/<document-id>/<file>  warranties, contracts, visas
--   receipts/<profile-id>/<file>    petty cash receipts
--
-- The prefix is what the policies read. It is not decoration: a policy
-- cannot look inside a photograph to decide who may see it, so the
-- folder has to carry the answer.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'house-files',
  'house-files',
  false,
  -- 20MB. Photographs are shrunk on the device before upload — a camera
  -- snap becomes roughly 150KB — so this ceiling is really for PDFs:
  -- a scanned warranty booklet or a tenancy contract.
  20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

comment on table storage.buckets is 'house-files is private. Every read is a short-lived signed link; there is no public path to any object in it.';


-- ---------- reading ----------

-- Which prefix a person may read is the same question as which table
-- they may read, so the policy asks the same function the table
-- policies do. A role that cannot see documents cannot fetch the PDF
-- either, which is the hole that a bucket policy written by hand
-- usually leaves open.
create policy "house files are read by capability"
on storage.objects for select
to authenticated
using (
  bucket_id = 'house-files'
  and case (storage.foldername(name))[1]
        when 'issues' then has_capability('issue.viewAll') or has_capability('issue.raise')
        when 'incidents' then has_capability('issue.viewAll')
        when 'sheets' then has_capability('sheet.view')
        when 'assets' then has_capability('property.view')
        when 'documents' then has_capability('documents.view')
        when 'receipts' then has_capability('money.view')
                            or (storage.foldername(name))[2] = my_profile_id()
        else false
      end
);


-- ---------- writing ----------

create policy "house files are written by capability"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'house-files'
  and case (storage.foldername(name))[1]
        when 'issues' then has_capability('issue.raise')
        when 'incidents' then has_capability('issue.raise')
        when 'sheets' then has_capability('sheet.edit')
        when 'assets' then has_capability('property.edit')
        when 'documents' then has_capability('documents.view')
        -- Anybody may photograph their own receipt. R19: cash spent is
        -- logged with receipts, and making that need a capability is
        -- how it stops happening.
        when 'receipts' then (storage.foldername(name))[2] = my_profile_id()
                            or has_capability('money.view')
        else false
      end
);


create policy "house files are replaced by capability"
on storage.objects for update
to authenticated
using (
  bucket_id = 'house-files'
  and case (storage.foldername(name))[1]
        when 'assets' then has_capability('property.edit')
        when 'documents' then has_capability('documents.view')
        else false
      end
);


-- ---------- deleting ----------

-- Narrow on purpose. A photograph of a fault is evidence and the person
-- who took it may have left; letting anyone with issue.raise delete one
-- would make the record worth less than the photograph.
create policy "house files are deleted by the few"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'house-files'
  and case (storage.foldername(name))[1]
        when 'assets' then has_capability('property.edit')
        when 'documents' then has_capability('documents.viewOwner')
        when 'receipts' then has_capability('money.viewOwner')
        else has_capability('settings.edit')
      end
);

-- ============================================================
-- seed.sql — the house's starting rows. Runs last.
-- ============================================================

-- ============================================================
-- The house's starting rows. Run once, after every migration.
--
-- This is not example data. It is apartment 3808 as it actually is on
-- the 28th of August 2026: the people, the rooms, the hierarchy, the
-- observance that runs to the 11th of September, the standing shopping
-- rows printed on every sheet, and the thirty-one daily checks.
--
-- Two things it deliberately does not do:
--
--   It does not create logins. A row in profiles is not a way to sign
--   in. Passwords are set from inside the app, by an owner, through the
--   admin-users Edge Function — see docs/DEPLOY.md step 3.
--
--   It does not invent a history. There are no fabricated ticks, no
--   made-up spending and no seeded issues, because a fabricated record
--   of who cleaned the shrine last Tuesday is worse than an empty one.
--   The first real day is the first day somebody uses it.
--
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING or an upsert.
-- ============================================================

begin;

-- ---------- the hierarchy ----------

insert into roles (id, name, rank, description, works, is_system) values
  ('owner',   'Owner',         100, 'The family principals. Everything, including owner-only spending and documents, and the power to create logins.', false, true),
  ('admin',   'Admin',          90, 'Runs the app on the household''s behalf. Everything an owner can do except see owner-only money and documents.', false, true),
  ('manager', 'House manager',  70, 'In charge of the day. Checks the running sheet before it goes out, assigns the work, closes issues. Sees household spending but not the owner''s.', false, true),
  ('staff',   'Staff',          50, 'Lives the day. Ticks the work off, fills the sheet in, counts the stock, logs the divo, reports anything broken.', true, true),
  ('helper',  'Helper',         30, 'Paid by the hour or on site for a session — the cooks, and anyone brought in for an occasion.', true, true),
  ('family',  'Family',         20, 'Lives here and is not staff. Reads the sheet, sees what is happening, can say something is broken.', false, true)
on conflict (id) do nothing;


-- The capability grid. Written as a cross join against a list rather
-- than sixty INSERT lines, so a reader can see the shape of each role
-- in one place instead of counting rows.
insert into role_capabilities (role_id, capability)
select 'owner', c from unnest(enum_range(null::capability)) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'admin', c from unnest(enum_range(null::capability)) c
where c not in ('money.viewOwner', 'documents.viewOwner')
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'manager', c from unnest(array[
  'day.view', 'day.tick', 'day.assign', 'library.edit',
  'sheet.view', 'sheet.edit', 'sheet.check', 'sheet.post',
  'issue.raise', 'issue.viewAll', 'issue.manage',
  'inventory.view', 'inventory.edit',
  'cooking.view', 'cooking.edit', 'cooking.approve',
  'money.view',
  'property.view', 'property.edit',
  'register.view', 'register.edit',
  'people.view', 'people.manage',
  'occasions.view', 'occasions.edit',
  'shrine.view', 'shrine.log',
  'documents.view',
  'audit.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'staff', c from unnest(array[
  'day.view', 'day.tick',
  'sheet.view', 'sheet.edit', 'sheet.post',
  'issue.raise', 'issue.viewAll',
  'inventory.view', 'inventory.edit',
  'cooking.view', 'cooking.edit',
  'register.view', 'register.edit',
  'occasions.view',
  'shrine.view', 'shrine.log',
  'documents.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'helper', c from unnest(array[
  'day.view', 'day.tick', 'sheet.view', 'issue.raise', 'inventory.view', 'cooking.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'family', c from unnest(array[
  'day.view', 'sheet.view', 'issue.raise', 'cooking.view', 'occasions.view', 'shrine.view'
]::capability[]) c
on conflict do nothing;


-- ---------- the people ----------

-- Real email addresses are needed for the accounts that will exist.
-- The @3808.local ones below are placeholders and must be replaced
-- before the logins are created — an account cannot be made against an
-- address that does not resolve.
insert into profiles (id, name, role, staff_roles, email, phone, initials, active, can_sign_in, is_household_member) values
  ('p-shrien',  'Shrien',        'owner',   '{}',                              'shrien@3808.local',                    '+971 50 000 0001', 'SH', true,  true,  true),
  ('p-aditya',  'Aditya Dave',   'owner',   '{priestcare}',                    'aditya.dave@evolvecaregroup.com',      '+971 50 000 0002', 'AD', true,  true,  true),
  ('p-salyna',  'Salyna',        'owner',   '{}',                              'salyna@3808.local',                    '+971 50 000 0021', 'SA', true,  true,  true),
  ('p-earl',    'Earl Tiongco',  'manager', '{}',                              'earl@3808.local',                      '+971 50 000 0003', 'ET', true,  true,  false),
  ('p-rosie',   'Rosie',         'staff',   '{housekeeping,cooking}',          'rosie@3808.local',                     '+971 50 000 0011', 'RO', true,  true,  false),
  ('p-reza',    'Reza',          'staff',   '{cooking,housekeeping}',          'reza@3808.local',                      '+971 50 000 0012', 'RE', true,  true,  false),
  ('p-marvin',  'Marvin',        'staff',   '{driver,housekeeping}',           'marvin@3808.local',                    '+971 50 000 0013', 'MA', true,  true,  false),
  ('p-jagdish', 'Jagdishbhai',   'helper',  '{cook}',                          '',                                     '+971 50 000 0014', 'JB', true,  false, false),
  ('p-hitesh',  'Hiteshbhai',    'helper',  '{cook}',                          '',                                     '+971 50 000 0015', 'HB', true,  false, false),
  ('p-priests', 'Priests',       'family',  '{}',                              '',                                     '',                 'PR', true,  false, false),
  ('p-charlie', 'Charlie',       'family',  '{}',                              'charlie@3808.local',                   '+971 50 000 0022', 'CH', true,  true,  true),
  ('p-aria',    'Aria',          'family',  '{}',                              '',                                     '',                 'AR', true,  false, true),
  ('p-noor',    'Noor',          'family',  '{}',                              '',                                     '',                 'NO', true,  false, true)
on conflict (id) do nothing;


-- Shifts. Straight off the running sheet: Rosie lives in and is on
-- until close-down, Reza comes at 14:00 for the prayers, the cooks are
-- on site for their session only. Each has one day off, which is what
-- makes the coverage rules below do real work.
insert into shifts (id, staff_id, days, start_time, end_time, day_off) values
  (gen_random_uuid(), 'p-rosie',   '{0,2,3,4,5,6}', '07:00', '22:00', 1),
  (gen_random_uuid(), 'p-reza',    '{0,1,3,4,5,6}', '14:00', '22:00', 2),
  (gen_random_uuid(), 'p-marvin',  '{0,1,2,4,5,6}', '09:00', '18:00', 3),
  (gen_random_uuid(), 'p-jagdish', '{0,1,2,3,4,5}', '15:00', '17:00', 6),
  (gen_random_uuid(), 'p-hitesh',  '{0,1,2,4,5,6}', '19:00', '21:00', 3)
on conflict do nothing;

insert into coverage_rules (id, role, zone, cover_staff_id, notes) values
  (gen_random_uuid(), 'driver',       'household', 'p-reza',   'Reza holds a licence and picks up the regular items.'),
  (gen_random_uuid(), 'housekeeping', 'household', 'p-reza',   'Essential household tasks only, on Rosie''s day off.'),
  (gen_random_uuid(), 'maintenance',  'household', 'p-marvin', 'Small repairs and anything that needs carrying. Anything electrical or plumbed goes to a vendor.'),
  (gen_random_uuid(), 'cooking',      'household', 'p-reza',   'Simple meals only — otherwise the household orders in.'),
  (gen_random_uuid(), 'cook',         'household', 'p-rosie',  'On the cooks'' days off Rosie reheats and makes the breads. Aditya is told the day before.'),
  (gen_random_uuid(), 'priestcare',   'household', 'p-earl',   'Earl stays with the priests if Aditya is away. Nothing about the shrine is decided without Aditya.')
on conflict do nothing;


-- ---------- the house ----------

insert into settings (
  id, house, address, whatsapp_group, sheet_post_by, checked_by_name,
  currency, locale, meal_times, portion_default,
  working_days, working_start, working_end,
  observance_from, observance_to,
  alert_lead_days, laundry_stages, unused_dows, plan_start, plan_end, parity_epoch
) values (
  true,
  'Goldcrest Views 3808',
  'Goldcrest Views 1, Jumeirah Lakes Towers, Cluster V, Dubai',
  '3808 Home',
  '09:00',
  'Earl Tiongco',
  'AED',
  'en-AE',
  '{"Breakfast": "08:00", "Lunch": "13:30", "Dinner": "19:30"}'::jsonb,
  4,
  '{0,1,2,3,4}', '09:00', '18:00',
  '2026-08-13', '2026-09-11',
  30,
  '{Wash,Dry,Fold,Iron,"Put away"}',
  '{1,5}',
  '06:00', '22:00',
  '2026-08-24'
)
on conflict (id) do nothing;


insert into areas (id, name, type, zone, floor, status, deep_freq, deep_dow, parity, use_level, standard) values
  ('a-sh1', 'Shrine',              'shrine',      'household', '38', 'active',    7, 1, 0, null,   'Dusted with the shrine cloth only — no sprays, no chemicals. Statues not moved. Used matchsticks and ash cleared. Divo lit and topped up with the correct oil.'),
  ('a-pr1', 'Prayer Area',         'prayer',      'household', '38', 'active',    7, 6, 0, null,   'Mats and seating square and laid out for the number expected. Mics tested. Cleared and put back after every sitting. Ken never in here.'),
  ('a-lv1', 'Lounge',              'living',      'household', '38', 'active',   14, 3, 0, null,   'Cushions plumped, surfaces clear, no cooking smell, lights set warm for the evening.'),
  ('a-lv2', 'Dining Room',         'living',      'household', '38', 'active',   14, 3, 1, null,   'Table laid to standard, chairs aligned and evenly spaced.'),
  ('a-kt1', 'Kitchen',             'kitchen',     'household', '38', 'active',    7, 4, 0, null,   'Empty countertops, dry sink, polished tap. No meat in here during the observance. Shrine items washed with the shrine sponge only.'),
  ('a-ba3', 'Guest Toilet',        'bathroom',    'household', '38', 'active',    7, 2, 0, 'high', 'Spotless and stocked. Checked and toilet paper restocked every 20 minutes while the prayers run.'),
  ('a-br1', 'Master Bedroom',      'bedroom',     'household', '38', 'occupied', 14, 1, 0, null,   'Symmetrical, calm, no personal clutter visible from the doorway.'),
  ('a-br2', 'Bedroom 2',           'bedroom',     'household', '38', 'occupied', 14, 2, 0, null,   'Symmetrical, calm, no personal clutter visible from the doorway.'),
  ('a-br3', 'Bedroom 3 — Guest',   'bedroom',     'household', '38', 'guest',    14, 3, 1, null,   'Kept permanently guest-ready. Used by the priests when they stay.'),
  ('a-ot1', 'Balcony — main',      'outdoor',     'household', '38', 'active',   14, 6, 0, null,   'No sand or leaf litter, furniture square, glass clear. Reza from 17:00.'),
  ('a-ot2', 'Balcony — second',    'outdoor',     'household', '38', 'active',   14, 6, 1, null,   'Swept and clear. The door is the draught that puts the divo out — keep it shut during prayers.'),
  ('a-cr1', 'Entrance & Hallway',  'circulation', 'household', '38', 'active',    7, 5, 0, null,   'First thing a guest sees. Shoes off here. Floor dry, glass clear, nothing stored here.'),
  ('a-ut1', 'Laundry & Utility',   'utility',     'household', '38', 'active',   14, 6, 0, null,   'Machines wiped, filters clear, floor dry, nothing left in a drum overnight.'),
  ('a-st2', 'Store',               'storage',     'household', '38', 'active',   30, 6, 0, null,   'Stock visible and countable from the door. Divo oil, wicks and matches always two deep.')
on conflict (id) do nothing;


-- ---------- the observance ----------

-- Thirty days, 13 August to 11 September 2026, both confirmed. Day one
-- was first worked out from the source document — the sheet dated Friday
-- 21 August is headed '9th day of the Prayer' — and that reading was
-- right. These two dates drive the occasion line on every sheet and the
-- window enforce_food_rule() refuses meat in.
insert into observances (id, name, start_date, end_date, day_count, notes, active) values (
  'ob-prayer', 'The Prayer', '2026-08-13', '2026-09-11', 30,
  'The priests lead every afternoon from 16:00 and the meal follows the aarti. The ninth day was the large sitting. All food is vegetarian for the whole thirty days.',
  true
)
on conflict (id) do nothing;


-- ---------- how the work is grouped ----------

insert into task_categories (id, name, icon, sort_order, zone, system, active) values
  ('c-shrine',   'Shrine & Prayers',   '🪔',  1, 'household', null,        true),
  ('c-open',     'Opening up',         '🌅',  2, 'household', null,        true),
  ('c-kitchen',  'Kitchen',            '🍳',  3, 'household', null,        true),
  ('c-bath',     'Bathrooms',          '🛁',  4, 'household', null,        true),
  ('c-bed',      'Bedrooms',           '🛏',  5, 'household', null,        true),
  ('c-living',   'Living areas',       '🛋',  6, 'household', null,        true),
  ('c-outdoor',  'Outside',            '🌿',  7, 'household', null,        true),
  ('c-cat',      'Cat care',           '🐱',  8, 'household', null,        true),
  ('c-close',    'Close-down',         '🌙',  9, 'household', null,        true),
  ('c-laundry',  'Laundry',            '🧺', 10, 'household', 'laundry',   true),
  ('c-cooking',  'Cooking',            '👨‍🍳', 11, 'household', 'cooking',   true),
  ('c-occasion', 'Occasions',          '✦',  12, 'household', 'occasion',  true),
  ('c-plants',   'Plants',             '🪴', 13, 'household', 'plants',    true),
  ('c-contract', 'Contracts & visits', '🔧', 14, 'household', 'contracts', true)
on conflict (id) do nothing;


-- The starting task library. Small on purpose. Everything here is
-- something the running sheet or the house standards already say out
-- loud; anything else is for Earl and Rosie to add from the app, where
-- adding a task and having it appear every day from then on is a
-- two-minute job rather than a code change.
insert into library_tasks (id, category_id, text, apply, area_type, area_id, zone, freq, dow, parity, instructions, role, default_time, est_minutes, group_as, light, sort_order) values
  ('lt-divo-am',   'c-shrine',  'Divo lit and topped up — correct oil only',              'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'Correct oil only. If the level is low or empty, log it — Earl is told automatically.', 'housekeeping', '07:15', 5,  'Shrine',        false, 0),
  ('lt-shrine-dust','c-shrine', 'Dust the shrine with the shrine cloth',                  'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'The shrine cloth only. No sprays, no chemicals. Statues are not moved — not to dust behind, not to make room.', 'housekeeping', '07:20', 10, 'Shrine',        false, 1),
  ('lt-shrine-ash','c-shrine',  'Clear used matchsticks and ash',                         'area',     null,       'a-sh1', 'household', 'daily',    0, 0, '', 'housekeeping', '07:30', 5,  'Shrine',        false, 2),
  ('lt-shrine-stock','c-shrine','Check matches, wicks and two spare bottles of divo oil', 'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'Two spare. Not one — the divo burns down over about three days and Marvin buys the oil first thing.', 'housekeeping', '07:35', 5, 'Shrine', false, 3),
  ('lt-prayer-set','c-shrine',  'Prayer set-up — mats, mics, flowers, incense, prasad',   'area',     null,       'a-pr1', 'household', 'daily',    0, 0, 'Finished by 15:45. Mics on and tested. Drinking water and clean glasses ready for the breaks.', 'housekeeping', '14:30', 45, 'Prayer area',  false, 4),
  ('lt-prayer-reset','c-shrine','Clear the prayer area and put it back',                  'area',     null,       'a-pr1', 'household', 'daily',    0, 0, 'After the meal. Shrine items washed with the shrine sponge only.', 'housekeeping', '21:30', 25, 'Close-down',  false, 5),

  ('lt-open-house','c-open',    'Open up — blinds, air the rooms, first pass of the hall','global',   null,       null,    'household', 'daily',    0, 0, 'No cooking smell in the lounge. Shoes off at the entrance.', 'housekeeping', '07:00', 15, 'Opening up', false, 0),
  ('lt-shopping-list','c-open', 'Write today''s list of anything needed',                 'global',   null,       null,    'household', 'daily',    0, 0, 'By 09:00, so Marvin has it for the morning run. Milk and yoghurt daily — only buy the yoghurt if it is finished or nearly.', 'housekeeping', '09:00', 10, 'Opening up', false, 1),

  ('lt-kitchen-reset','c-kitchen','Kitchen reset — counters, sink, tap',                  'area',     null,       'a-kt1', 'household', 'daily',    0, 0, 'Empty countertops, dry sink, polished tap. No meat in here during the observance.', 'cooking', '10:00', 20, 'Kitchen', false, 0),
  ('lt-kitchen-close','c-kitchen','Kitchen back to normal after the meal',                'area',     null,       'a-kt1', 'household', 'daily',    0, 0, 'Leftovers covered, labelled and dated. Shrine items washed with the shrine sponge only.', 'cooking', '21:45', 25, 'Close-down', false, 1),

  ('lt-guest-wc',  'c-bath',    'Guest toilet — clean and restock',                       'area',     null,       'a-ba3', 'household', 'daily',    0, 0, 'Spotless and stocked. During the prayers this is every twenty minutes, logged on the sheet.', 'housekeeping', '13:00', 10, 'Bathrooms', false, 0),
  ('lt-bath-daily','c-bath',    'Bathroom — surfaces, mirror, floor',                     'areaType', 'bathroom', null,    'household', 'daily',    0, 0, '', 'housekeeping', '11:00', 12, 'Bathrooms', true,  1),

  ('lt-bed-daily', 'c-bed',     'Make the bed and clear surfaces',                        'areaType', 'bedroom',  null,    'household', 'daily',    0, 0, 'Symmetrical, calm, nothing personal visible from the doorway.', 'housekeeping', '10:30', 12, 'Bedrooms', true, 0),
  ('lt-bed-deep',  'c-bed',     'Deep clean the room',                                    'areaType', 'bedroom',  null,    'household', 'areaDeep', 0, 0, '', 'housekeeping', null,   45, 'Bedrooms', false, 1),

  ('lt-living',    'c-living',  'Living area — cushions, surfaces, floor',                'areaType', 'living',   null,    'household', 'daily',    0, 0, 'Dining room, lounge and balcony clear and tidy before the first guest arrives. No cat bowls or cleaning things on show.', 'housekeeping', '11:30', 15, 'Living areas', false, 0),
  ('lt-hall',      'c-living',  'Entrance and hallway',                                   'area',     null,       'a-cr1', 'household', 'daily',    0, 0, 'The first thing a guest sees. Floor dry, glass clear, nothing stored here.', 'housekeeping', '11:45', 10, 'Living areas', false, 1),

  ('lt-balcony',   'c-outdoor', 'Balcony — sweep and square the furniture',               'areaType', 'outdoor',  null,    'household', 'daily',    0, 0, 'Reza from 17:00. Keep the second balcony door shut during prayers — it is the draught that puts the divo out.', 'housekeeping', '17:00', 15, 'Outside', false, 0),

  ('lt-ken-feed',  'c-cat',     'Feed Ken and refresh his water',                         'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '07:45', 5, 'Ken', false, 0),
  ('lt-ken-tray',  'c-cat',     'Ken''s tray',                                            'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '08:00', 5, 'Ken', false, 1),
  ('lt-ken-away',  'c-cat',     'Ken shut away from the prayer area and the open doors',  'global',   null,       null,    'household', 'daily',    0, 0, 'Before the first guest arrives, and checked again during the prayers.', 'housekeeping', '15:00', 5, 'Ken', false, 2),

  ('lt-bins',      'c-close',   'Empty every bin',                                        'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '21:50', 10, 'Close-down', false, 0),
  ('lt-divo-pm',   'c-close',   'Check the divo and top it up before bed',                'area',     null,       'a-sh1', 'household', 'daily',    0, 0, 'The last thing on the list, and it is on the list for a reason.', 'housekeeping', '22:00', 5, 'Close-down', false, 1),
  ('lt-photos',    'c-close',   'Post the set-up and clear-up photographs on the group',  'global',   null,       null,    'household', 'daily',    0, 0, 'R18. The photograph existing is not the point — it being on the 3808 Home group is the point.', 'housekeeping', '22:05', 5, 'Close-down', false, 2),
  ('lt-cash',      'c-close',   'Log any cash spent, with receipts',                      'global',   null,       null,    'household', 'daily',    0, 0, 'R19. Photograph the receipt as you log it, not later.', 'housekeeping', '22:10', 5, 'Close-down', false, 3),
  ('lt-tell-earl', 'c-close',   'Anything broken, missing or missed — tell Earl',         'global',   null,       null,    'household', 'daily',    0, 0, 'R20. The same day. Not tomorrow.', 'housekeeping', '22:15', 5, 'Close-down', false, 4),

  ('lt-store',     'c-close',   'Store — stock visible and countable from the door',      'area',     null,       'a-st2', 'household', 'weekly',   6, 0, 'Divo oil, wicks and matches always two deep.', 'housekeeping', null, 20, 'Store', false, 5)
on conflict (id) do nothing;


-- ---------- stock ----------

insert into inventory_categories (id, name, zone, sort_order) values
  ('ic-prayer',  'Prayer & shrine',   'household', 1),
  ('ic-kitchen', 'Kitchen & pantry',  'household', 2),
  ('ic-clean',   'Cleaning',          'household', 3),
  ('ic-laundry', 'Laundry',           'household', 4),
  ('ic-bath',    'Bathroom',          'household', 5),
  ('ic-cat',     'Ken',               'household', 6)
on conflict (id) do nothing;

-- The prayer and shrine rows carry the two flags that exist nowhere
-- else in the schema, and they are the reason this section is seeded at
-- all rather than left to whoever first opens Inventory.
insert into inventory_items (name, category_id, zone, qty, min_qty, unit, recurring, notes, prayer_item, shrine_only) values
  ('Divo oil',                'ic-prayer',  'household', 2,  2, 'bottles', true,  'Two spare, always. It burns down over about three days and Marvin buys it first thing.', false, false),
  ('Wicks',                   'ic-prayer',  'household', 40, 20, 'units',  true,  '', false, false),
  ('Matches',                 'ic-prayer',  'household', 4,  2, 'boxes',   true,  '', false, false),
  ('Incense',                 'ic-prayer',  'household', 6,  3, 'packs',   true,  '', false, false),
  ('Fresh flowers',           'ic-prayer',  'household', 1,  1, 'sets',    true,  'For the set-up. Marvin, first thing.', false, false),
  ('Shrine cloth',            'ic-prayer',  'household', 2,  1, 'units',   false, 'Shrine only. Never a spray, never a chemical. If it cannot be found, say so and wait — do not substitute.', false, true),
  ('Shrine sponge',           'ic-prayer',  'household', 2,  1, 'units',   false, 'Shrine only. Never meat, never the normal washing-up.', false, true),
  ('Milk — prayer marked',    'ic-prayer',  'household', 0,  0, 'litres',  false, 'Brought for prayer. Marked on the lid and never used for consumption. If a container is not marked, treat it as prayer stock and ask.', true,  false),
  ('Yoghurt — prayer marked', 'ic-prayer',  'household', 0,  0, 'kg',      false, 'Brought for prayer. Marked and set aside.', true,  false),
  ('Fresh milk',              'ic-kitchen', 'household', 2,  2, 'litres',  true,  'Low fat. Bought daily by Marvin.', false, false),
  ('Yoghurt',                 'ic-kitchen', 'household', 1,  1, 'kg',      true,  'Checked daily — only buy if finished or nearly finished.', false, false),
  ('Basmati rice',            'ic-kitchen', 'household', 5,  2, 'kg',      false, '', false, false),
  ('Toilet paper',            'ic-bath',    'household', 24, 12, 'rolls',  true,  'The guest toilet goes through it during the prayers.', false, false),
  ('Bin bags',                'ic-clean',   'household', 60, 30, 'units',  true,  '', false, false),
  ('Laundry detergent',       'ic-laundry', 'household', 3,  2, 'bottles', true,  '', false, false),
  ('Cat litter',              'ic-cat',     'household', 3,  2, 'bags',    true,  'Same brand — Ken will not use the other one.', false, false)
on conflict do nothing;


-- The three standing rows printed on every running sheet. They are on
-- the list every day whether or not anyone adds them, which is what
-- 'standing' means.
insert into shopping_items (name, zone, qty, unit, status, added_by, notes, standing) values
  ('Daily items — milk and yoghurt',   'household', 1, 'run',     'needed', 'p-rosie', '2L low-fat fresh milk, 1kg yoghurt. Marvin. Mark the containers so prayer items are not used for consumption. Check the yoghurt daily — only buy if finished or nearly finished.', true),
  ('Oil for the divo',                 'household', 2, 'bottles', 'needed', 'p-rosie', 'Keep 2 spare. Marvin, first thing. Correct oil only.', true),
  ('Flowers, incense, matches, wicks', 'household', 1, 'set',     'needed', 'p-rosie', 'Marvin. Fresh flowers for the set-up.', true)
on conflict do nothing;


-- ---------- how spending is grouped ----------

-- Seeded because transactions point at these with a RESTRICT foreign
-- key: without them the Money screen opens empty and the first payment
-- anybody tries to enter is refused.
insert into expense_categories (id, name, kind, zone, sort_order) values
  ('ec-groc',     'Groceries & food',       'household',   'household',  1),
  ('ec-prayer',   'Prayer & shrine',        'household',   'household',  2),
  ('ec-hclean',   'Cleaning & consumables', 'supplies',    'household',  3),
  ('ec-cat',      'Ken',                    'household',   'household',  4),
  ('ec-hmaint',   'Maintenance & repairs',  'maintenance', 'household',  5),
  ('ec-util',     'Utilities',              'utilities',   'household',  6),
  ('ec-veh',      'Vehicles',               'vehicle',     'household',  7),
  ('ec-staff',    'Staff costs',            'staff',       'household',  8),
  ('ec-contract', 'Service contracts',      'maintenance', 'household',  9),
  ('ec-guest',    'Guests & entertaining',  'household',   'household', 10),
  ('ec-other',    'Other',                  'other',       'household', 11)
on conflict (id) do nothing;


-- ---------- the laundry rota ----------

insert into laundry_slots (dow, person, load_type, sort_order) values
  (0, 'Household', 'Catch-up & anything outstanding', 0),
  (1, 'Salyna',    'Clothing',                        0),
  (2, 'Charlie',   'Clothing',                        0),
  (3, 'Aria',      'Clothing',                        0),
  (4, 'Noor',      'Clothing',                        0),
  (5, 'Household', 'Towels',                          0),
  (6, 'Household', 'Bedding',                         0)
on conflict do nothing;


-- ---------- notification preferences ----------

-- Everybody gets everything, quiet from 22:00 to 06:30, until they say
-- otherwise. Defaulting people out of notifications means an app nobody
-- trusts to tell them anything.
insert into notification_prefs (profile_id)
select id from profiles where can_sign_in
on conflict (profile_id) do nothing;


-- ---------- today ----------

-- Build the current day and open its sheet, so the app opens on
-- something real rather than on an empty state that looks broken.
select build_day(current_date);
select ensure_sheet(current_date);
select build_day(current_date + 1);
select ensure_sheet(current_date + 1);


-- The thirty-one checks, on today's sheet. Exact items, exact order,
-- taken from section 6 of the running sheet. The 05:00 job copies them
-- forward to each new day.
do $$
declare
  s_id uuid;
  g_id uuid;
  items text[];
  i int;
begin
  select id into s_id from running_sheets where date = current_date;
  if s_id is null or exists (select 1 from sheet_check_groups where sheet_id = s_id) then
    return;
  end if;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'SHRINE — before prayers', 0) returning id into g_id;
  items := array[
    'Divo lit and topped up — correct oil only',
    'Shoes off before going near the shrine',
    'Dusted with the shrine cloth — no sprays, no chemicals',
    'Used matchsticks and ash cleared away',
    'Statues not moved',
    'Area around the shrine clear',
    'Matches, wicks and 2 spare bottles of divo oil in stock'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'PRAYER SET-UP — finished by 15:45', 1) returning id into g_id;
  items := array[
    'Mats and seating laid out for the number expected',
    'Mics on and tested',
    'Fresh flowers',
    'Incense',
    'Prasad made and covered',
    'Thali and prayer items laid out',
    'Drinking water and clean glasses ready for the breaks',
    'Prayer books or sheets out, if being used'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'THE HOUSE — before the first guest arrives', 2) returning id into g_id;
  items := array[
    'Dining room, lounge and balcony clear and tidy',
    'No cat bowls or cleaning things on show',
    'Ken shut away from the prayer area and the open doors',
    'Guest toilet spotless and stocked',
    'Table laid to standard',
    'Rooms aired — no cooking smell in the lounge',
    'Lights set warm for the evening'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;

  insert into sheet_check_groups (sheet_id, title, sort_order)
  values (s_id, 'AFTER THE MEAL — close-down', 3) returning id into g_id;
  items := array[
    'Prayer area cleared and put back',
    'Shrine items washed with the shrine sponge only',
    'Divo checked and topped up before anyone goes to bed',
    'Leftovers covered, labelled and dated',
    'All bins emptied',
    'Kitchen back to normal',
    'Photos of the set-up and clear-up posted on the 3808 Home group',
    'Any cash spent logged, with receipts',
    'Anything broken, missing or missed — tell Earl the same day'];
  for i in 1 .. array_length(items, 1) loop
    insert into sheet_check_items (group_id, text, sort_order) values (g_id, items[i], i - 1);
  end loop;
end;
$$;


commit;
