-- ============================================================
-- Money, and the filing cabinet.
--
-- One column decides who sees what in this file: `visibility`. A
-- transaction marked 'owner' is staff pay and private household
-- spending; one marked 'manager' is the running of the house. Earl sees
-- the second and not the first, and that is enforced by the policy in
-- 20260828001400_rls.sql calling has_capability('money.viewOwner') —
-- not by the app filtering a list it was already handed.
--
-- The distinction is worth stating plainly because it is the one place
-- in this schema where getting it wrong publishes somebody's salary to
-- the person they work alongside.
-- ============================================================


-- ---------- categories and budgets ----------

create table expense_categories (
  id text primary key,
  name text not null,
  kind expense_kind not null,
  zone zone not null default 'household',
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table expense_categories is 'How spending is grouped. Text ids because budgets and transactions in the seed name them.';

create trigger expense_categories_touch before update on expense_categories
  for each row execute function touch_updated_at();


create table budgets (
  id uuid primary key default gen_random_uuid(),
  -- 'YYYY-MM'. A text month rather than a date because a budget is for
  -- a month, not for the first of it, and every query groups by it.
  month text not null,
  category_id text not null references expense_categories (id) on delete cascade,
  zone zone not null default 'household',
  amount numeric(12, 2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_format check (month ~ '^\d{4}-\d{2}$'),
  constraint budgets_amount_not_negative check (amount >= 0),
  unique (month, category_id)
);

comment on table budgets is 'One figure per category per month. Unique on the pair, so a category cannot quietly have two budgets.';
comment on column budgets.month is 'YYYY-MM. Text, because a budget belongs to a month rather than to a day in it.';

create index budgets_month_idx on budgets (month);

create trigger budgets_touch before update on budgets
  for each row execute function touch_updated_at();


-- ---------- transactions ----------

create table transactions (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  description text not null,
  amount numeric(12, 2) not null,
  category_id text not null references expense_categories (id) on delete restrict,
  zone zone not null default 'household',
  vendor_id uuid references vendors (id) on delete set null,
  method payment_method not null,
  ref text not null default '',
  entered_by text not null references profiles (id) on delete restrict,
  -- The column this file is about. 'owner' is pay and private spending;
  -- 'manager' is the running of the house.
  visibility visibility not null default 'manager',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_amount_not_zero check (amount <> 0)
);

comment on table transactions is 'Every payment. Split by visibility: manager-visible is the running of the house, owner-only is pay and private spending.';
comment on column transactions.visibility is 'Owner-only rows are refused to anyone without money.viewOwner — by the policy, not by the app filtering a list it already has.';

create index transactions_date_idx on transactions (spent_on desc);
create index transactions_category_idx on transactions (category_id, spent_on desc);
create index transactions_visibility_idx on transactions (visibility);

create trigger transactions_touch before update on transactions
  for each row execute function touch_updated_at();


-- What a payment was for, where it was for something in the app.
create table transaction_links (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id) on delete cascade,
  link_type transaction_link_type not null,
  link_id text not null,
  created_at timestamptz not null default now()
);

comment on table transaction_links is 'Ties a payment to the thing it paid for — an issue, an asset, a contract. Polymorphic by necessity: the alternative is six nullable columns.';

create index transaction_links_tx_idx on transaction_links (transaction_id);
create index transaction_links_target_idx on transaction_links (link_type, link_id);


-- ---------- recurring charges ----------

create table recurring_charges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind charge_kind not null,
  category_id text not null references expense_categories (id) on delete restrict,
  zone zone not null default 'household',
  amount numeric(12, 2) not null default 0,
  cadence charge_cadence not null,
  next_due date,
  -- Autopay changes what the reminder is for: a nudge to check it went
  -- out, rather than a nudge to pay it.
  autopay boolean not null default false,
  account_ref text not null default '',
  visibility visibility not null default 'manager',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_amount_not_negative check (amount >= 0)
);

comment on table recurring_charges is 'Bills and subscriptions. Swept daily for anything due inside a fortnight.';
comment on column recurring_charges.autopay is 'Changes the meaning of the reminder: check it went out, rather than go and pay it.';

create index recurring_due_idx on recurring_charges (next_due) where active;

create trigger recurring_charges_touch before update on recurring_charges
  for each row execute function touch_updated_at();


-- ---------- petty cash ----------

create table petty_cash (
  id uuid primary key default gen_random_uuid(),
  happened_on date not null,
  -- float = money handed out, spend = money used, return = change back.
  direction petty_direction not null,
  profile_id text not null references profiles (id) on delete restrict,
  amount numeric(12, 2) not null,
  description text not null default '',
  -- R19. Cash spent is logged with receipts. The photograph is the
  -- receipt, and its absence is what the screen shows.
  receipt_path text,
  entered_by text not null references profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint petty_amount_positive check (amount > 0)
);

comment on table petty_cash is 'Cash out, cash spent, change back. R19 — every spend is meant to carry a receipt, and the missing ones are the report.';
comment on column petty_cash.receipt_path is 'Storage path to the photographed receipt. Null is allowed and is precisely what gets chased.';

create index petty_profile_idx on petty_cash (profile_id, happened_on desc);
create index petty_no_receipt_idx on petty_cash (happened_on) where direction = 'spend' and receipt_path is null;


-- ---------- documents ----------

create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cat doc_cat not null,
  filename text not null default '',
  mime text not null default 'application/pdf',
  size_kb integer not null default 0,
  -- Storage path in the files bucket. Empty on a record kept for the
  -- dates alone, where the paper itself is in a drawer.
  path text not null default '',
  zone zone not null default 'household',
  issue_date date,
  expiry_date date,
  reminder_days smallint not null default 30,
  visibility visibility not null default 'manager',
  uploaded_by text not null references profiles (id) on delete restrict,
  uploaded_at timestamptz not null default now(),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_size_not_negative check (size_kb >= 0)
);

comment on table documents is 'The filing cabinet. A row with an empty path is still useful — it is the expiry date of a paper that lives in a drawer.';
comment on column documents.expiry_date is 'What the daily sweep reads. reminder_days sets how far ahead it starts saying so.';

create index documents_expiry_idx on documents (expiry_date) where expiry_date is not null;
create index documents_cat_idx on documents (cat);
create index documents_visibility_idx on documents (visibility);

create trigger documents_touch before update on documents
  for each row execute function touch_updated_at();


create table document_links (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  link_type document_link_type not null,
  link_id text not null,
  created_at timestamptz not null default now()
);

comment on table document_links is 'Which document belongs to which asset, vehicle, contract or person.';

create index document_links_doc_idx on document_links (document_id);
create index document_links_target_idx on document_links (link_type, link_id);


-- The forward references from the property file, now resolvable.
alter table contract_documents
  add constraint contract_documents_document_fk
  foreign key (document_id) references documents (id) on delete cascade;

alter table asset_service_log
  add constraint asset_service_document_fk
  foreign key (document_id) references documents (id) on delete set null;
