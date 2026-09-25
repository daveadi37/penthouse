-- ============================================================
-- The house's starting rows. Run once, after every migration.
--
-- This is not example data. It is apartment 3808 as it actually is: the
-- seven people, the twelve rooms, the hierarchy, the stock that is
-- counted, and the standing line on the buy list.
--
-- Two things it deliberately does not do:
--
--   It does not create logins. A row in profiles is not a way to sign
--   in. Passwords are set from inside the app, by an owner, through the
--   admin-users Edge Function — see docs/DEPLOY.md step 3.
--
--   It does not invent a history. There are no fabricated ticks, no
--   made-up spending and no seeded issues, because a fabricated record
--   of who cleaned what last Tuesday is worse than an empty one. The
--   first real day is the first day somebody uses it.
--
-- The people, the rooms and the capability grid below are the same house
-- as src/seed/people.ts, src/seed/premises.ts and src/seed/roles.ts. Two
-- copies of one household is a real cost, and the only thing that keeps
-- them honest is that they are checked against each other by hand when
-- either changes. They have drifted before.
--
-- Safe to re-run: every insert is ON CONFLICT DO NOTHING or an upsert.
-- ============================================================

begin;

-- ---------- the hierarchy ----------

insert into roles (id, name, rank, description, works, is_system) values
  ('owner',   'Owner',         100, 'The family principals. Everything, including owner-only spending and documents, and the power to create logins.', false, true),
  ('admin',   'Admin',          90, 'Runs the app on the household''s behalf. Everything an owner can do except see owner-only money and documents.', false, true),
  ('manager', 'House manager',  70, 'In charge of the day. Assigns the work, keeps the buy list honest, closes issues. Sees household spending but not the owner''s.', false, true),
  ('staff',   'Staff',          50, 'Lives the day. Marvin and Rosie. Ticks the work off, counts the stock and marks what has been bought, reports anything broken, and is in the house chat like everyone else.', true, true),
  ('helper',  'Helper',         30, 'Paid by the hour or on site for a session — anyone brought in for an occasion. Sees the day, ticks their own work, can say something is wrong.', true, true),
  ('family',  'Family',         20, 'Lives here and is not staff. Sees what is happening, can say something is broken, and is in the house chat. No staff records, no money.', false, true)
on conflict (id) do nothing;


