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
