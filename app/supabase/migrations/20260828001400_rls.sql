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
    'occasion_template_tasks', 'vacations',
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

select grant_table('incidents', 'issue.viewAll', 'issue.raise');
select grant_table('incident_photos', 'issue.viewAll', 'issue.raise');

-- The house chat is the one table whose rules are not here. It is
-- created in 20260828001700_chat.sql, which is after this file, and a
-- policy cannot be written for a table that does not exist yet — so its
-- enable, its force and its grant_table call all live in that file
-- alongside the table. grant_table() itself is defined above and is
-- still what writes them.

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
-- Everybody in the house can see everybody in the house — names have to
-- resolve on a task, a message and a shift. But `using (true)` gave the
-- list to any authenticated account whatsoever, including one that this
-- house has never heard of: sign up, get a JWT, read nine names, emails,
-- phone numbers and dietary notes. Email signups are on by default, so
-- that is anyone who finds the address.
--
-- Holding a profile is the line. A stranger reads nothing and lands on
-- the "not linked yet" screen, which is what it was written for.
create policy profiles_read on profiles
  for select to authenticated using (my_profile_id() is not null);

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

-- No update, no delete. For Marvin and Rosie this is the pay record,
-- and a pay record that can be quietly edited is not one.

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


-- ---------- 5. the shorthand outlives this file by two migrations ----------

-- grant_table() writes policies, which means anybody who could call it
-- could write themselves a policy, so it is dropped as soon as the last
-- caller has run. That is NOT here: 20260828001700_chat.sql creates
-- chat_messages — which cannot exist before this file, because this file
-- is where the policy vocabulary is defined — and calls grant_table() on
-- it. The drop lives at the foot of that file instead.
--
-- It was here once. Moving the chat_messages call out of this file to
-- fix a 42P01 walked it straight past the drop and bought a 42883 in
-- exchange, 3841 lines into a 4294-line paste. scripts/check-sql.mjs now
-- tracks the live window of a function the same way it tracks a table's.
