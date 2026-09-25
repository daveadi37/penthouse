-- ============================================================
-- Stock, shopping, meals and waste. The heart of the app.
--
-- The shape that matters is stock and shopping being two tables and not
-- one. inventory_items is what the house has; shopping_items is what
-- somebody is going to buy. A line can exist on the buy list without
-- being tracked stock — Rosie writes "coriander" and it is a line —
-- and a tracked item can fall below its minimum without anybody having
-- written anything, which is what sweep_stock in
-- 20260828001500_functions_cron.sql exists to catch.
--
-- inventory_movements is append-only and inventory_items.qty is a cache
-- of it. Two people counting the same shelf on two phones produce two
-- rows and both are kept; a single qty column reconciled by last-write
-- would quietly lose one.
-- ============================================================


-- ---------- categories ----------

create table inventory_categories (
  id text primary key,
  name text not null,
  zone zone not null default 'household',
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table inventory_categories is 'How the stock list is grouped on screen. Text ids because the seeded items name them.';

create trigger inventory_categories_touch before update on inventory_categories
  for each row execute function touch_updated_at();


-- ---------- items ----------

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id text not null references inventory_categories (id) on delete restrict,
  zone zone not null default 'household',
  qty numeric(12, 2) not null default 0,
  -- Below this, the item is on the shopping list and Earl is told.
  min_qty numeric(12, 2) not null default 0,
  unit text not null default 'units',
  -- Bought on a rhythm rather than when it runs out.
  recurring boolean not null default false,
  vendor_id uuid,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_qty_not_negative check (qty >= 0),
  constraint inventory_min_not_negative check (min_qty >= 0)
);

comment on table inventory_items is 'Everything counted. qty is a cache of inventory_movements; min_qty is what puts a line on the buy list without anyone having to notice.';
comment on column inventory_items.min_qty is 'Below this it lands on the shopping list. Set it at what you want left when the next shop happens, not at zero.';

create index inventory_category_idx on inventory_items (category_id) where active;
create index inventory_low_idx on inventory_items (qty) where active;

create trigger inventory_items_touch before update on inventory_items
  for each row execute function touch_updated_at();


-- ---------- movements ----------

-- Append-only, and that is the point. Two devices offline at once
-- produce two rows and both are correct; a single qty column reconciled
-- by last-write would silently lose one of them. The qty above is a
-- cached total, and this is the truth.
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items (id) on delete cascade,
  -- Signed. Negative is used or wasted, positive is bought or found.
  delta numeric(12, 2) not null,
  reason movement_reason not null,
  by_id text not null references profiles (id) on delete restrict,
  happened_at timestamptz not null default now(),
  -- Free text pointing at whatever caused it — a meal, a shopping run.
  ref text not null default '',
  created_at timestamptz not null default now(),
  constraint movements_delta_not_zero check (delta <> 0)
);

comment on table inventory_movements is 'Every change to stock, append-only. The item''s qty is a cache; this is the record.';
comment on column inventory_movements.delta is 'Signed. A count correction is a movement too, with reason = count.';

create index movements_item_idx on inventory_movements (item_id, happened_at desc);
create index movements_when_idx on inventory_movements (happened_at desc);


-- Keep the cached total honest. Doing this in the database rather than
-- the app means an offline device's queued movements land correctly
-- whenever they arrive, in whatever order they arrive.
create or replace function apply_movement() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  update inventory_items
     set qty = greatest(0, qty + new.delta)
   where id = new.item_id;
  return new;
end;
$$;

comment on function apply_movement() is 'Keeps inventory_items.qty in step with the movement log. Clamped at zero — a negative shelf is a data error, not a fact.';

create trigger inventory_movements_apply after insert on inventory_movements
  for each row execute function apply_movement();


