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
