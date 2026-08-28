-- ============================================================
-- Stock, shopping, meals and waste.
--
-- Two flags on inventory carry rules from the running sheet that exist
-- nowhere else in the schema, and both of them matter more than they
-- look:
--
--   prayer_item — brought for prayer, marked on the lid, and never used
--   for consumption. A prayer-marked litre of milk is not a litre of
--   milk you have. If a container is not marked, the sheet says treat
--   it as prayer stock and ask.
--
--   shrine_only — the shrine cloth and the shrine sponge. The cloth
--   never meets a spray or a chemical; the sponge never meets meat or
--   the normal washing-up. If either cannot be found, the instruction
--   is to say so and wait, not to substitute.
--
-- meals carries the food rule. During the observance nothing on the
-- menu may contain meat, fish or eggs, and that is checked in the app
-- before a meal can be approved (src/lib/foodrule.ts). It is not
-- checked here, because the rule has dates and this table does not know
-- them — see the approval trigger at the foot of this file, which does.
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
  -- R6. Brought for prayer, marked, and never used for consumption.
  prayer_item boolean not null default false,
  -- R7. The shrine cloth and the shrine sponge. Never meat, never chemicals.
  shrine_only boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_qty_not_negative check (qty >= 0),
  constraint inventory_min_not_negative check (min_qty >= 0),
  -- Nothing is both brought for prayer and a shrine cleaning item. One
  -- is consumed and set aside; the other is equipment.
  constraint inventory_flags_exclusive check (not (prayer_item and shrine_only))
);

comment on table inventory_items is 'Everything counted. Two flags carry rules from the running sheet: prayer_item and shrine_only.';
comment on column inventory_items.prayer_item is 'R6. Marked and never used for consumption. Excluded from what counts as available.';
comment on column inventory_items.shrine_only is 'R7. The shrine cloth and sponge. Never a spray, never meat, never substituted.';
comment on column inventory_items.min_qty is 'Below this it lands on the shopping list. Divo oil sits at 2 for a reason — it burns down over about three days.';

create index inventory_category_idx on inventory_items (category_id) where active;
create index inventory_low_idx on inventory_items (qty) where active;
create index inventory_prayer_idx on inventory_items (prayer_item) where prayer_item;

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
  -- The three rows printed on every running sheet: the daily milk and
  -- yoghurt, the divo oil, and the flowers, incense, matches and wicks.
  -- Standing rows are never cleared off the list.
  standing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_purchased_has_date
    check ((status = 'purchased') = (purchased_at is not null))
);

comment on table shopping_items is 'What needs buying. The three standing rows are printed on every sheet and are never cleared.';
comment on column shopping_items.standing is 'R12. The milk and yoghurt run, the divo oil, and the flowers, incense, matches and wicks.';

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
  -- how the wrong food reaches a table on a prayer day.
  constraint meals_approval_attributed
    check (status not in ('Approved', 'Prepared', 'Completed') or approved_by is not null),
  -- Changes requested without saying what changes is not feedback.
  constraint meals_changes_explained
    check (status <> 'Changes requested' or length(trim(feedback)) > 0)
);

comment on table meals is 'The menu, by sitting. Status is a workflow — Draft, Submitted, Approved, Prepared, Completed — and approval is attributed by constraint.';
comment on column meals.diet is 'What must not be in it. During the observance this reads "vegetarian" and the app enforces it before approval.';

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


-- ---------- the food rule, in the database ----------

-- The app checks this before it offers the Approve button
-- (src/lib/foodrule.ts). This trigger is the second line, for the same
-- reason every capability is checked twice: a rule that only exists in
-- the interface is a rule that exists until somebody uses the API.
--
-- Deliberately narrow. It fires on approval only, not on drafting —
-- writing down a dish to think about is not the same as putting it on
-- the table, and a cook typing "no eggs" into the diet note should not
-- be fought with.
create or replace function enforce_food_rule() returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  banned constant text :=
    '\y(chicken|murgh|lamb|mutton|gosht|beef|steak|veal|pork|bacon|ham|gammon|sausage|chorizo|pepperoni|salami|duck|turkey|quail|fish|salmon|tuna|cod|hamour|sardine|anchovy|prawn|shrimp|crab|lobster|squid|calamari|shellfish|egg|eggs|omelette|shakshuka|meringue|mince|keema|kofta|kebab|gelatin|gelatine)\y';
  s settings%rowtype;
  offending text;
begin
  if new.status not in ('Approved', 'Prepared', 'Completed') then
    return new;
  end if;

  select * into s from settings limit 1;
  if s.observance_from is null
     or new.served_on < s.observance_from
     or new.served_on > s.observance_to then
    return new;
  end if;

  select string_agg(hit, ', ')
    into offending
    from (
      select new.name as hit where new.name ~* banned
      union all
      select i.name from meal_ingredients i where i.meal_id = new.id and i.name ~* banned
    ) t;

  if offending is not null then
    raise exception
      'FOOD RULE — THIS IS NOT OPTIONAL. % falls inside the observance (% to %), and this menu has: %. All food is vegetarian: no meat, no fish, no eggs. Milk, cheese, yoghurt and butter are fine.',
      new.served_on, s.observance_from, s.observance_to, offending
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function enforce_food_rule() is
  'Refuses to approve a meal containing meat, fish or eggs on a date inside the observance. The second of two checks; the first is in the app, before the button is offered.';

create trigger meals_food_rule before insert or update on meals
  for each row execute function enforce_food_rule();


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
