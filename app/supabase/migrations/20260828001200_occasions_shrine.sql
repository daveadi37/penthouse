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
