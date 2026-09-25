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
-- The stock sweep matters most after that. It is what turns a shelf
-- nobody thought to look at into a line on the buy list before Marvin
-- leaves, rather than after he gets back.
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
  'Auto-routing. Spread deterministically across everyone qualified and on shift, so one person does not collect every housekeeping task while another shows zero.';


-- ---------- 2. the expiry and stock sweeps ----------

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


-- What is running out. This is the job the buy list depends on: nobody
-- has to notice a shelf for it to reach the list.
create or replace function sweep_stock() returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  low_count integer;
  raised integer := 0;
  p record;
begin
  select count(*) into low_count
  from inventory_items
  where active and qty < min_qty;

  if low_count = 0 then
    return 0;
  end if;

  for p in
    select pr.id from profiles pr
    join roles r on r.id = pr.role and r.active
    join role_capabilities rc on rc.role_id = r.id
    where pr.active and pr.can_sign_in and rc.capability = 'inventory.edit'
    group by pr.id
  loop
    if should_send_now(p.id, 'stock_low', 'normal') then
      insert into notifications (profile_id, kind, title, body, url, priority)
      values (p.id, 'stock_low', format('%s items below minimum', low_count),
              'They are on the buy list. Worth a look before the next shop.',
              '#/inventory', 'normal');
      raised := raised + 1;
    end if;
  end loop;

  return raised;
end;
$$;

comment on function sweep_stock() is 'Counts what has fallen below its minimum and tells whoever can act on it. The daily half of how a line reaches the buy list without anybody noticing a shelf.';


-- ---------- 3. the schedule ----------

-- All times UTC. Dubai is UTC+4 all year — no daylight saving, so these
-- do not drift.
select cron.schedule('build-tomorrow',   '0 1 * * *',  $$select build_day(current_date + 1)$$);  -- 05:00 Dubai
select cron.schedule('build-today',      '30 1 * * *', $$select build_day(current_date)$$);      -- 05:30 Dubai, a safety net
select cron.schedule('sweep-expiries',   '0 3 * * *',  $$select sweep_expiries()$$);             -- 07:00 Dubai
select cron.schedule('sweep-stock',      '0 3 * * *',  $$select sweep_stock()$$);                -- 07:00 Dubai

-- Deliveries are sent by the push Edge Function, which reads the queue.
-- ---------- setting a role's capabilities ----------

-- The capability grid is a join table with a composite key, and the
-- app's sync layer writes whole rows keyed on a single `id` column. So
-- there was no way to save a grid from the app at all: the Roles screen
-- ticked boxes, said "Role saved", dropped the capabilities on the
-- floor and restored the database's grid on the next boot. Someone
-- would have spent an afternoon fixing permissions that never changed.
--
-- SECURITY INVOKER — the default, and the whole point. This runs as
-- whoever called it, so role_capabilities_write applies to every row it
-- touches: you cannot grant a capability you do not hold, and you
-- cannot touch a role that outranks you. Making this DEFINER would
-- hand any caller the entire grid.
-- The row and the grid go together, in one statement, for a reason: a
-- new role's row is queued in the outbox, so a separate call to set its
-- capabilities would reach the database first and die on the foreign
-- key. A role is one permission change, not a row edit with a side
-- table, and saving half of it is worse than saving none.
create or replace function save_role(
  p_id          text,
  p_name        text,
  p_rank        smallint,
  p_description text,
  p_works       boolean,
  p_caps        capability[]
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into roles (id, name, rank, description, works)
  values (p_id, p_name, p_rank, coalesce(p_description, ''), coalesce(p_works, false))
  on conflict (id) do update
    set name        = excluded.name,
        rank        = excluded.rank,
        description = excluded.description,
        works       = excluded.works,
        updated_at  = now();

  delete from role_capabilities
   where role_id = p_id
     and capability <> all (p_caps);

  insert into role_capabilities (role_id, capability)
  select p_id, unnest(p_caps)
  on conflict (role_id, capability) do nothing;
end;
$$;

comment on function save_role(text, text, smallint, text, boolean, capability[]) is
  'Save a role and its capability grid together, as the caller. The row policies decide what is allowed — a rank above your own, or a grant you do not hold yourself, is refused.';


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

-- pg_cron holds the clock for the 05:00 day build and the 07:00 sweeps.
-- Schedules above are UTC; Dubai is UTC+4 all year.
--
-- Written as a plain comment rather than COMMENT ON EXTENSION, because
-- on a hosted Supabase project the extension is not owned by the role
-- running this file, and commenting on it fails with 42501.