-- The capability grid. Written as a cross join against a list rather
-- than sixty INSERT lines, so a reader can see the shape of each role
-- in one place instead of counting rows.
--
-- Every role has chat.view and chat.post. The house chat is the one
-- screen that is not about rank: a driver noticing a delivery has gone
-- to the wrong door needs to be able to say so to everybody at once, and
-- a thread only some people can speak in stops being where things get
-- said.
insert into role_capabilities (role_id, capability)
select 'owner', c from unnest(enum_range(null::capability)) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'admin', c from unnest(enum_range(null::capability)) c
where c not in ('money.viewOwner', 'documents.viewOwner')
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'manager', c from unnest(array[
  'day.view', 'day.tick', 'day.assign', 'library.edit',
  'issue.raise', 'issue.viewAll', 'issue.manage',
  'inventory.view', 'inventory.edit',
  'cooking.view', 'cooking.edit', 'cooking.approve',
  'money.view',
  'property.view', 'property.edit',
  'register.view', 'register.edit',
  'people.view', 'people.manage',
  'occasions.view', 'occasions.edit',
  'chat.view', 'chat.post',
  'documents.view',
  'audit.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'staff', c from unnest(array[
  'day.view', 'day.tick',
  'issue.raise', 'issue.viewAll',
  'inventory.view', 'inventory.edit',
  'cooking.view', 'cooking.edit',
  'register.view', 'register.edit',
  'occasions.view',
  'chat.view', 'chat.post',
  'documents.view'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'helper', c from unnest(array[
  'day.view', 'day.tick',
  'issue.raise',
  'inventory.view',
  'cooking.view',
  'chat.view', 'chat.post'
]::capability[]) c
on conflict do nothing;

insert into role_capabilities (role_id, capability)
select 'family', c from unnest(array[
  'day.view',
  'issue.raise',
  'cooking.view',
  'occasions.view',
  'chat.view', 'chat.post'
]::capability[]) c
on conflict do nothing;


-- ---------- the people ----------

-- Shrien owns the home and is in the UK. Aditya owns it too and works
-- from it, which is why his diet is on his profile rather than in a note
-- somewhere: the Cooking screen reads it off here when portions are
-- worked out, so nobody has to remember it on a day Rosie is busy.
--
-- Two staff, and that is the whole payroll. Anyone else who appears in
-- this house is a vendor or a helper brought in for one occasion, and
-- neither of those belongs on this list.
--
-- Real email addresses are needed for the accounts that will exist. The
-- @3808.local ones below are placeholders and must be replaced before
-- the logins are created — an account cannot be made against an address
-- that does not resolve.
insert into profiles (id, name, role, staff_roles, email, phone, initials, diet, active, can_sign_in, is_household_member) values
  ('p-shrien',  'Shrien',       'owner',   '{}',                     'shrien@3808.local',               '+971 50 000 0001', 'SH', '',                                                            true, true,  true),
  ('p-aditya',  'Aditya Dave',  'owner',   '{}',                     'aditya.dave@evolvecaregroup.com', '+971 50 000 0002', 'AD', 'Vegetarian — no meat, no fish, no eggs. Dairy is fine.',      true, true,  true),
  ('p-earl',    'Earl Tiongco', 'manager', '{}',                     'earl@3808.local',                 '+971 50 000 0003', 'ET', '',                                                            true, true,  false),
  ('p-rosie',   'Rosie',        'staff',   '{housekeeping,cooking}', 'rosie@3808.local',                '+971 50 000 0011', 'RO', '',                                                            true, true,  false),
  ('p-marvin',  'Marvin',       'staff',   '{driver}',               'marvin@3808.local',               '+971 50 000 0013', 'MA', '',                                                            true, true,  false),
  ('p-salyna',  'Salyna',       'family',  '{}',                     'salyna@3808.local',               '+971 50 000 0021', 'SA', '',                                                            true, true,  true),
  ('p-charlie', 'Charlie',      'family',  '{}',                     'charlie@3808.local',              '+971 50 000 0022', 'CH', '',                                                            true, true,  true),
  ('p-aria',    'Aria',         'family',  '{}',                     '',                                '',                 'AR', '',                                                            true, false, true),
  ('p-noor',    'Noor',         'family',  '{}',                     '',                                '',                 'NO', '',                                                            true, false, true)
on conflict (id) do nothing;


-- Rosie lives in and works a long day; Marvin's is bracketed by the two
-- school runs. Each has one day off, and they are different days on
-- purpose — that is what makes the coverage rules below do real work
-- rather than pointing at somebody who is also away.
insert into shifts (id, staff_id, days, start_time, end_time, day_off) values
  (gen_random_uuid(), 'p-rosie',  '{0,2,3,4,5,6}', '07:00', '19:00', 1),
  (gen_random_uuid(), 'p-marvin', '{0,1,2,4,5,6}', '08:00', '18:00', 3)
on conflict do nothing;

-- With two staff, cover is mostly the two of them covering each other,
-- and the one thing neither can cover is driving on Marvin's day off —
-- which is why that rule points at Earl and says so out loud.
insert into coverage_rules (id, role, zone, cover_staff_id, notes) values
  (gen_random_uuid(), 'driver',       'any',       'p-earl',   'On Marvin''s day off Earl books the school run and any pickup. Nobody else in the house drives.'),
  (gen_random_uuid(), 'housekeeping', 'household', 'p-marvin', 'Essential household tasks only on Rosie''s day off — bins, bathrooms, the cat.'),
  (gen_random_uuid(), 'maintenance',  'household', 'p-marvin', 'Small repairs and anything that needs carrying. Anything electrical or plumbed goes to a vendor, not to Marvin.'),
  (gen_random_uuid(), 'cooking',      'household', 'p-marvin', 'Reheating what Rosie left only. Anything else, the household orders in.')
on conflict do nothing;


-- ---------- the house ----------

insert into settings (
  id, house, address,
  currency, locale, meal_times, portion_default,
  working_days, working_start, working_end,
  alert_lead_days, laundry_stages, unused_dows, plan_start, plan_end, parity_epoch
) values (
  true,
  'Goldcrest Views 3808',
  'Goldcrest Views 1, Jumeirah Lakes Towers, Cluster V, Dubai',
  'AED',
  'en-AE',
  '{"Breakfast": "08:00", "Lunch": "13:30", "Dinner": "19:30"}'::jsonb,
  4,
  -- Sunday to Thursday. Deliveries, vendors and the school run keep to
  -- it; the house itself runs seven days a week.
  '{0,1,2,3,4}', '09:00', '18:00',
  30,
  '{Wash,Dry,Fold,Iron,"Put away"}',
  '{1,5}',
  '06:00', '22:00',
  '2026-08-24'
)
on conflict (id) do nothing;


-- One household on one floor. Every area below is inside 3808, and the
-- standards read as they do because it is also where Aditya works — the
-- lounge and the dining room are both a home and a place someone takes a
-- call from.
insert into areas (id, name, type, zone, floor, status, deep_freq, deep_dow, parity, use_level, standard) values
  ('a-lv1', 'Lounge',             'living',      'household', '38', 'active',   14, 3, 0, null,   'Cushions plumped, surfaces clear, no cooking smell, lights set warm for the evening.'),
  ('a-lv2', 'Dining Room',        'living',      'household', '38', 'active',   14, 3, 1, null,   'Table laid to standard, chairs aligned and evenly spaced.'),
  ('a-kt1', 'Kitchen',            'kitchen',     'household', '38', 'active',    7, 4, 0, null,   'Empty countertops, dry sink, polished tap. Vegetarian food prepared with its own board and pan, never the ones meat has been on.'),
  ('a-ba3', 'Guest Toilet',       'bathroom',    'household', '38', 'active',    7, 2, 0, 'high', 'Spotless and stocked. Checked again at midday — it is the one a visitor uses.'),
  ('a-br1', 'Master Bedroom',     'bedroom',     'household', '38', 'occupied', 14, 1, 0, null,   'Symmetrical, calm, no personal clutter visible from the doorway.'),
  ('a-br2', 'Bedroom 2',          'bedroom',     'household', '38', 'occupied', 14, 2, 0, null,   'Symmetrical, calm, no personal clutter visible from the doorway.'),
  ('a-br3', 'Bedroom 3 — Guest',  'bedroom',     'household', '38', 'guest',    14, 3, 1, null,   'Kept permanently guest-ready, whether or not anyone is expected.'),
  ('a-ot1', 'Balcony — main',     'outdoor',     'household', '38', 'active',   14, 6, 0, null,   'No sand or leaf litter, furniture square, glass clear. Late afternoon, once the sun is off it.'),
  ('a-ot2', 'Balcony — second',   'outdoor',     'household', '38', 'active',   14, 6, 1, null,   'Swept and clear. Keep the door shut — it is the draught that blows the lounge doors about.'),
  ('a-cr1', 'Entrance & Hallway', 'circulation', 'household', '38', 'active',    7, 5, 0, null,   'First thing a guest sees. Shoes off here. Floor dry, glass clear, nothing stored here.'),
  ('a-ut1', 'Laundry & Utility',  'utility',     'household', '38', 'active',   14, 6, 0, null,   'Machines wiped, filters clear, floor dry, nothing left in a drum overnight.'),
  ('a-st2', 'Store',              'storage',     'household', '38', 'active',   30, 6, 0, null,   'Stock visible and countable from the door. Nothing stacked in front of anything else — a count you cannot do from the doorway does not get done.')
on conflict (id) do nothing;


-- ---------- how the work is grouped ----------

insert into task_categories (id, name, icon, sort_order, zone, system, active) values
  ('c-open',     'Opening up',         '🌅',  1, 'household', null,        true),
  ('c-kitchen',  'Kitchen',            '🍳',  2, 'household', null,        true),
  ('c-bath',     'Bathrooms',          '🛁',  3, 'household', null,        true),
  ('c-bed',      'Bedrooms',           '🛏',  4, 'household', null,        true),
  ('c-living',   'Living areas',       '🛋',  5, 'household', null,        true),
  ('c-outdoor',  'Outside',            '🌿',  6, 'household', null,        true),
  ('c-cat',      'Cat care',           '🐱',  7, 'household', null,        true),
  ('c-close',    'Close-down',         '🌙',  8, 'household', null,        true),
  ('c-laundry',  'Laundry',            '🧺',  9, 'household', 'laundry',   true),
  ('c-cooking',  'Cooking',            '👨‍🍳', 10, 'household', 'cooking',   true),
  ('c-occasion', 'Occasions',          '✦',  11, 'household', 'occasion',  true),
  ('c-plants',   'Plants',             '🪴', 12, 'household', 'plants',    true),
  ('c-contract', 'Contracts & visits', '🔧', 13, 'household', 'contracts', true)
on conflict (id) do nothing;


-- The starting task library. Small on purpose. Everything here is
-- something the house standards already say out loud; anything else is
-- for Earl and Rosie to add from the app, where adding a task and having
-- it appear every day from then on is a two-minute job rather than a
-- code change.
insert into library_tasks (id, category_id, text, apply, area_type, area_id, zone, freq, dow, parity, instructions, role, default_time, est_minutes, group_as, light, sort_order) values
  ('lt-open-house',   'c-open',    'Open up — blinds, air the rooms, first pass of the hall', 'global',   null,       null,    'household', 'daily',    0, 0, 'The house should look ready before anyone comes downstairs. No cooking smell in the lounge. Shoes off at the entrance.', 'housekeeping', '07:00', 15, 'Opening up', false, 0),
  ('lt-shopping-list','c-open',    'Write today''s buy list',                                 'global',   null,       null,    'household', 'daily',    0, 0, 'By 09:00, so Marvin has it before the morning run. Anything below its minimum is already on the list — this is for everything else. Check the yoghurt first: only buy it if it is finished or nearly.', 'housekeeping', '09:00', 10, 'Opening up', false, 1),

  ('lt-kitchen-reset','c-kitchen', 'Kitchen reset — counters, sink, tap',                     'area',     null,       'a-kt1', 'household', 'daily',    0, 0, 'Empty countertops, dry sink, polished tap. Aditya''s food is vegetarian: his board and pan are the ones meat has never been on.', 'cooking', '10:00', 20, 'Kitchen', false, 0),
  ('lt-kitchen-close','c-kitchen', 'Kitchen back to normal after the meal',                   'area',     null,       'a-kt1', 'household', 'daily',    0, 0, 'Leftovers covered, labelled and dated. A container with no date on it gets thrown away, so the label is the whole job.', 'cooking', '21:45', 25, 'Close-down', false, 1),

  ('lt-guest-wc',     'c-bath',    'Guest toilet — clean and restock',                        'area',     null,       'a-ba3', 'household', 'daily',    0, 0, 'Spotless and stocked. Checked again at midday — it is the one a visitor uses.', 'housekeeping', '13:00', 10, 'Bathrooms', false, 0),
  ('lt-bath-daily',   'c-bath',    'Bathroom — surfaces, mirror, floor',                      'areaType', 'bathroom', null,    'household', 'daily',    0, 0, '', 'housekeeping', '11:00', 12, 'Bathrooms', true,  1),

  ('lt-bed-daily',    'c-bed',     'Make the bed and clear surfaces',                         'areaType', 'bedroom',  null,    'household', 'daily',    0, 0, 'Symmetrical, calm, nothing personal visible from the doorway. Stand at the door and look before you leave it.', 'housekeeping', '10:30', 12, 'Bedrooms', true, 0),
  ('lt-bed-deep',     'c-bed',     'Deep clean the room',                                     'areaType', 'bedroom',  null,    'household', 'areaDeep', 0, 0, 'Lift objects, do not clean around them. Under the bed and along the edges.', 'housekeeping', null,   45, 'Bedrooms', false, 1),

  ('lt-living',       'c-living',  'Living area — cushions, surfaces, floor',                 'areaType', 'living',   null,    'household', 'daily',    0, 0, 'Dining room and lounge clear and tidy before the first guest arrives. No cat bowls or cleaning things on show.', 'housekeeping', '11:30', 15, 'Living areas', false, 0),
  ('lt-hall',         'c-living',  'Entrance and hallway',                                    'area',     null,       'a-cr1', 'household', 'daily',    0, 0, 'The first thing a guest sees. Floor dry, glass clear, nothing stored here.', 'housekeeping', '11:45', 10, 'Living areas', false, 1),

  ('lt-balcony',      'c-outdoor', 'Balcony — sweep and square the furniture',                'areaType', 'outdoor',  null,    'household', 'daily',    0, 0, 'Late afternoon, once the sun is off it. Keep the second balcony door shut — it is the draught that blows the lounge doors about.', 'housekeeping', '17:00', 15, 'Outside', false, 0),

  ('lt-ken-feed',     'c-cat',     'Feed Ken and refresh his water',                          'global',   null,       null,    'household', 'daily',    0, 0, 'Bowls washed with the sponge kept only for the cat. While you are there: eating, drinking, moving normally, eyes and nose clear.', 'housekeeping', '07:45', 5, 'Ken', false, 0),
  ('lt-ken-tray',     'c-cat',     'Ken''s tray',                                             'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '08:00', 5, 'Ken', false, 1),

  ('lt-bins',         'c-close',   'Empty every bin',                                         'global',   null,       null,    'household', 'daily',    0, 0, '', 'housekeeping', '21:50', 10, 'Close-down', false, 0),
  ('lt-photos',       'c-close',   'Post the day''s photographs to the house chat',           'global',   null,       null,    'household', 'daily',    0, 0, 'R18. The photograph existing is not the point — it being somewhere everyone can see it is the point.', 'housekeeping', '22:05', 5, 'Close-down', false, 1),
  ('lt-cash',         'c-close',   'Log any cash spent, with receipts',                       'global',   null,       null,    'household', 'daily',    0, 0, 'R19. Photograph the receipt as you log it, not later.', 'housekeeping', '22:10', 5, 'Close-down', false, 2),
  ('lt-tell-earl',    'c-close',   'Anything broken, missing or missed — tell Earl',          'global',   null,       null,    'household', 'daily',    0, 0, 'R20. The same day. Not tomorrow.', 'housekeeping', '22:15', 5, 'Close-down', false, 3),

  ('lt-store',        'c-close',   'Store — stock visible and countable from the door',       'area',     null,       'a-st2', 'household', 'weekly',   6, 0, 'Nothing stacked in front of anything else. A count you cannot do from the doorway does not get done.', 'housekeeping', null, 20, 'Store', false, 4)
on conflict (id) do nothing;


-- ---------- stock ----------

insert into inventory_categories (id, name, zone, sort_order) values
  ('ic-kitchen', 'Kitchen & pantry', 'household', 1),
  ('ic-clean',   'Cleaning',         'household', 2),
  ('ic-laundry', 'Laundry',          'household', 3),
  ('ic-bath',    'Bathroom',         'household', 4),
  ('ic-cat',     'Ken',              'household', 5)
on conflict (id) do nothing;

-- A starting count, not a full pantry. These are the rows that carry a
-- minimum worth having on day one: each one is something that has been
-- run out of, and min_qty is set at what should still be left when the
-- next shop happens rather than at zero. Below the minimum the line puts
-- itself on the buy list, which is the point of counting anything.
insert into inventory_items (name, category_id, zone, qty, min_qty, unit, recurring, notes) values
  ('Fresh milk',        'ic-kitchen', 'household',  2,  2, 'litres',  true,  'Low fat. Bought daily.'),
  ('Yoghurt',           'ic-kitchen', 'household',  1,  1, 'kg',      true,  'Checked daily — only buy if finished or nearly finished.'),
  ('Basmati rice',      'ic-kitchen', 'household',  5,  2, 'kg',      false, ''),
  ('Atta',              'ic-kitchen', 'household',  2,  1, 'bags',    true,  'Rosie makes the breads fresh, so this moves faster than it looks.'),
  ('Cooking oil',       'ic-kitchen', 'household',  2,  1, 'bottles', true,  ''),
  ('Toilet paper',      'ic-bath',    'household', 24, 12, 'rolls',   true,  ''),
  ('Bin bags',          'ic-clean',   'household', 60, 30, 'units',   true,  ''),
  ('Laundry detergent', 'ic-laundry', 'household',  3,  2, 'bottles', true,  ''),
  ('Cat litter',        'ic-cat',     'household',  3,  2, 'bags',    true,  'Same brand — Ken will not use the other one.')
on conflict do nothing;


-- The standing line on the buy list. Standing means it is there every
-- day whether or not anybody adds it, and marking it purchased records
-- the run rather than clearing the row — the milk is needed again
-- tomorrow. Everything else on the list arrives one of the other two
-- ways: somebody adds it, or an item above falls below its minimum.
insert into shopping_items (name, zone, qty, unit, status, added_by, notes, standing) values
  ('Daily items — milk and yoghurt', 'household', 1, 'run', 'needed', 'p-rosie', '2L low-fat fresh milk, 1kg yoghurt. Marvin. Check the yoghurt first — only buy it if it is finished or nearly finished.', true)
on conflict do nothing;


-- ---------- how spending is grouped ----------

-- Seeded because transactions point at these with a RESTRICT foreign
-- key: without them the Money screen opens empty and the first payment
-- anybody tries to enter is refused.
insert into expense_categories (id, name, kind, zone, sort_order) values
  ('ec-groc',     'Groceries & food',       'household',   'household',  1),
  ('ec-hclean',   'Cleaning & consumables', 'supplies',    'household',  2),
  ('ec-cat',      'Ken',                    'household',   'household',  3),
  ('ec-hmaint',   'Maintenance & repairs',  'maintenance', 'household',  4),
  ('ec-util',     'Utilities',              'utilities',   'household',  5),
  ('ec-veh',      'Vehicles',               'vehicle',     'household',  6),
  ('ec-staff',    'Staff costs',            'staff',       'household',  7),
  ('ec-contract', 'Service contracts',      'maintenance', 'household',  8),
  ('ec-guest',    'Guests & entertaining',  'household',   'household',  9),
  ('ec-other',    'Other',                  'other',       'household', 10)
on conflict (id) do nothing;


-- ---------- the laundry rota ----------

insert into laundry_slots (dow, person, load_type, sort_order) values
  (0, 'Household', 'Catch-up & anything outstanding', 0),
  (1, 'Salyna',    'Clothing',                        0),
  (2, 'Charlie',   'Clothing',                        0),
  (3, 'Aria',      'Clothing',                        0),
  (4, 'Noor',      'Clothing',                        0),
  (5, 'Household', 'Towels',                          0),
  (6, 'Household', 'Bedding',                         0)
on conflict do nothing;


-- ---------- notification preferences ----------

-- Everybody gets everything, quiet from 22:00 to 06:30, until they say
-- otherwise. Defaulting people out of notifications means an app nobody
-- trusts to tell them anything.
insert into notification_prefs (profile_id)
select id from profiles where can_sign_in
on conflict (profile_id) do nothing;


-- ---------- today ----------

-- Build today and tomorrow, so the app opens on something real rather
-- than on an empty state that looks broken. From then on the 05:00 job
-- in 20260828001500_functions_cron.sql does it.
select build_day(current_date);
select build_day(current_date + 1);


commit;
