-- ============================================================
-- Prove the capability grid, rather than read it.
--
-- Two traps this file is built around, both of which make a broken
-- policy look like a working one:
--
--   * a superuser bypasses RLS even under `force row level security`,
--     so everything below runs as harness_user, which is not one;
--   * `set local` outside an explicit transaction is a silent no-op,
--     so every impersonation sits inside its own begin/commit.
-- ============================================================

-- An unprivileged role that is a member of `authenticated`, which is
-- who every policy in the schema is written `to`.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'harness_user') then
    create role harness_user login;
  end if;
end $$;

grant authenticated to harness_user;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Give every profile an auth user to be. Deterministic uuids so the
-- output can be read back against the person.
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-' || lpad(row_number() over (order by id)::text, 12, '0'))::uuid,
       email
  from profiles
on conflict (id) do nothing;

update profiles p
   set auth_user_id = u.id
  from (select ('00000000-0000-4000-8000-' || lpad(row_number() over (order by id)::text, 12, '0'))::uuid as id,
               id as pid
          from profiles) u
 where p.id = u.pid;

/* Probe rows. The seed creates no money, documents, staff records or
   messages, so without these every one of those columns reads zero for
   everybody and the grid proves nothing — a refusal and an empty table
   look identical from the outside. One row each is enough: the
   question is whether it is visible, not how many there are. */
insert into expense_categories (id, name, kind)
  values ('ec-probe', 'Probe', 'household')
  on conflict (id) do nothing;

insert into transactions (spent_on, description, amount, category_id, method, entered_by)
  values (current_date, 'Probe', 1, 'ec-probe', 'Cash', 'p-aditya');

insert into documents (title, cat, uploaded_by)
  values ('Probe document', 'Other', 'p-aditya');

insert into staff_details (profile_id) values ('p-rosie')
  on conflict (profile_id) do nothing;

insert into chat_messages (body, by_id) values ('Probe message', 'p-aditya');

\echo ''
\echo '=== who can read what ==='
\echo 'columns: money(transactions) · staff records · documents · chat · stock · people'
\echo ''

-- One row per person. Each count runs under that person's own uid, as
-- an unprivileged role, so a zero is a genuine refusal.
/* The list of who to impersonate is taken as superuser, before the role
   switch. It cannot come from `profiles` inside the loop: profiles_read
   now requires a profile of your own, so the loop's own query would
   return nothing before the first uid is set and the grid would come
   back empty — which it did. */
drop table if exists harness_people;
create table harness_people as
  select id, name, role, auth_user_id from profiles order by role, name;
grant select on harness_people to authenticated;

/* Out-parameters are deliberately not named after columns. `role` as an
   out-param shadowed profiles.role and the loop died with "column
   reference is ambiguous" — the same shadowing class this harness
   caught twice before, in `dow` and `parity`. */
create or replace function harness_grid()
returns table (person text, held_role text, money bigint, staff_rec bigint, docs bigint, chat bigint, stock bigint, people bigint)
language plpgsql
as $$
declare r record;
begin
  for r in select p.id, p.name, p.role, p.auth_user_id from harness_people p order by p.role, p.name loop
    perform set_config('test.uid', r.auth_user_id::text, true);
    person := r.name;
    held_role := r.role;
    execute 'select count(*) from transactions'   into money;
    execute 'select count(*) from staff_details'  into staff_rec;
    execute 'select count(*) from documents'      into docs;
    execute 'select count(*) from chat_messages'  into chat;
    execute 'select count(*) from inventory_items' into stock;
    execute 'select count(*) from profiles'       into people;
    return next;
  end loop;
end $$;

-- SECURITY INVOKER (the default) so the policies apply to the caller.
begin;
set local role harness_user;
select * from harness_grid();
commit;

\echo ''
\echo '=== what a stranger with a valid login but no profile sees ==='
begin;
set local role harness_user;
set local test.uid = '99999999-9999-4999-8999-999999999999';
select 'transactions' as tbl, count(*) from transactions
union all select 'profiles', count(*) from profiles
union all select 'chat_messages', count(*) from chat_messages
union all select 'documents', count(*) from documents;
commit;

\echo ''
\echo '=== what nobody at all sees (anon, no uid) ==='
begin;
set local role harness_user;
select 'transactions' as tbl, count(*) from transactions
union all select 'profiles', count(*) from profiles
union all select 'chat_messages', count(*) from chat_messages;
commit;
