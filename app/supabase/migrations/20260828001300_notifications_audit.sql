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
