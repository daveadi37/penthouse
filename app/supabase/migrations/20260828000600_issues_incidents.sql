-- ============================================================
-- Issues, and the incident log.
--
-- One table, not four. A fault ("the tap drips"), a condition flag
-- ("the hallway rug is fraying"), a request ("can we have a second
-- kettle") and a supply request ("we are out of washing powder") are
-- the same object with a different `kind`: something is wrong or wanted,
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
