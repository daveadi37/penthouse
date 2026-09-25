-- ============================================================
-- Realtime.
--
-- Supabase's realtime server only sends changes for tables that are
-- members of the supabase_realtime publication. Until this file existed
-- there was no publication statement anywhere in the migrations, which
-- means every subscription in the app connected, reported itself
-- healthy, and then sat there receiving nothing for the rest of the day.
--
-- That failure is worth naming because of how it presents. Nothing
-- errors. The screen simply does not update, so it looks like a bug in
-- the subscription code, and the search goes to the application first
-- and to the schema last. It is four lines of DDL.
--
-- Four tables are on the list, and they are the four where two people
-- are looking at the same thing at the same time:
--
--   chat_messages    a conversation that arrives a minute late is not a
--                    conversation. This is the whole reason the chat is
--                    in the app rather than in the group.
--   shopping_items   Rosie adds to the buy list from the kitchen while
--                    Marvin is already out with it. Without this he buys
--                    yesterday's list.
--   inventory_items  a count done on a phone in the store has to show on
--                    the buy list before the next person recounts it.
--   issues           a fault raised is a fault somebody may already be
--                    standing in front of.
--
-- Nothing else is on the list, and that is deliberate rather than
-- unfinished. Every additional table is a stream of row payloads pushed
-- to every connected device whether or not anything is showing them, and
-- the tables that carry salaries, passport dates and owner-only spending
-- are the last ones that should be broadcast on the off chance a screen
-- wants them. Everything else in the app is read when a screen opens,
-- which for a rota or a warranty date is soon enough.
-- ============================================================


-- The publication normally exists already — Supabase ships it on every
-- project. It is created here when it does not, so this file also works
-- against a plain Postgres, which is where the SQL gets checked before
-- it is ever pasted into the real project.
do $$
begin
  create publication supabase_realtime;
exception
  when duplicate_object then null;
end
$$;


-- Each table is added in its own block. The whole point is that this
-- file can be run again — after a partial deployment, or simply because
-- somebody pasted the bundle twice — and adding a table that is already
-- a member raises duplicate_object, which would otherwise take down the
-- transaction and everything after it.
do $$
begin
  alter publication supabase_realtime add table chat_messages;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table shopping_items;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table inventory_items;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table issues;
exception
  when duplicate_object then null;
end
$$;


-- Realtime respects row-level security, but only for a subscriber whose
-- connection carries their access token. A change to one of these four
-- tables is filtered by the same policies the table itself has, so a
-- family account subscribed to issues sees what a family account may
-- see. Nothing here widens what anyone can read.
