-- ============================================================
-- The house chat.
--
-- One thread for the whole house, and it replaces the WhatsApp group
-- rather than duplicating it. That is the point: a delivery that landed,
-- a car going in for a service, stock running out — those get said once,
-- to one person, in a corridor, and then nobody else knows. Here they
-- are said once and everybody who opens the app sees them.
--
-- Modelled on issue_comments, deliberately. A thread that can be quietly
-- edited afterwards is not a record of what was said, so there is no
-- update path and no delete path for the body of a message. Pinning is
-- the one exception, because a standing notice — "Shrien lands Tuesday
-- at 21:40" — has to be able to stop being a standing notice.
--
-- Read and post are separate capabilities, so somebody can be given the
-- thread to read without being given a voice in it — a contractor on a
-- temporary account, say.
--
-- The security rules for this table are at the bottom of this file
-- rather than in 20260828001400_rls.sql with every other table's, and
-- that is not a style choice. This migration runs after that one, and a
-- policy cannot be written for a table that does not exist yet. Left
-- there, the enable and the grant would be the first statement in the
-- paste to fail, and would take every file after them down with them.
-- ============================================================


-- ---------- the messages ----------

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  -- Who said it. RESTRICT, matching issue_comments: an unattributed
  -- message in a house thread is a rumour, and deactivating somebody
  -- must not quietly rewrite what they said.
  by_id text not null references profiles (id) on delete restrict,
  said_at timestamptz not null default now(),
  pinned boolean not null default false,
  -- Who pinned it, so a notice nobody will own can be questioned. SET
  -- NULL rather than RESTRICT: the notice outlives the person who put
  -- it up, and losing the message to keep the attribution is backwards.
  pinned_by text references profiles (id) on delete set null,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An empty message is a mis-tap, not a message — but a photograph
  -- with nothing typed under it is a message, and often the clearest
  -- one: the broken tap, the empty shelf, the receipt. The composer
  -- has always allowed it. Checking the body alone meant every one of
  -- those was refused with 23514 and disappeared out of the thread.
  constraint chat_messages_not_empty
    check (length(trim(body)) > 0 or photo_path is not null)
);

comment on table chat_messages is 'The house thread. Append-only by design — the body of a message is never edited and never deleted, because a thread that can be quietly rewritten is not a record of what was said.';
comment on column chat_messages.body is 'What was said. Immutable once posted; the guard trigger below refuses any change to it.';
comment on column chat_messages.by_id is 'Who said it. Restrict on delete, as with issue_comments — an unattributed message is a rumour.';
comment on column chat_messages.said_at is 'When it was said, as opposed to created_at, which is when the row arrived. They differ for a message composed offline and sent later.';
comment on column chat_messages.pinned is 'Standing notices. The only field on a posted message that may change, and it is what the notices block at the top of the screen reads.';
comment on column chat_messages.pinned_by is 'Who put the notice up. Set null on delete: the notice outlives the person.';
comment on column chat_messages.photo_path is 'A path in the house-files bucket under chat/<message-id>/, never a URL. The app asks for a short-lived signed link on each open. Null for a message with no photograph.';

-- The thread itself, newest first, which is the only way it is ever read.
create index chat_messages_said_idx on chat_messages (said_at desc);

-- The notices block. Partial, because pinned messages are a handful out
-- of everything ever said and a full index would be almost entirely
-- rows the notices block never wants.
create index chat_messages_pinned_idx on chat_messages (said_at desc) where pinned;

create index chat_messages_by_idx on chat_messages (by_id);

create trigger chat_messages_touch before update on chat_messages
  for each row execute function touch_updated_at();


-- ---------- append-only, enforced ----------

-- The policies on this table come from grant_table, which writes the
-- four ordinary ones — including an update and a delete. That is the
-- right shape for stock and the wrong shape for a conversation, so the
-- rule the table actually needs is enforced here instead, where it holds
-- whatever the policies happen to say and whoever is connected.
--
-- Pinning is an update of two columns. Everything else about a posted
-- message is fixed.
create or replace function chat_messages_append_only() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  -- The guard is aimed at the app's own connections, which are the only
  -- ones anybody in the house is using. service_role is left a way
  -- through — the Edge Functions, and a repair run by hand — because a
  -- photograph posted by mistake has to be removable by somebody, and
  -- with no delete policy and no trigger exception there would be no
  -- route to it at all.
  if current_user not in ('authenticated', 'anon') then
    return case tg_op when 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'A chat message cannot be deleted. Post a correction — the thread is the record.'
      using errcode = 'restrict_violation';
  end if;

  if new.body is distinct from old.body
     or new.by_id is distinct from old.by_id
     or new.said_at is distinct from old.said_at
     or new.photo_path is distinct from old.photo_path
     or new.id is distinct from old.id then
    raise exception 'A chat message cannot be edited. Only pinning may change after it is posted.'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

comment on function chat_messages_append_only() is
  'Makes the append-only rule true rather than intended: refuses deletes, and refuses any update other than pinning.';

create trigger chat_messages_no_edit before update or delete on chat_messages
  for each row execute function chat_messages_append_only();


-- ---------- the security rules ----------

-- The same two lines every other table gets in 20260828001400_rls.sql,
-- written here because the table did not exist when that file ran.
-- Forced as well as enabled, so the rules are exercised in the SQL
-- editor too — a superuser session ignores policies otherwise, and they
-- look like they work when they have never once been tested.
alter table chat_messages enable row level security;
alter table chat_messages force row level security;

select grant_table('chat_messages', 'chat.view', 'chat.post');


-- ---------- the shorthand does not outlive the migrations ----------

-- That was the last of the 43 calls. grant_table() writes policies, so
-- anybody who could still call it could write themselves one — it goes
-- now, at the foot of the file that used it last, rather than at the
-- foot of 20260828001400_rls.sql where it was defined.
drop function grant_table(text, text, text);
