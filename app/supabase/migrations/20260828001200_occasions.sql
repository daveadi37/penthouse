-- ============================================================
-- Guests, events and the house standing empty.
--
-- Occasions all work the same way: a thing with a date, and a list of
-- tasks positioned by an offset from it — three days before, two hours
-- before, on the day, after. One engine, three shapes (a guest staying,
-- an event happening, the house empty while everyone is away).
--
-- The offset is the reason this is one engine and not three tables of
-- dated to-dos. Move a dinner by a day and everything hung off it moves
-- with it, which is the only version of this that survives contact with
-- a plan that changes.
-- ============================================================


-- ---------- guests ----------

create table guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  arrival date not null,
  arrival_time time,
  departure date,
  area_id text references areas (id) on delete set null,
  -- What they cannot eat. The cook reads this before the menu is written,
  -- which is the only point at which knowing it is any use.
  dietary text not null default '',
  notes text not null default '',
  status occasion_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guests_departure_after_arrival check (departure is null or departure >= arrival)
);

comment on table guests is 'People staying. The dietary note and the room are the two things anyone actually needs from this.';

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
