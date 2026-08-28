-- ============================================================
-- The things the house owns, and the dates attached to them.
--
-- Nearly every table here exists for one reason: something expires and
-- nobody notices. A warranty, a service interval, a registration, an
-- insurance policy, a contract. The rows are cheap; the sweep in
-- 20260828001500_functions_cron.sql that reads them every morning is
-- what makes them worth having.
--
-- Service history is a separate table rather than a jsonb column,
-- because "when was the AC last done and by whom" is a question people
-- ask across assets, not within one.
-- ============================================================


-- ---------- assets ----------

create table assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat asset_cat not null,
  sub text not null default '',
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  brand text not null default '',
  model text not null default '',
  serial text not null default '',
  qty smallint not null default 1,
  -- Storage path, same rules as everywhere: never a public URL.
  photo_path text,
  description text not null default '',
  -- How this particular thing is looked after. Read by staff, so it is
  -- written in their words, not the manual's.
  care text not null default '',
  assigned_to text references profiles (id) on delete set null,

  purchase_date date,
  purchase_price numeric(12, 2),
  purchase_vendor_id uuid,
  purchase_ref text not null default '',

  warranty_start date,
  warranty_end date,
  warranty_provider text not null default '',
  warranty_notes text not null default '',

  -- 0 means it is not on a service cycle at all.
  service_freq_days smallint not null default 0,
  service_last date,
  service_next date,
  service_vendor_id uuid,
  service_notes text not null default '',

  lifespan_years smallint,
  replace_by date,
  replace_budget numeric(12, 2),
  replace_notes text not null default '',

  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint assets_qty_positive check (qty > 0),
  constraint assets_service_freq_allowed check (service_freq_days in (0, 90, 180, 365, 730)),
  constraint assets_warranty_order check (warranty_end is null or warranty_start is null or warranty_end >= warranty_start)
);

comment on table assets is 'Everything owned that has a warranty, a service interval or a replacement date. The expiry sweep reads this table every morning.';
comment on column assets.care is 'How to look after this one. Written for the person doing it, not copied from the manual.';
comment on column assets.service_next is 'Maintained by the app when a service is logged. Denormalised on purpose: the alert query reads it on every asset, every day.';

create index assets_area_idx on assets (area_id) where active;
create index assets_warranty_idx on assets (warranty_end) where active and warranty_end is not null;
create index assets_service_idx on assets (service_next) where active and service_next is not null;

create trigger assets_touch before update on assets
  for each row execute function touch_updated_at();


create table asset_service_log (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets (id) on delete cascade,
  serviced_on date not null,
  vendor_id uuid,
  cost numeric(12, 2),
  notes text not null default '',
  document_id uuid,
  created_at timestamptz not null default now(),
  constraint asset_service_cost_not_negative check (cost is null or cost >= 0)
);

comment on table asset_service_log is 'Every visit, on every asset. A separate table because "when was the AC last done" is asked across assets, not within one.';

create index asset_service_asset_idx on asset_service_log (asset_id, serviced_on desc);


-- ---------- vehicles ----------

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  make text not null default '',
  model text not null default '',
  year text not null default '',
  plate text not null default '',
  vin text not null default '',
  zone zone not null default 'household',
  assigned_to text references profiles (id) on delete set null,
  colour text not null default '',
  odometer integer not null default 0,
  -- The two dates that stop a car being legal. Both are swept daily.
  registration_expiry date,
  insurance_expiry date,
  insurance_provider text not null default '',
  policy_no text not null default '',
  service_freq_days smallint not null default 0,
  service_last date,
  service_next date,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_odometer_not_negative check (odometer >= 0)
);

comment on table vehicles is 'The household car. Registration and insurance expiry are swept daily — both of them make the car undriveable, not merely overdue.';

create index vehicles_expiry_idx on vehicles (registration_expiry, insurance_expiry) where active;

create trigger vehicles_touch before update on vehicles
  for each row execute function touch_updated_at();


create table vehicle_log (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  logged_on date not null,
  type vehicle_log_type not null,
  odometer integer,
  cost numeric(12, 2),
  vendor_id uuid,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint vehicle_log_odometer_not_negative check (odometer is null or odometer >= 0)
);

comment on table vehicle_log is 'Fuel, service, repairs, fines, tolls and Salik. Append-only — it is a running cost record.';

create index vehicle_log_vehicle_idx on vehicle_log (vehicle_id, logged_on desc);


-- ---------- service contracts ----------

create table service_contracts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cat contract_cat not null,
  zone zone not null default 'household',
  vendor_id uuid,
  -- The visit cycle, in days. Distinct from the contract term below.
  freq_days smallint not null default 0,
  last_visit date,
  next_visit date,
  contract_start date,
  contract_end date,
  cost numeric(12, 2),
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_term_order check (contract_end is null or contract_start is null or contract_end >= contract_start)
);

comment on table service_contracts is 'AC, pest, water tank, window cleaning. Two clocks: when the next visit is due, and when the contract itself runs out.';
comment on column service_contracts.freq_days is 'The visit cycle. A quarterly AC contract has freq_days 90 and a term of a year.';

create index contracts_next_idx on service_contracts (next_visit) where active;
create index contracts_end_idx on service_contracts (contract_end) where active;

create trigger service_contracts_touch before update on service_contracts
  for each row execute function touch_updated_at();


create table contract_documents (
  contract_id uuid not null references service_contracts (id) on delete cascade,
  document_id uuid not null,
  primary key (contract_id, document_id)
);

comment on table contract_documents is 'Which filed documents belong to which contract. The foreign key to documents is added in 20260828001000_money_documents.sql, once that table exists.';


-- ---------- plants ----------

create table plants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  species text not null default '',
  area_id text references areas (id) on delete set null,
  zone zone not null default 'household',
  water_freq_days smallint not null default 7,
  last_watered date,
  feed_freq_days smallint not null default 0,
  last_fed date,
  light text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plants_water_freq_positive check (water_freq_days > 0)
);

comment on table plants is 'Watering and feeding cycles. The day builder turns these into tasks, which is the only reason a plant needs a row at all.';

create index plants_area_idx on plants (area_id) where active;

create trigger plants_touch before update on plants
  for each row execute function touch_updated_at();