-- ---------- the shopping list ----------

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  -- Null where somebody wrote a line that is not a tracked item.
  item_id uuid references inventory_items (id) on delete set null,
  name text not null,
  zone zone not null default 'household',
  qty numeric(12, 2) not null default 1,
  unit text not null default 'units',
  status shopping_status not null default 'needed',
  added_by text not null references profiles (id) on delete restrict,
  added_at timestamptz not null default now(),
  purchased_at timestamptz,
  cost numeric(12, 2),
  vendor_id uuid,
  notes text not null default '',
  -- The things bought on a rhythm rather than because they ran out —
  -- the daily milk and bread, the weekly vegetables. Marking a standing
  -- row purchased records the run; it does not take the row off the
  -- list, because it will be needed again tomorrow.
  standing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_purchased_has_date
    check ((status = 'purchased') = (purchased_at is not null))
);

comment on table shopping_items is 'The buy list. Lines arrive three ways: somebody adds one, an item falls below its minimum, or it is a standing row that is always there.';
comment on column shopping_items.standing is 'Always on the list. Buying it records the run rather than clearing the row — the daily milk is needed again tomorrow.';

create index shopping_status_idx on shopping_items (status) where status <> 'purchased';

create trigger shopping_items_touch before update on shopping_items
  for each row execute function touch_updated_at();


-- ---------- meals ----------

create table meals (
  id uuid primary key default gen_random_uuid(),
  served_on date not null,
  type meal_type not null,
  name text not null,
  portions smallint not null default 4,
  serve_at time not null,
  zone zone not null default 'household',
  prep text not null default '',
  cook text not null default '',
  diet text not null default '',
  leftovers leftovers not null default 'None',
  status meal_status not null default 'Draft',
  proposed_by text not null references profiles (id) on delete restrict,
  proposed_at timestamptz not null default now(),
  approved_by text references profiles (id) on delete set null,
  feedback text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meals_portions_positive check (portions > 0),
  -- Approved means somebody approved it. A menu that approved itself is
  -- how the wrong food reaches a table.
  constraint meals_approval_attributed
    check (status not in ('Approved', 'Prepared', 'Completed') or approved_by is not null),
  -- Changes requested without saying what changes is not feedback.
  constraint meals_changes_explained
    check (status <> 'Changes requested' or length(trim(feedback)) > 0)
);

comment on table meals is 'The menu, by sitting. Status is a workflow — Draft, Submitted, Approved, Prepared, Completed — and approval is attributed by constraint.';
comment on column meals.diet is 'What must not be in it, for this sitting. Aditya''s portion is vegetarian, so most dinners carry a note here.';

create index meals_date_idx on meals (served_on, serve_at);
create index meals_status_idx on meals (status) where status in ('Submitted', 'Changes requested');

create trigger meals_touch before update on meals
  for each row execute function touch_updated_at();


create table meal_ingredients (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals (id) on delete cascade,
  -- Null where the cook wrote something that is not tracked stock.
  item_id uuid references inventory_items (id) on delete set null,
  name text not null,
  qty numeric(12, 2) not null default 1,
  unit text not null default 'units',
  created_at timestamptz not null default now()
);

comment on table meal_ingredients is 'What a dish needs. Checked against stock while the menu is written, not at the shop.';

create index meal_ingredients_meal_idx on meal_ingredients (meal_id);
create index meal_ingredients_item_idx on meal_ingredients (item_id);


-- ---------- waste ----------

create table waste_entries (
  id uuid primary key default gen_random_uuid(),
  wasted_on date not null,
  meal_id uuid references meals (id) on delete set null,
  description text not null,
  reason text not null default '',
  approx_value numeric(12, 2),
  by_id text not null references profiles (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint waste_value_not_negative check (approx_value is null or approx_value >= 0)
);

comment on table waste_entries is 'What got thrown away and why. Append-only: the point is the pattern over a month, not the individual bin.';

create index waste_date_idx on waste_entries (wasted_on desc);


-- ---------- the laundry rota ----------

create table laundry_slots (
  id uuid primary key default gen_random_uuid(),
  -- 0 = Sunday, matching JavaScript's getDay() and every other dow in
  -- this schema.
  dow smallint not null,
  -- A name, not a profile id. Half the rota is household members who
  -- have no account, and the other half is 'Household' meaning everyone.
  person text not null,
  load_type text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint laundry_dow_range check (dow between 0 and 6)
);

comment on table laundry_slots is 'Whose washing goes on which day. Names rather than profile ids, because half of it is household members with no account.';

create index laundry_dow_idx on laundry_slots (dow, sort_order);
