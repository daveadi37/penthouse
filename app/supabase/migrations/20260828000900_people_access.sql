-- ============================================================
-- Contacts, vendors, who came to the door, and who holds a key.
--
-- access_credentials is the one table in this schema written to be
-- deliberately incomplete, and it is the third of the three contestable
-- calls in the build plan.
--
-- It records that a code exists, which door it opens, who holds it, and
-- when it was last changed. It does not record the digits. There is no
-- column for them and there is not meant to be, because a household
-- database reached by a dozen accounts is not where the front door code
-- belongs — and a register that knows a code is three years old and
-- held by a contractor who left is worth more than one that knows the
-- number and is never opened.
--
-- If somebody asks for a "code" field later, the answer is a password
-- manager, not a column.
-- ============================================================


-- ---------- contacts ----------

create table contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat contact_cat not null,
  org text not null default '',
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  -- The handful that go on the emergency card by the door.
  emergency boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table contacts is 'People to ring. The emergency flag is what gets printed and stuck to the fridge.';

create index contacts_cat_idx on contacts (cat) where active;
create index contacts_emergency_idx on contacts (emergency) where emergency and active;

create trigger contacts_touch before update on contacts
  for each row execute function touch_updated_at();


-- ---------- vendors ----------

create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat vendor_cat not null,
  contact_name text not null default '',
  phone text not null default '',
  email text not null default '',
  account_ref text not null default '',
  -- What they are actually like to deal with. The most useful column
  -- on the table and the one most likely to be left empty.
  notes text not null default '',
  rating smallint,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_rating_range check (rating is null or rating between 1 and 5)
);

comment on table vendors is 'Who gets called for what. The notes column is the point of the table — the phone number is on the internet, the opinion is not.';

create index vendors_cat_idx on vendors (cat) where active;

create trigger vendors_touch before update on vendors
  for each row execute function touch_updated_at();


-- The forward references left dangling by the earlier files, resolved
-- now that vendors exists. Declared here rather than as inline columns
-- so the migration order stays a straight line with no cycles.
alter table inventory_items
  add constraint inventory_items_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table shopping_items
  add constraint shopping_items_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table issues
  add constraint issues_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table issues
  add constraint issues_asset_fk
  foreign key (asset_id) references assets (id) on delete set null;

alter table assets
  add constraint assets_purchase_vendor_fk
  foreign key (purchase_vendor_id) references vendors (id) on delete set null;

alter table assets
  add constraint assets_service_vendor_fk
  foreign key (service_vendor_id) references vendors (id) on delete set null;

alter table asset_service_log
  add constraint asset_service_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table vehicle_log
  add constraint vehicle_log_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;

alter table service_contracts
  add constraint service_contracts_vendor_fk
  foreign key (vendor_id) references vendors (id) on delete set null;


-- ---------- visitors ----------

create table visitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org text not null default '',
  visiting text not null default '',
  purpose text not null default '',
  zone zone not null default 'household',
  visited_on date not null,
  arrived time not null,
  departed time,
  badge text not null default '',
  logged_by text not null references profiles (id) on delete restrict,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitors_departure_after_arrival check (departed is null or departed >= arrived)
);

comment on table visitors is 'Who came, when, and whether they left. The value is in the open entries — somebody signed in at nine and never signed out.';
comment on column visitors.departed is 'Null means still on site. The screen counts those, because an open entry at midnight is the thing worth seeing.';

create index visitors_open_idx on visitors (visited_on) where departed is null;
create index visitors_date_idx on visitors (visited_on desc);

create trigger visitors_touch before update on visitors
  for each row execute function touch_updated_at();


-- ---------- contractor visits ----------

create table contractor_visits (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors (id) on delete set null,
  people text not null default '',
  purpose text not null,
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  visited_on date not null,
  arrived time,
  departed time,
  -- Somebody from the house has to be with them. Recording who is the
  -- point of the table.
  escorted_by text references profiles (id) on delete set null,
  issue_id uuid references issues (id) on delete set null,
  work_done text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table contractor_visits is 'Trades in the house. Separate from visitors because a contractor is escorted, does work, and is usually attached to an issue.';
comment on column contractor_visits.escorted_by is 'Who stayed with them. An unescorted contractor is the thing this table exists to make visible.';

create index contractor_visits_date_idx on contractor_visits (visited_on desc);
create index contractor_visits_issue_idx on contractor_visits (issue_id);

create trigger contractor_visits_touch before update on contractor_visits
  for each row execute function touch_updated_at();


-- ---------- deliveries ----------

create table deliveries (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  courier text not null default '',
  for_profile_id text references profiles (id) on delete set null,
  -- Free text for anything addressed to the house rather than a person.
  for_whom text not null default '',
  zone zone not null default 'household',
  received_on date not null,
  arrived time not null,
  received_by text not null references profiles (id) on delete restrict,
  status delivery_status not null default 'received',
  collected_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_collected_has_time
    check ((status = 'collected') = (collected_at is not null))
);

comment on table deliveries is 'Parcels. Marvin logs them and posts them on the group; the uncollected count is what stops a box sitting in the hall for a week.';

create index deliveries_uncollected_idx on deliveries (received_on) where status = 'received';

create trigger deliveries_touch before update on deliveries
  for each row execute function touch_updated_at();


-- ---------- keys, fobs and codes ----------

create table access_credentials (
  id uuid primary key default gen_random_uuid(),
  kind credential_kind not null,
  label text not null,
  zone zone not null default 'household',
  -- Where the physical thing lives, or which door the code opens.
  -- NOT the code itself. There is no column for that, on purpose.
  held_where text not null default '',
  -- A name rather than a profile id: half of these are with a
  -- contractor, a building manager or a relative.
  issued_to_name text not null default '',
  issued_to_profile_id text references profiles (id) on delete set null,
  issued_at date,
  -- The date that makes the register useful. A code last changed when
  -- somebody who has since left still knew it is the finding.
  last_changed date,
  copies smallint not null default 1,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credentials_copies_positive check (copies > 0)
);

comment on table access_credentials is 'The register of keys, fobs and codes. Records that a code exists, which door, who holds it and when it last changed — never the digits. Eleven accounts can reach this database; the front door code does not belong in it.';
comment on column access_credentials.held_where is 'Where the key lives, or which door the code opens. Not the code. There is deliberately no column for the code.';
comment on column access_credentials.last_changed is 'The column the register is really for. An old date beside a departed holder is the alert.';

create index credentials_kind_idx on access_credentials (kind) where active;
create index credentials_stale_idx on access_credentials (last_changed) where active;
